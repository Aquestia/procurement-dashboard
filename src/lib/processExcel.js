import * as XLSX from 'xlsx'

export function processExcelFile(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  console.log('Sheet names:', workbook.SheetNames)

  const calcAlloc = parseSheetByName(workbook, 'Calculated allocation')
  const boSheet = parseSheetByName(workbook, 'BO')
  const openPO = parseSheetByName(workbook, 'Open purchase order lines')
  const dr4Sheet = parseSheetByName(workbook, 'DR4')
  const dr5Sheet = parseSheetByName(workbook, 'DR5')
  const openOrders = parseSheetByName(workbook, 'Open sales orders')

  console.log('calcAlloc rows:', calcAlloc.length)
  console.log('boSheet rows:', boSheet.length)
  console.log('openPO rows:', openPO.length)

  const boSet = buildBOSet(boSheet)
  const poByItem = buildPOByItem(openPO)
  const dr4Map = buildDRMap(dr4Sheet)
  const dr5Map = buildDRMap(dr5Sheet)
  const orderByPRD = buildOrderByPRD(openOrders)

  return buildShortages(calcAlloc, boSet, poByItem, dr4Map, dr5Map, orderByPRD)
}

function parseSheetByName(workbook, name) {
  // Try exact match first
  let sheetName = workbook.SheetNames.find(n => n === name)
  // Then case-insensitive
  if (!sheetName) sheetName = workbook.SheetNames.find(n => n.toLowerCase() === name.toLowerCase())
  // Then partial
  if (!sheetName) sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes(name.toLowerCase()))
  
  if (!sheetName) { console.warn('Sheet not found:', name); return [] }
  
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
    const line = r['Line'] !== null ? String(r['Line']).split('.')[0].trim() : ''
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
      documentStatus: str(r['Document status']),
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

function buildOrderByPRD(openOrders) {
  const prdToOrder = {}
  const slToOrder = {}
  openOrders.forEach(r => {
    const prod = str(r['Production'])
    const so = str(r['Sales order'])
    const line = r['Line number'] !== null ? String(r['Line number']).split('.')[0].trim() : ''
    const slKey = `${so}-${line}`
    const orderInfo = {
      salesOrder: so, lineNumber: line, slKey,
      itemNumber: str(r['Item number']),
      customer: str(r['Customer name']),
      confirmedShip: fmtDate(r['Confirmed ship date']),
      requestedShip: fmtDate(r['Requested ship date']),
    }
    if (prod) {
      if (!prdToOrder[prod]) prdToOrder[prod] = []
      prdToOrder[prod].push(orderInfo)
    }
    if (so && line) slToOrder[slKey] = orderInfo
  })
  return { prdToOrder, slToOrder }
}

function determineStage(references, dr4Map, dr5Map, orderByPRD) {
  const { prdToOrder } = orderByPRD
  const { parentToProd: dr4Parent, prodToParent: dr4Prod } = dr4Map
  const { parentToProd: dr5Parent, prodToParent: dr5Prod } = dr5Map

  for (const ref of references) {
    if (!ref) continue
    if (ref.startsWith('PRD')) {
      return { stage: 'PRD', linkedOrders: prdToOrder[ref] || [] }
    }
    if (ref.startsWith('SOIL')) {
      return { stage: 'הזמנה ישירה', linkedOrders: [] }
    }
    // In DR4?
    const dr4Parent_ = dr4Prod[ref]
    if (dr4Parent_) {
      const linkedOrders = prdToOrder[dr4Parent_] || []
      // Also in DR5?
      const inDR5 = dr5Prod[ref] || dr5Parent[ref]
      return { stage: inDR5 ? 'DR4→DR5' : 'DR4', linkedOrders }
    }
    if (dr4Parent[ref]) {
      return { stage: 'DR4', linkedOrders: [] }
    }
    // In DR5?
    const dr5Parent_ = dr5Prod[ref]
    if (dr5Parent_) {
      const linkedOrders = prdToOrder[dr5Parent_] || []
      const inDR4 = dr4Prod[ref] || dr4Parent[ref]
      return { stage: inDR4 ? 'DR5→DR4' : 'DR5', linkedOrders }
    }
    if (dr5Parent[ref]) {
      return { stage: 'DR5', linkedOrders: [] }
    }
  }
  return { stage: 'לא ידוע', linkedOrders: [] }
}

function buildShortages(calcAlloc, boSet, poByItem, dr4Map, dr5Map, orderByPRD) {
  const { boItems, boOrders } = boSet
  const { slToOrder } = orderByPRD
  const itemMap = {}

  calcAlloc.forEach(r => {
    const item = str(r['Item number'])
    if (!item) return

    const salesOrder = str(r['Sales order'])
    const rawLine = r['Line number'] !== null ? String(r['Line number']).split('.')[0].trim() : ''
    const slKey = `${salesOrder}-${rawLine}`
    const reference = str(r['Reference'] || '')
    const number2 = str(r['Number2'] || '')
    
    const isBO = boItems.has(item) ||
      boOrders.has(slKey) ||
      boOrders.has(salesOrder + rawLine) ||
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
        references: new Set(),
        totalQtyRequired: 0,
        totalQtyPicked: 0,
        totalOnOrder: 0,
        totalAvailable: 0,
        totalReserved: 0,
      }
    }

    const entry = itemMap[item]
    if (isBO) entry.isBO = true

    if (reference) entry.references.add(reference)
    if (number2 && number2 !== reference) entry.references.add(number2)

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
        purchaseOrderQty: r['Purchase Order Quantity'] || 0,
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
    const refs = [...item.references].filter(Boolean)
    const { stage, linkedOrders } = determineStage(refs, dr4Map, dr5Map, orderByPRD)

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
      references: refs,
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
