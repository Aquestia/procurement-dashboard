import * as XLSX from 'xlsx'

export function processExcelFile(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  // Parse all sheets
  const calcAlloc = parseSheet(workbook, ['calculated allocation', 'calculated'])
  const boSheet = parseSheet(workbook, ['bo'])
  const openPO = parseSheet(workbook, ['open purchase order lines'])
  const dr4Sheet = parseSheet(workbook, ['dr4'])
  const dr5Sheet = parseSheet(workbook, ['dr5'])
  const openOrders = parseSheet(workbook, ['open sales orders', 'open sales'])

  // Build lookup maps
  const boSet = buildBOSet(boSheet)
  const poByItem = buildPOByItem(openPO)
  const dr4Map = buildDRMap(dr4Sheet)
  const dr5Map = buildDRMap(dr5Sheet)
  const orderByPRD = buildOrderByPRD(openOrders)

  // Build enriched shortage list from Calculated Allocation
  const shortages = buildShortages(calcAlloc, boSet, poByItem, dr4Map, dr5Map, orderByPRD)

  return shortages
}

// ─── Sheet parsers ───────────────────────────────────────────────

function getSheet(workbook, keywords) {
  for (const name of workbook.SheetNames) {
    for (const kw of keywords) {
      if (name.toLowerCase().trim() === kw.toLowerCase().trim()) {
        return XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null })
      }
    }
  }
  // fallback: partial match
  for (const name of workbook.SheetNames) {
    for (const kw of keywords) {
      if (name.toLowerCase().includes(kw.toLowerCase())) {
        return XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null })
      }
    }
  }
  return []
}

