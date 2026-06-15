importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js')

self.onmessage = function(e) {
  try {
    self.postMessage({ success: true, data: processExcelFile(e.data) })
  } catch (err) {
    self.postMessage({ success: false, error: err.message })
  }
}

function processExcelFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const calc       = parseSheet(wb, 'Calculated allocation')
  const boSheet    = parseSheet(wb, 'BO')
  const openPO     = parseSheet(wb, 'Open purchase order lines')
  const openOrders = parseSheet(wb, 'Open sales orders')
  const dr4        = parseSheet(wb, 'DR4')
  const dr5        = parseSheet(wb, 'DR5')

  // Build lookup maps
  const boSet        = buildBOSet(boSheet)
  const poByItem     = buildPOByItem(openPO)
  const soByPRD      = buildSOByPRD(openOrders)      // PRD → sales order rows
  const dr4ByProd    = buildByProd(dr4)               // production order → parent
  const dr5ByProd    = buildByProd(dr5)               // production order → parent
  const dr4ByMain    = buildByMainComp(dr4)           // main component → rows
  const dr5ByMain    = buildByMainComp(dr5)           // main component → rows
  const soBySOItem   = buildSOBySOItem(openOrders)    // SO+Item → order row
  const soBySOLine   = buildSOBySOLine(openOrders)    // SO+Line → order row

  return buildShortages(calc, boSet, poByItem, soByPRD, dr4ByProd, dr5ByProd, dr4ByMain, dr5ByMain, soBySOItem, soBySOLine)
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
function str(v)  { return v == null ? '' : String(v).trim() }
function num(v)  { return typeof v === 'number' ? v : parseFloat(v) || 0 }
function lineN(v) { if (!v) return ''; const s = str(v); return isNaN(parseFloat(s)) ? s : String(Math.round(parseFloat(s))) }

// ─── Lookups ──────────────────────────────────────────────────────

function buildBOSet(rows) {
  const items = new Set(), orders = new Set()
  rows.forEach(r => {
    const item = str(r['Item Code'])
    const doc  = str(r['Doc'])
    const line = lineN(r['Line'])
    if (item) items.add(item)
    if (doc && line) orders.add(`${doc}-${line}`)
    if (doc && item) orders.add(`${doc}__${item}`)
  })
  return { items, orders }
}

function buildSOByPRD(rows) {
  // PRD number → list of order rows
  const map = {}
  rows.forEach(r => {
    const prd = str(r['Production'])
    if (!prd) return
    if (!map[prd]) map[prd] = []
    map[prd].push(makeOrderRow(r))
  })
  return map
}

function buildSOBySOItem(rows) {
  // "SO__item" → list of order rows
  const map = {}
  rows.forEach(r => {
    const so   = str(r['Sales order'])
    const item = str(r['Item number'])
    if (!so || !item) return
    const key = `${so}__${item}`
    if (!map[key]) map[key] = []
    map[key].push(makeOrderRow(r))
  })
  return map
}

function buildSOBySOLine(rows) {
  const map = {}
  rows.forEach(r => {
    const so   = str(r['Sales order'])
    const line = lineN(r['Line number'])
    if (!so || !line) return
    map[`${so}-${line}`] = makeOrderRow(r)
  })
  return map
}

function makeOrderRow(r) {
  return {
    salesOrder:         str(r['Sales order']),
    lineNumber:         lineN(r['Line number']),
    itemNumber:         str(r['Item number']),
    customerName:       str(r['Customer name']),
    confirmedShipDate:  fmtDate(r['Confirmed ship date']),
    requestedShipDate:  fmtDate(r['Requested ship date']),
    confirmedShipMonth: str(r['Confirmed Ship Month'] || ''),
    requestedShipMonth: str(r['Requested Ship Month'] || ''),
    production:         str(r['Production']),
    pool:               str(r['Pool']),
    remainingAmount:    num(r['Remainig amount main currency']),
  }
}

