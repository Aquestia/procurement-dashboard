// Web Worker for Excel processing - runs in background thread
importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js')

self.onmessage = function(e) {
  try {
    const buffer = e.data
    const result = processExcelFile(buffer)
    self.postMessage({ success: true, data: result })
  } catch (err) {
    self.postMessage({ success: false, error: err.message })
  }
}

function processExcelFile(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  const calcAlloc = parseSheet(workbook, 'Calculated allocation')
  const boSheet = parseSheet(workbook, 'BO')
  const openPO = parseSheet(workbook, 'Open purchase order lines')
  const dr4Sheet = parseSheet(workbook, 'DR4')
  const dr5Sheet = parseSheet(workbook, 'DR5')

  const boSet = buildBOSet(boSheet)
  const poByItem = buildPOByItem(openPO)
  const dr4Map = buildDRMap(dr4Sheet)
  const dr5Map = buildDRMap(dr5Sheet)

  return buildShortages(calcAlloc, boSet, poByItem, dr4Map, dr5Map)
}

function parseSheet(workbook, name) {
  let sheetName = workbook.SheetNames.find(n => n === name)
  if (!sheetName) sheetName = workbook.SheetNames.find(n => n.toLowerCase() === name.toLowerCase())
  if (!sheetName) sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes(name.toLowerCase()))
  if (!sheetName) return []

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null })
  if (!rows || rows.length < 2) return []

  const headers = rows[0].map((h, i) => h ? String(h).trim() : `col_${i}`)
  return rows.slice(1).filter(r => r.some(v => v !== null)).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? null })
    return obj
  })
}

function fmtDate(v) {
  if (!v) return null
  try {
    const d = v instanceof Date ? v : new Date(v)
    if (isNaN(d.getTime())) return null
    return d.toISOString()
  } catch { return null }
}

function str(v) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function buildBOSet(boRows) {
  const boItems = new Set()
  const boOrders = new Set()
  boRows.forEach(r => {
    const item = str(r['Item Code'])
    const doc = str(r['Doc'])
    const line = r['Line'] !== null && r['Line'] !== undefined ? String(r['Line']).split('.')[0].trim() : ''
    const sl = str(r['S & L']).replace(/\s+/g, '')
    if (item) boItems.add(item)
    if (doc && line) boOrders.add(`${doc}-${line}`)
    if (sl) boOrders.add(sl)
  })
  return { boItems, boOrders }
}

function buildPOByItem(openPO) {
  const map = {}
  openPO.forEach(r => {
    const item = str(r['Item number'])
    if (!item) return
    if (!map[item]) map[item] = []
    map[item].push({
      purchaseOrder: str(r['Purchase order']),
      vendorName: str(r['Vendor name']),
      quantity: r['Quantity'] || 0,
      deliverRemainder: r['Deliver remainder'] || 0,
      confirmedReceiptDate: fmtDate(r['Confirmed receipt date']),
      requestedReceiptDate: fmtDate(r['Requested receipt date']),
      approvalStatus: str(r['Approval status']),
      hasMissingDate: str(r['חסר תאריך ']).length > 0,
      poNote: str(r['PO Note']),
    })
  })
  return map
}

function buildDRMap(drRows) {
  const parentToProd = {}
  const prodToParent = {}
  drRows.forEach(r => {
    const parent = str(r['Parent production order '] || r['Parent production order'] || '')
    const prod = str(r['Production order'] || '')
    if (!prod) return
    if (parent) {
      if (!parentToProd[parent]) parentToProd[parent] = []
      parentToProd[parent].push(prod)
      prodToParent[prod] = parent
    }
  })
  return { parentToProd, prodToParent }
}

function determineStage(references, dr4Map, dr5Map) {
  for (const ref of references) {
    if (!ref) continue
    if (ref.startsWith('PRD')) return 'PRD'
    if (ref.startsWith('SOIL')) return 'הזמנה ישירה'
    if (dr4Map.prodToParent[ref]) {
      const inDR5 = dr5Map.prodToParent[ref]
      return inDR5 ? 'DR4→DR5' : 'DR4'
    }
    if (dr4Map.parentToProd[ref]) return 'DR4'
    if (dr5Map.prodToParent[ref]) {
      const inDR4 = dr4Map.prodToParent[ref]
      return inDR4 ? 'DR5→DR4' : 'DR5'
    }
    if (dr5Map.parentToProd[ref]) return 'DR5'
  }
  return 'לא ידוע'
}