function parseSheet(workbook, keywords) {
  const rows = getSheet(workbook, keywords)
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

// ─── Build BO set ────────────────────────────────────────────────

function buildBOSet(boRows) {
  // BO sheet: S & L column = "SOIL033159 2" or "SOIL0331592"
  // Item Code column
  const boItems = new Set()
  const boOrders = new Set() // sales order keys
  boRows.forEach(r => {
    const sl = str(r['S & L'])
    const item = str(r['Item Code'])
    const doc = str(r['Doc'])
    const line = str(r['Line'])
    if (item) boItems.add(item)
    if (doc && line) boOrders.add(`${doc}-${line}`)
    if (sl) boOrders.add(sl.replace(/\s+/g, ''))
  })
  return { boItems, boOrders }
}

// ─── Build PO lookup ─────────────────────────────────────────────

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

// ─── Build DR4/DR5 maps ──────────────────────────────────────────

function buildDRMap(drRows) {
  // parentPO → list of production orders
  const map = {}
  drRows.forEach(r => {
    const parent = str(r['Parent production order '] || r['Parent production order'])
    const prod = str(r['Production order'])
    if (!prod) return
    // Map production order → parent
    if (!map[prod]) map[prod] = []
    map[prod].push(parent)
    // Map parent → production order
    if (parent) {
      if (!map[parent]) map[parent] = []
      if (!map[parent].includes(prod)) map[parent].push(prod)
    }
  })
  return map
}

// ─── Build PRD → sales order map ─────────────────────────────────

function buildOrderByPRD(openOrders) {
  const map = {}
  openOrders.forEach(r => {
    const prod = str(r['Production'])
    const so = str(r['Sales order'])
    const line = str(r['Line number'])
    const item = str(r['Item number'])
    const customer = str(r['Customer name'])
    const confirmedShip = fmtDate(r['Confirmed ship date'])
    const requestedShip = fmtDate(r['Requested ship date'])
    const slKey = `${so}-${line}`
    if (prod) {
      if (!map[prod]) map[prod] = []
      map[prod].push({ salesOrder: so, lineNumber: line, slKey, item, customer, confirmedShip, requestedShip })
    }
    if (so && line) {
      map[slKey] = [{ salesOrder: so, lineNumber: line, slKey, item, customer, confirmedShip, requestedShip }]
    }
  })
  return map
}

// ─── Determine stage ─────────────────────────────────────────────

function determineStage(reference, dr4Map, dr5Map, orderByPRD) {
  if (!reference) return { stage: 'לא ידוע', linkedOrders: [] }

  const ref = str(reference)

  // Is it a PRD (assembly)?
  if (ref.startsWith('PRD')) {
    const orders = orderByPRD[ref] || []
    return { stage: 'PRD', linkedOrders: orders }
  }

  // Is it a sales order directly?
  if (ref.startsWith('SOIL')) {
    return { stage: 'הזמנה ישירה', linkedOrders: orderByPRD[ref] || [] }
  }

  // Is it in DR4?
  const inDR4 = dr4Map[ref]
  if (inDR4 && inDR4.length > 0) {
    // Check if parent is PRD
    const parents = inDR4.filter(p => p && p.startsWith('PRD'))
    if (parents.length > 0) {
      const orders = []
      parents.forEach(p => {
        const linked = orderByPRD[p] || []
        orders.push(...linked)
      })
      // Check if also in DR5
      const inDR5 = dr5Map[ref]
      const stage = inDR5 ? 'DR4→DR5' : 'DR4'
      return { stage, linkedOrders: orders }
    }
    return { stage: 'DR4', linkedOrders: [] }
  }

  // Is it in DR5?
  const inDR5 = dr5Map[ref]
  if (inDR5 && inDR5.length > 0) {
    const parents = inDR5.filter(p => p && p.startsWith('PRD'))
    if (parents.length > 0) {
      const orders = []
      parents.forEach(p => {
        const linked = orderByPRD[p] || []
        orders.push(...linked)
      })
      // Check if also in DR4
      const inDR4_2 = dr4Map[ref]
      const stage = inDR4_2 ? 'DR5→DR4' : 'DR5'
      return { stage, linkedOrders: orders }
    }
    return { stage: 'DR5', linkedOrders: [] }
  }

  return { stage: 'לא ידוע', linkedOrders: [] }
}

// ─── Main: build shortage list ───────────────────────────────────

function buildShortages(calcAlloc, boSet, poByItem, dr4Map, dr5Map, orderByPRD) {
  const { boItems, boOrders } = boSet

  // Deduplicate by item number — group all rows per item
  const itemMap = {}

  calcAlloc.forEach(r => {
    const item = str(r['Item number'])
    if (!item) return

    const salesOrder = str(r['Sales order'])
    const lineNumber = str(r['Line number'])
    const slKey = `${salesOrder}-${lineNumber}`
    const reference = str(r['Reference'] || r['Number2'] || '')
    const isBO = boItems.has(item) || boOrders.has(slKey) || str(r['BO']) === 'Yes' || str(r['BO']) === 'כן'

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
        shortageExist: false,
      }
    }

    const entry = itemMap[item]
    if (isBO) entry.isBO = true
    if (str(r['Shortage exist']).toLowerCase() === 'yes') entry.shortageExist = true

    // Add order
    if (salesOrder) {
      const exists = entry.orders.find(o => o.salesOrder === salesOrder && o.lineNumber === lineNumber)
      if (!exists) {
        entry.orders.push({
          salesOrder,
          lineNumber,
          slKey,
          customerName: str(r['Customer Name'] || r['Customer name2']),
          confirmedShipDate: fmtDate(r['Confirmed ship date']),
          requestedShipDate: fmtDate(r['Requested ship date']),
          confirmedShipMonth: str(r['Confirmed Ship Month']),
          requestedShipMonth: str(r['Requested Ship Month']),
          isBO: isBO,
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
    }

    if (reference) entry.references.add(reference)
    entry.totalQtyRequired += (r['Requested quantity'] || 0)
    entry.totalQtyPicked += (r['Picked quantity'] || 0)
    entry.totalOnOrder += (r['On order'] || 0)
    entry.totalAvailable += (r['Available physical'] || 0)
    entry.totalReserved += (r['Reserved physical'] || 0)
  })

  // Now enrich each item
  return Object.values(itemMap).map(item => {
    // Get all references for this item
    const refs = [...item.references]

    // Determine stage from first valid reference
    let stage = 'לא ידוע'
    let linkedOrders = []
    for (const ref of refs) {
      const result = determineStage(ref, dr4Map, dr5Map, orderByPRD)
      if (result.stage !== 'לא ידוע') {
        stage = result.stage
        linkedOrders = result.linkedOrders
        break
      }
    }

    // Get PO info
    const pos = poByItem[item.itemNumber] || []
    const hasPO = pos.length > 0
    const totalOrdered = pos.reduce((s, p) => s + (p.deliverRemainder || 0), 0)
    const nextReceipt = pos
      .filter(p => p.confirmedReceiptDate)
      .sort((a, b) => new Date(a.confirmedReceiptDate) - new Date(b.confirmedReceiptDate))[0]
    const hasNoDate = hasPO && pos.every(p => !p.confirmedReceiptDate)
    const vendors = [...new Set(pos.map(p => p.vendorName).filter(Boolean))]

    // Procurement status
    let procurementStatus = 'תקין'
    if (item.isBO) procurementStatus = 'BO'
    else if (!hasPO) procurementStatus = 'בסכנה'
    else if (hasNoDate) procurementStatus = 'בסכנה'

    return {
      itemNumber: item.itemNumber,
      productName: item.productName,
      isBO: item.isBO,
      shortageExist: item.shortageExist,
      procurementStatus,
      stage,
      references: refs,
      orders: item.orders,
      boOrders: item.orders.filter(o => o.isBO),
      affectedOrdersCount: item.orders.length,
      boOrdersCount: item.orders.filter(o => o.isBO).length,
      // Quantities
      totalQtyRequired: item.totalQtyRequired,
      totalQtyPicked: item.totalQtyPicked,
      totalOnOrder: item.totalOnOrder,
      totalAvailable: item.totalAvailable,
      totalReserved: item.totalReserved,
      shortage: item.totalQtyRequired - item.totalQtyPicked - item.totalAvailable,
      // PO info
      hasPO,
      totalOrdered,
      hasNoDate,
      vendors,
      confirmedReceiptDate: nextReceipt?.confirmedReceiptDate || null,
      purchaseOrders: pos,
      // Financial
      totalRemainingAmount: item.orders.reduce((s, o) => s + (o.remainingAmount || 0), 0),
    }
  }).filter(item => item.shortageExist || item.isBO)
}
