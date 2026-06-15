importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js')

self.onmessage = function(e) {
  try {
    const result = processExcelFile(e.data)
    self.postMessage({ success: true, data: result })
  } catch (err) {
    self.postMessage({ success: false, error: err.message })
  }
}

function processExcelFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const calcAlloc  = parseSheet(wb, 'Calculated allocation')
  const boSheet    = parseSheet(wb, 'BO')
  const openPO     = parseSheet(wb, 'Open purchase order lines')
  const openOrders = parseSheet(wb, 'Open sales orders')
  const dr4Sheet   = parseSheet(wb, 'DR4')
  const dr5Sheet   = parseSheet(wb, 'DR5')

  const boSet        = buildBOSet(boSheet)
  const poByItem     = buildPOByItem(openPO)
  const orderLookup  = buildOrderLookup(openOrders)  // SO+Item → order details
  const dr4ByItem    = buildDRByItem(dr4Sheet)
  const dr5ByItem    = buildDRByItem(dr5Sheet)

  return buildShortages(calcAlloc, boSet, poByItem, orderLookup, dr4ByItem, dr5ByItem)
}

// ─── Sheet parser ─────────────────────────────────────────────────
function parseSheet(wb, name) {
  let sn = wb.SheetNames.find(n => n === name)
    || wb.SheetNames.find(n => n.toLowerCase() === name.toLowerCase())
    || wb.SheetNames.find(n => n.toLowerCase().includes(name.toLowerCase()))
  if (!sn) return []
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null })
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
  try { const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? null : d.toISOString() }
  catch { return null }
}
function str(v) { return v == null ? '' : String(v).trim() }
function num(v) { return typeof v === 'number' ? v : parseFloat(v) || 0 }
function lineNum(v) {
  if (v == null) return ''
  const s = String(v).trim()
  if (s === 'תוצרת גמורה' || isNaN(parseFloat(s))) return 'תוצרת גמורה'
  return String(parseFloat(s))
}

// ─── BO set ──────────────────────────────────────────────────────
function buildBOSet(boRows) {
  const items = new Set(), orders = new Set()
  boRows.forEach(r => {
    const item = str(r['Item Code'])
    const doc  = str(r['Doc'])
    const line = str(r['Line']).split('.')[0]
    if (item) items.add(item)
    if (doc && line) orders.add(`${doc}-${line}`)
    // Also store by doc+item for matching
    if (doc && item) orders.add(`${doc}__${item}`)
  })
  return { items, orders }
}

// ─── Open Orders lookup: SO+Item → order details ─────────────────
function buildOrderLookup(openOrders) {
  // Key 1: SO-Line (for exact match)
  // Key 2: SO__Item (for תוצרת גמורה rows)
  const bySOLine = {}
  const bySOItem = {}
  openOrders.forEach(r => {
    const so   = str(r['Sales order'])
    const line = str(r['Line number']).split('.')[0]
    const item = str(r['Item number'])
    const info = {
      salesOrder:        so,
      lineNumber:        line,
      itemNumber:        item,
      customerName:      str(r['Customer name']),
      confirmedShipDate: fmtDate(r['Confirmed ship date']),
      requestedShipDate: fmtDate(r['Requested ship date']),
      confirmedShipMonth:str(r['Confirmed ship date'] ? new Date(r['Confirmed ship date']).toLocaleDateString('he-IL', { month: 'long', year: '2-digit' }) : ''),
      requestedShipMonth:str(r['Requested ship date'] ? new Date(r['Requested ship date']).toLocaleDateString('he-IL', { month: 'long', year: '2-digit' }) : ''),
      production:        str(r['Production']),
      pool:              str(r['Pool']),
    }
    if (so && line) bySOLine[`${so}-${line}`] = info
    if (so && item) {
      if (!bySOItem[`${so}__${item}`]) bySOItem[`${so}__${item}`] = []
      bySOItem[`${so}__${item}`].push(info)
    }
  })
  return { bySOLine, bySOItem }
}

// ─── PO lookup ───────────────────────────────────────────────────
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

// ─── DR lookup by item number ────────────────────────────────────
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

// ─── Determine stage ─────────────────────────────────────────────
function determineStage(itemNumber, production, poByItem, dr4ByItem, dr5ByItem) {
  // 1. Has PRD from open orders
  if (production && production.startsWith('PRD')) return { stage: 'PRD', prd: production }

  // 2. Item appears in DR4
  const dr4 = dr4ByItem[itemNumber]
  if (dr4 && dr4.length > 0) {
    const parent = dr4[0].parent || dr4[0].prod
    const inDR5  = dr5ByItem[itemNumber]
    return { stage: inDR5 ? 'DR4→DR5' : 'DR4', prd: parent }
  }

  // 3. Item appears in DR5
  const dr5 = dr5ByItem[itemNumber]
  if (dr5 && dr5.length > 0) {
    const parent = dr5[0].parent || dr5[0].prod
    return { stage: 'DR5', prd: parent }
  }

  // 4. Purchased item — use buyer group
  const pos = poByItem[itemNumber] || []
  if (pos.length > 0 && pos[0].buyerGroup) return { stage: `רכש (${pos[0].buyerGroup})`, prd: '' }

  return { stage: 'לא ידוע', prd: '' }
}