function buildShortages(calcAlloc, boSet, poByItem, dr4Map, dr5Map) {
  const { boItems, boOrders } = boSet
  const itemMap = {}

  calcAlloc.forEach(r => {
    const item = str(r['Item number'])
    if (!item) return

    const salesOrder = str(r['Sales order'])
    const rawLine = r['Line number'] !== null && r['Line number'] !== undefined
      ? String(r['Line number']).split('.')[0].trim() : ''
    const slKey = `${salesOrder}-${rawLine}`
    const reference = str(r['Reference'] || '')
    const number2 = str(r['Number2'] || '')

    const isBO = boItems.has(item) ||
      boOrders.has(slKey) ||
      str(r['BO']).toLowerCase() === 'yes' ||
      str(r['BO']) === 'כן'

    const shortageExist = str(r['Shortage exist']).toLowerCase() === 'yes'
    if (!shortageExist && !isBO) return

    if (!itemMap[item]) {
      itemMap[item] = {
        itemNumber: item,
        productName: str(r['Product name']),
        isBO: false,
        orders: [],
        references: [],
        totalQtyRequired: 0,
        totalQtyPicked: 0,
        totalOnOrder: 0,
        totalAvailable: 0,
        totalReserved: 0,
      }
    }

    const entry = itemMap[item]
    if (isBO) entry.isBO = true
    if (reference && !entry.references.includes(reference)) entry.references.push(reference)
    if (number2 && number2 !== reference && !entry.references.includes(number2)) entry.references.push(number2)

    if (salesOrder && !entry.orders.find(o => o.salesOrder === salesOrder && o.lineNumber === rawLine)) {
      entry.orders.push({
        salesOrder, lineNumber: rawLine, slKey,
        customerName: str(r['Customer Name'] || r['Customer name2'] || ''),
        confirmedShipDate: fmtDate(r['Confirmed ship date']),
        requestedShipDate: fmtDate(r['Requested ship date']),
        confirmedShipMonth: str(r['Confirmed Ship Month']),
        requestedShipMonth: str(r['Requested Ship Month']),
        isBO,
        pool: str(r['Pool']),
        remainingAmount: r['Remainig amount main currency'] || 0,
        qtyRequired: r['Requested quantity'] || 0,
        qtyPicked: r['Picked quantity'] || 0,
        onOrder: r['On order'] || 0,
        available: r['Available physical'] || 0,
        reserved: r['Reserved physical'] || 0,
        qtyAllocated: r['Quantity allocated'] || 0,
        openPurchaseOrders: str(r['Open Purchase Orders']),
        reference,
      })
    }

    entry.totalQtyRequired += (r['Requested quantity'] || 0)
    entry.totalQtyPicked += (r['Picked quantity'] || 0)
    entry.totalOnOrder += (r['On order'] || 0)
    entry.totalAvailable += (r['Available physical'] || 0)
    entry.totalReserved += (r['Reserved physical'] || 0)
  })

  return Object.values(itemMap).map(item => {
    const stage = determineStage(item.references, dr4Map, dr5Map)
    const pos = poByItem[item.itemNumber] || []
    const hasPO = pos.length > 0
    const totalOrdered = pos.reduce((s, p) => s + (p.deliverRemainder || 0), 0)
    const nextReceipt = pos.filter(p => p.confirmedReceiptDate)
      .sort((a, b) => new Date(a.confirmedReceiptDate) - new Date(b.confirmedReceiptDate))[0]
    const hasNoDate = hasPO && pos.every(p => !p.confirmedReceiptDate)
    const vendors = [...new Set(pos.map(p => p.vendorName).filter(Boolean))]

    let procurementStatus = 'תקין'
    if (item.isBO) procurementStatus = 'BO'
    else if (!hasPO || hasNoDate) procurementStatus = 'בסכנה'

    const boOrders_ = item.orders.filter(o => o.isBO)

    return {
      itemNumber: item.itemNumber,
      productName: item.productName,
      isBO: item.isBO,
      procurementStatus,
      stage,
      references: item.references,
      orders: item.orders,
      boOrders: boOrders_,
      affectedOrdersCount: item.orders.length,
      boOrdersCount: boOrders_.length,
      totalQtyRequired: item.totalQtyRequired,
      totalQtyPicked: item.totalQtyPicked,
      totalOnOrder: item.totalOnOrder,
      totalAvailable: item.totalAvailable,
      totalReserved: item.totalReserved,
      shortage: Math.max(0, item.totalQtyRequired - item.totalQtyPicked - item.totalAvailable),
      hasPO, totalOrdered, hasNoDate, vendors,
      confirmedReceiptDate: nextReceipt?.confirmedReceiptDate || null,
      purchaseOrders: pos,
      totalRemainingAmount: item.orders.reduce((s, o) => s + (o.remainingAmount || 0), 0),
    }
  })
}