function buildPOByItem(rows) {
  const map = {}
  rows.forEach(r => {
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

// DR lookup: production order → parent PO
function buildByProd(rows) {
  const map = {}
  rows.forEach(r => {
    const prod   = str(r['Production order'])
    const parent = str(r['Parent production order '] || r['Parent production order'] || '')
    if (prod) map[prod] = parent
  })
  return map
}

// DR lookup: main component → list of {prod, parent, item}
function buildByMainComp(rows) {
  const map = {}
  rows.forEach(r => {
    const main = str(r['Main component'])
    if (!main) return
    if (!map[main]) map[main] = []
    map[main].push({
      prod:   str(r['Production order']),
      parent: str(r['Parent production order '] || r['Parent production order'] || ''),
      item:   str(r['Item number']),
    })
  })
  return map
}

// ─── Find root PRD for an item ────────────────────────────────────
// Returns list of root PRD strings that link directly to sales orders

function findRootPRDs(itemNumber, dr4ByMain, dr5ByMain, dr4ByProd, dr5ByProd, soByPRD, visited) {
  if (!visited) visited = new Set()
  if (visited.has(itemNumber)) return []
  visited.add(itemNumber)

  const results = []

  // Check if item IS a PRD in soByPRD (item itself is a production order)
  if (soByPRD[itemNumber]) {
    results.push(itemNumber)
    return results
  }

  // Check DR5 first (צבע) - item is Main component
  const dr5rows = dr5ByMain[itemNumber] || []
  for (const row of dr5rows) {
    const parent = row.parent
    if (!parent || visited.has(parent)) continue
    // Parent might be a root PRD
    if (parent.startsWith('PRD') && soByPRD[parent]) {
      results.push(parent)
    } else {
      // Recurse: find root of parent
      const sub = findRootPRDs(parent, dr4ByMain, dr5ByMain, dr4ByProd, dr5ByProd, soByPRD, visited)
      results.push(...sub)
    }
    // Also check production order
    const prod = row.prod
    if (prod && prod.startsWith('PRD') && soByPRD[prod]) {
      results.push(prod)
    }
  }

  // Check DR4 (עיבוד שבבי) - item is Main component
  const dr4rows = dr4ByMain[itemNumber] || []
  for (const row of dr4rows) {
    const parent = row.parent
    if (!parent || visited.has(parent)) continue
    if (parent.startsWith('PRD') && soByPRD[parent]) {
      results.push(parent)
    } else {
      const sub = findRootPRDs(parent, dr4ByMain, dr5ByMain, dr4ByProd, dr5ByProd, soByPRD, visited)
      results.push(...sub)
    }
    const prod = row.prod
    if (prod && prod.startsWith('PRD') && soByPRD[prod]) {
      results.push(prod)
    }
  }

  return [...new Set(results)]
}

// Determine stage for item
function determineStage(itemNumber, dr4ByMain, dr5ByMain, poByItem) {
  if ((dr5ByMain[itemNumber] || []).length > 0) {
    const hasDR4 = (dr4ByMain[itemNumber] || []).length > 0
    return hasDR4 ? 'DR4→DR5' : 'DR5'
  }
  if ((dr4ByMain[itemNumber] || []).length > 0) return 'DR4'
  const pos = poByItem[itemNumber] || []
  if (pos.length > 0 && pos[0].buyerGroup) return `רכש (${pos[0].buyerGroup})`
  return 'רכש'
}

// ─── Main builder ─────────────────────────────────────────────────
function buildShortages(calc, boSet, poByItem, soByPRD, dr4ByProd, dr5ByProd, dr4ByMain, dr5ByMain, soBySOItem, soBySOLine) {
  const itemMap = {}

  calc.forEach(r => {
    const item = str(r['Item number'])
    if (!item) return
    const shortageExist = str(r['Shortage exist']).toLowerCase() === 'yes'
    const so   = str(r['Sales order'])
    const rawLine = str(r['Line number'])
    const isGmar = !rawLine || rawLine === 'תוצרת גמורה' || isNaN(parseFloat(rawLine))

    // Is it BO?
    const lineResolved = isGmar ? '' : lineN(rawLine)
    const slKey = `${so}-${lineResolved}`
    const isBO = boSet.items.has(item) ||
      (so && lineResolved && boSet.orders.has(slKey)) ||
      (so && boSet.orders.has(`${so}__${item}`)) ||
      str(r['BO']).toLowerCase() === 'yes'

    if (!shortageExist && !isBO) return

    if (!itemMap[item]) {
      itemMap[item] = {
        itemNumber:  item,
        productName: str(r['Product name']),
        isBO: false,
        calcRows: [],
        totalQtyRequired: 0,
        totalQtyPicked:   0,
        totalOnOrder:     0,
        totalAvailable:   0,
        totalReserved:    0,
      }
    }

    const e = itemMap[item]
    if (isBO) e.isBO = true

    // Store raw calc row for later order resolution
    e.calcRows.push({
      salesOrder: so,
      rawLine,
      isGmar,
      isBO,
      qtyRequired:        num(r['Requested quantity']),
      qtyPicked:          num(r['Picked quantity']),
      onOrder:            num(r['On order']),
      available:          num(r['Available physical']),
      reserved:           num(r['Reserved physical']),
      qtyAllocated:       num(r['Quantity allocated']),
      remainingAmount:    num(r['Remainig amount main currency']),
      openPurchaseOrders: str(r['Open Purchase Orders']),
      customerNameCalc:   str(r['Customer Name'] || r['Customer name2'] || ''),
      confirmedShipCalc:  fmtDate(r['Confirmed ship date']),
      requestedShipCalc:  fmtDate(r['Requested ship date']),
    })

    e.totalQtyRequired += num(r['Requested quantity'])
    e.totalQtyPicked   += num(r['Picked quantity'])
    e.totalOnOrder     += num(r['On order'])
    e.totalAvailable   += num(r['Available physical'])
    e.totalReserved    += num(r['Reserved physical'])
  })

  // Now enrich each item
  return Object.values(itemMap).map(item => {
    // 1. Find root PRDs via DR chain
    const rootPRDs = findRootPRDs(item.itemNumber, dr4ByMain, dr5ByMain, dr4ByProd, dr5ByProd, soByPRD, null)

    // 2. Collect orders from root PRDs
    const prdOrders = []
    const usedPRDs = []
    rootPRDs.forEach(prd => {
      const rows = soByPRD[prd] || []
      rows.forEach(o => prdOrders.push({ ...o, prd, sourcePRD: true }))
      if (rows.length > 0) usedPRDs.push(prd)
    })

    // 3. Collect orders from calc rows (direct SO reference)
    const directOrders = []
    const seenKeys = new Set()
    item.calcRows.forEach(cr => {
      if (!cr.salesOrder) return
      let orderInfo = null
      if (!cr.isGmar) {
        const line = lineN(cr.rawLine)
        orderInfo = soBySOLine[`${cr.salesOrder}-${line}`]
      }
      if (!orderInfo) {
        const matches = soBySOItem[`${cr.salesOrder}__${item.itemNumber}`] || []
        orderInfo = matches[0] || null
      }
      const lineResolved = orderInfo?.lineNumber || (cr.isGmar ? '' : lineN(cr.rawLine))
      const key = `${cr.salesOrder}-${lineResolved}`
      if (seenKeys.has(key)) return
      seenKeys.add(key)
      directOrders.push({
        salesOrder:        cr.salesOrder,
        lineNumber:        lineResolved,
        customerName:      orderInfo?.customerName || cr.customerNameCalc,
        confirmedShipDate: orderInfo?.confirmedShipDate || cr.confirmedShipCalc,
        requestedShipDate: orderInfo?.requestedShipDate || cr.requestedShipCalc,
        pool:              orderInfo?.pool || '',
        remainingAmount:   cr.remainingAmount,
        qtyRequired:       cr.qtyRequired,
        qtyPicked:         cr.qtyPicked,
        onOrder:           cr.onOrder,
        available:         cr.available,
        openPurchaseOrders: cr.openPurchaseOrders,
        isBO:              cr.isBO,
        prd:               orderInfo?.production || '',
        sourceDirect:      true,
      })
    })

    // 4. Merge: prefer PRD-sourced orders, supplement with direct
    const allOrders = []
    const allKeys = new Set()

    // PRD orders first
    prdOrders.forEach(o => {
      const key = `${o.salesOrder}-${o.lineNumber}`
      if (!allKeys.has(key)) { allKeys.add(key); allOrders.push(o) }
    })

    // Direct orders - add if not already included
    directOrders.forEach(o => {
      const key = `${o.salesOrder}-${o.lineNumber}`
      if (!allKeys.has(key)) { allKeys.add(key); allOrders.push(o) }
    })

    // 5. Stage
    const stage = determineStage(item.itemNumber, dr4ByMain, dr5ByMain, poByItem)
    const prd = usedPRDs[0] || ''

    // 6. PO info
    const pos = poByItem[item.itemNumber] || []
    const hasPO = pos.length > 0
    const totalOrdered = pos.reduce((s, p) => s + p.deliverRemainder, 0)
    const sortedPOs = pos.filter(p => p.confirmedReceiptDate)
      .sort((a, b) => new Date(a.confirmedReceiptDate) - new Date(b.confirmedReceiptDate))
    const hasNoDate = hasPO && pos.every(p => !p.confirmedReceiptDate)
    const vendors = [...new Set(pos.map(p => p.vendorName).filter(Boolean))]

    let procurementStatus = 'תקין'
    if (item.isBO) procurementStatus = 'BO'
    else if (!hasPO || hasNoDate) procurementStatus = 'בסכנה'

    const boOrders = allOrders.filter(o => o.isBO || boSet.orders.has(`${o.salesOrder}__${item.itemNumber}`) || boSet.items.has(item.itemNumber))

    return {
      itemNumber:          item.itemNumber,
      productName:         item.productName,
      isBO:                item.isBO,
      procurementStatus,
      stage, prd,
      rootPRDs:            usedPRDs,
      orders:              allOrders,
      boOrders:            item.isBO ? allOrders : boOrders,
      affectedOrdersCount: allOrders.length,
      boOrdersCount:       item.isBO ? allOrders.length : boOrders.length,
      totalQtyRequired:    item.totalQtyRequired,
      totalQtyPicked:      item.totalQtyPicked,
      totalOnOrder:        item.totalOnOrder,
      totalAvailable:      item.totalAvailable,
      totalReserved:       item.totalReserved,
      shortage: Math.max(0, item.totalQtyRequired - item.totalQtyPicked - item.totalAvailable),
      hasPO, totalOrdered, hasNoDate, vendors,
      confirmedReceiptDate: sortedPOs[0]?.confirmedReceiptDate || null,
      purchaseOrders:       pos,
      totalRemainingAmount: allOrders.reduce((s, o) => s + (o.remainingAmount || 0), 0),
    }
  })
}