// ─── Main builder ─────────────────────────────────────────────────
function buildShortages(calcAlloc, boSet, poByItem, orderLookup, dr4ByItem, dr5ByItem) {
  const { bySOLine, bySOItem } = orderLookup
  const itemMap = {}

  calcAlloc.forEach(r => {
    const item = str(r['Item number'])
    if (!item) return

    const so       = str(r['Sales order'])
    const rawLine  = lineNum(r['Line number'])
    const isGמר    = rawLine === 'תוצרת גמורה'
    const shortageExist = str(r['Shortage exist']).toLowerCase() === 'yes'

    // Resolve order details
    let orderInfo = null
    if (!isGמר && so && rawLine) {
      orderInfo = bySOLine[`${so}-${rawLine}`]
    }
    if (!orderInfo && so && item) {
      // תוצרת גמורה — join by SO + item
      const matches = bySOItem[`${so}__${item}`] || []
      orderInfo = matches[0] || null
    }

    const lineNumber   = orderInfo?.lineNumber || rawLine
    const customerName = orderInfo?.customerName || str(r['Customer Name'] || r['Customer name2'] || '')
    const confirmedShipDate  = orderInfo?.confirmedShipDate  || fmtDate(r['Confirmed ship date'])
    const requestedShipDate  = orderInfo?.requestedShipDate  || fmtDate(r['Requested ship date'])
    const slKey = `${so}-${lineNumber}`

    const isBO = boSet.items.has(item) ||
      boSet.orders.has(slKey) ||
      boSet.orders.has(`${so}__${item}`) ||
      str(r['BO']).toLowerCase() === 'yes'

    if (!shortageExist && !isBO) return

    if (!itemMap[item]) {
      itemMap[item] = {
        itemNumber:  item,
        productName: str(r['Product name']),
        isBO: false,
        orders: [],
        totalQtyRequired: 0,
        totalQtyPicked:   0,
        totalOnOrder:     0,
        totalAvailable:   0,
        totalReserved:    0,
        production:       orderInfo?.production || '',
      }
    }

    const e = itemMap[item]
    if (isBO) e.isBO = true
    if (!e.production && orderInfo?.production) e.production = orderInfo.production

    // Add order if not duplicate
    const existKey = `${so}-${lineNumber}`
    if (so && !e.orders.find(o => o.salesOrder === so && o.lineNumber === lineNumber)) {
      e.orders.push({
        salesOrder:         so,
        lineNumber,
        slKey:              existKey,
        customerName,
        confirmedShipDate,
        requestedShipDate,
        confirmedShipMonth: orderInfo?.confirmedShipMonth || str(r['Confirmed Ship Month']),
        requestedShipMonth: orderInfo?.requestedShipMonth || str(r['Requested Ship Month']),
        isBO,
        pool:               orderInfo?.pool || str(r['Pool']),
        remainingAmount:    num(r['Remainig amount main currency']),
        qtyRequired:        num(r['Requested quantity']),
        qtyPicked:          num(r['Picked quantity']),
        onOrder:            num(r['On order']),
        available:          num(r['Available physical']),
        reserved:           num(r['Reserved physical']),
        qtyAllocated:       num(r['Quantity allocated']),
        openPurchaseOrders: str(r['Open Purchase Orders']),
        production:         orderInfo?.production || '',
      })
    }

    e.totalQtyRequired += num(r['Requested quantity'])
    e.totalQtyPicked   += num(r['Picked quantity'])
    e.totalOnOrder     += num(r['On order'])
    e.totalAvailable   += num(r['Available physical'])
    e.totalReserved    += num(r['Reserved physical'])
  })

  return Object.values(itemMap).map(item => {
    const { stage, prd } = determineStage(item.itemNumber, item.production, poByItem, dr4ByItem, dr5ByItem)
    const pos = poByItem[item.itemNumber] || []
    const hasPO = pos.length > 0
    const totalOrdered = pos.reduce((s, p) => s + p.deliverRemainder, 0)
    const sorted = pos.filter(p => p.confirmedReceiptDate)
      .sort((a, b) => new Date(a.confirmedReceiptDate) - new Date(b.confirmedReceiptDate))
    const hasNoDate = hasPO && pos.every(p => !p.confirmedReceiptDate)
    const vendors = [...new Set(pos.map(p => p.vendorName).filter(Boolean))]
    const buyerGroups = [...new Set(pos.map(p => p.buyerGroup).filter(Boolean))]

    let procurementStatus = 'תקין'
    if (item.isBO) procurementStatus = 'BO'
    else if (!hasPO || hasNoDate) procurementStatus = 'בסכנה'

    const boOrders = item.orders.filter(o => o.isBO)

    return {
      itemNumber:          item.itemNumber,
      productName:         item.productName,
      isBO:                item.isBO,
      procurementStatus,
      stage, prd,
      orders:              item.orders,
      boOrders,
      affectedOrdersCount: item.orders.length,
      boOrdersCount:       boOrders.length,
      totalQtyRequired:    item.totalQtyRequired,
      totalQtyPicked:      item.totalQtyPicked,
      totalOnOrder:        item.totalOnOrder,
      totalAvailable:      item.totalAvailable,
      totalReserved:       item.totalReserved,
      shortage: Math.max(0, item.totalQtyRequired - item.totalQtyPicked - item.totalAvailable),
      hasPO, totalOrdered, hasNoDate, vendors, buyerGroups,
      confirmedReceiptDate: sorted[0]?.confirmedReceiptDate || null,
      purchaseOrders:       pos,
      totalRemainingAmount: item.orders.reduce((s, o) => s + o.remainingAmount, 0),
    }
  })
}
