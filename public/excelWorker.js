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
  const boSheet   = parseSheet(workbook, 'BO')
  const openPO    = parseSheet(workbook, 'Open purchase order lines')
  const openOrders= parseSheet(workbook, 'Open sales orders')
  const dr4Sheet  = parseSheet(workbook, 'DR4')
  const dr5Sheet  = parseSheet(workbook, 'DR5')

  const boSet      = buildBOSet(boSheet)
  const poByItem   = buildPOByItem(openPO)
  const prdBySL    = buildPRDBySL(openOrders)
  const dr4ByItem  = buildDRByItem(dr4Sheet)
  const dr5ByItem  = buildDRByItem(dr5Sheet)

  return buildShortages(calcAlloc, boSet, poByItem, prdBySL, dr4ByItem, dr5ByItem)
}

// ─── Sheet parser ─────────────────────────────────────────────────────────────
function parseSheet(workbook, name) {
  let sName = workbook.SheetNames.find(n => n === name)
  if (!sName) sName = workbook.SheetNames.find(n => n.toLowerCase() === name.toLowerCase())
  if (!sName) sName = workbook.SheetNames.find(n => n.toLowerCase().includes(name.toLowerCase()))
  if (!sName) return []
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sName], { header: 1, defval: null })
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
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch { return null }
}

function str(v) { return v == null ? '' : String(v).trim() }
function num(v) { return typeof v === 'number' ? v : parseFloat(v) || 0 }
function lineStr(v) { return v == null ? '' : String(v).split('.')[0].trim() }

// ─── Build BO set (item codes + order-line keys) ──────────────────────────────
function buildBOSet(boRows) {
  const items = new Set()
  const orders = new Set()
  boRows.forEach(r => {
    const item = str(r['Item Code'])
    const doc  = str(r['Doc'])
    const line = lineStr(r['Line'])
    if (item) items.add(item)
    if (doc && line) orders.add(`${doc}-${line}`)
  })
  return { items, orders }
}

// ─── Build PO lookup: item → list of PO records ───────────────────────────────
function buildPOByItem(openPO) {
  const map = {}
  openPO.forEach(r => {
    const item = str(r['Item number'])
    if (!item) return
    if (!map[item]) map[item] = []
    map[item].push({
      purchaseOrder:        str(r['Purchase order']),
      vendorName:           str(r['Vendor name']),
      buyerGroup:           str(r['Buyer group']),
      quantity:             num(r['Quantity']),
      deliverRemainder:     num(r['Deliver remainder']),
      confirmedReceiptDate: fmtDate(r['Confirmed receipt date']),
      requestedReceiptDate: fmtDate(r['Requested receipt date']),
      approvalStatus:       str(r['Approval status']),
      documentStatus:       str(r['Document status']),
      poNote:               str(r['PO Note']),
      hasMissingDate:       str(r['חסר תאריך ']).length > 0,
    })
  })
  return map
}

// ─── Build PRD lookup: "SO-Line" → PRD number ────────────────────────────────
function buildPRDBySL(openOrders) {
  const map = {}
  openOrders.forEach(r => {
    const so   = str(r['Sales order'])
    const line = lineStr(r['Line number'])
    const prod = str(r['Production'])
    if (so && line && prod) map[`${so}-${line}`] = prod
  })
  return map
}

// ─── Build DR lookup: item → parent PRD ──────────────────────────────────────
function buildDRByItem(drRows) {
  const map = {}
  drRows.forEach(r => {
    const item   = str(r['Item number'])
    const parent = str(r['Parent production order '] || r['Parent production order'] || '')
    const prod   = str(r['Production order'] || '')
    if (!item) return
    if (!map[item]) map[item] = []
    map[item].push({ parent, prod })
  })
  return map
}

// ─── Determine stage for a shortage item ─────────────────────────────────────
function determineStage(itemNumber, salesOrder, lineNumber, poByItem, prdBySL, dr4ByItem, dr5ByItem) {
  // 1. Check if there's a PRD on this exact order line
  const slKey = `${salesOrder}-${lineNumber}`
  const prd   = prdBySL[slKey]
  if (prd) return { stage: 'PRD', prd }

  // 2. Check DR4 by item number
  const dr4 = dr4ByItem[itemNumber]
  if (dr4 && dr4.length > 0) {
    const parent = dr4[0].parent || dr4[0].prod
    // Check if also in DR5
    const dr5 = dr5ByItem[itemNumber]
    return { stage: dr5 ? 'DR4→DR5' : 'DR4', prd: parent }
  }

  // 3. Check DR5 by item number
  const dr5 = dr5ByItem[itemNumber]
  if (dr5 && dr5.length > 0) {
    const parent = dr5[0].parent || dr5[0].prod
    return { stage: 'DR5', prd: parent }
  }

  // 4. Use buyer group from PO
  const pos = poByItem[itemNumber] || []
  if (pos.length > 0) {
    const bg = pos[0].buyerGroup
    return { stage: bg ? `רכש (${bg})` : 'רכש', prd: '' }
  }

  return { stage: 'לא ידוע', prd: '' }
}

// ─── Main: build shortage list ────────────────────────────────────────────────
function buildShortages(calcAlloc, boSet, poByItem, prdBySL, dr4ByItem, dr5ByItem) {
  const itemMap = {}

  calcAlloc.forEach(r => {
    const item   = str(r['Item number'])
    if (!item) return

    const so     = str(r['Sales order'])
    const line   = lineStr(r['Line number'])
    const slKey  = `${so}-${line}`

    const isBO = boSet.items.has(item) || boSet.orders.has(slKey) ||
      str(r['BO']).toLowerCase() === 'yes' || str(r['BO']) === 'כן'

    const shortageExist = str(r['Shortage exist']).toLowerCase() === 'yes'
    if (!shortageExist && !isBO) return

    if (!itemMap[item]) {
      itemMap[item] = {
        itemNumber:   item,
        productName:  str(r['Product name']),
        isBO:         false,
        orders:       [],
        totalQtyRequired: 0,
        totalQtyPicked:   0,
        totalOnOrder:     0,
        totalAvailable:   0,
        totalReserved:    0,
      }
    }

    const e = itemMap[item]
    if (isBO) e.isBO = true

    if (so && !e.orders.find(o => o.salesOrder === so && o.lineNumber === line)) {
      e.orders.push({
        salesOrder:         so,
        lineNumber:         line,
        slKey,
        customerName:       str(r['Customer Name'] || r['Customer name2'] || ''),
        confirmedShipDate:  fmtDate(r['Confirmed ship date']),
        requestedShipDate:  fmtDate(r['Requested ship date']),
        confirmedShipMonth: str(r['Confirmed Ship Month']),
        requestedShipMonth: str(r['Requested Ship Month']),
        isBO,
        pool:               str(r['Pool']),
        remainingAmount:    num(r['Remainig amount main currency']),
        qtyRequired:        num(r['Requested quantity']),
        qtyPicked:          num(r['Picked quantity']),
        onOrder:            num(r['On order']),
        available:          num(r['Available physical']),
        reserved:           num(r['Reserved physical']),
        qtyAllocated:       num(r['Quantity allocated']),
        openPurchaseOrders: str(r['Open Purchase Orders']),
      })
    }

    e.totalQtyRequired += num(r['Requested quantity'])
    e.totalQtyPicked   += num(r['Picked quantity'])
    e.totalOnOrder     += num(r['On order'])
    e.totalAvailable   += num(r['Available physical'])
    e.totalReserved    += num(r['Reserved physical'])
  })

  return Object.values(itemMap).map(item => {
    // Determine stage using first order as reference
    const firstOrder = item.orders[0] || {}
    const { stage, prd } = determineStage(
      item.itemNumber,
      firstOrder.salesOrder || '',
      firstOrder.lineNumber || '',
      poByItem, prdBySL, dr4ByItem, dr5ByItem
    )

    const pos = poByItem[item.itemNumber] || []
    const hasPO = pos.length > 0
    const totalOrdered = pos.reduce((s, p) => s + p.deliverRemainder, 0)
    const sorted = pos.filter(p => p.confirmedReceiptDate)
      .sort((a, b) => new Date(a.confirmedReceiptDate) - new Date(b.confirmedReceiptDate))
    const nextReceipt = sorted[0]
    const hasNoDate = hasPO && pos.every(p => !p.confirmedReceiptDate)
    const vendors = [...new Set(pos.map(p => p.vendorName).filter(Boolean))]
    const buyerGroups = [...new Set(pos.map(p => p.buyerGroup).filter(Boolean))]

    let procurementStatus = 'תקין'
    if (item.isBO) procurementStatus = 'BO'
    else if (!hasPO || hasNoDate) procurementStatus = 'בסכנה'

    const boOrders = item.orders.filter(o => o.isBO)

    return {
      itemNumber:           item.itemNumber,
      productName:          item.productName,
      isBO:                 item.isBO,
      procurementStatus,
      stage,
      prd,
      orders:               item.orders,
      boOrders,
      affectedOrdersCount:  item.orders.length,
      boOrdersCount:        boOrders.length,
      totalQtyRequired:     item.totalQtyRequired,
      totalQtyPicked:       item.totalQtyPicked,
      totalOnOrder:         item.totalOnOrder,
      totalAvailable:       item.totalAvailable,
      totalReserved:        item.totalReserved,
      shortage: Math.max(0, item.totalQtyRequired - item.totalQtyPicked - item.totalAvailable),
      hasPO, totalOrdered, hasNoDate, vendors, buyerGroups,
      confirmedReceiptDate: nextReceipt?.confirmedReceiptDate || null,
      purchaseOrders:       pos,
      totalRemainingAmount: item.orders.reduce((s, o) => s + o.remainingAmount, 0),
    }
  })
}
