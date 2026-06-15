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

  // ─── Detect format ────────────────────────────────────────────
  // Format A (ישן): has 'Open sales orders', 'Calculated allocation' (lowercase), Main component in DR
  // Format B (חדש): has 'Sales', 'Calculated Allocation' (uppercase), Number column in Calc
  const sheetNames = wb.SheetNames.map(n => n.toLowerCase())
  const isFormatB = sheetNames.includes('sales') && !sheetNames.includes('open sales orders')

  // ─── Parse sheets ─────────────────────────────────────────────
  const calc       = parseSheet(wb, isFormatB ? 'Calculated Allocation' : 'Calculated allocation')
  const boSheet    = parseSheet(wb, 'BO')
  const openPO     = parseSheet(wb, isFormatB ? 'Open Purchase Orders' : 'Open purchase order lines')
  const openOrders = parseSheet(wb, isFormatB ? 'Sales' : 'Open sales orders')
  const dr4        = parseSheet(wb, 'DR4')
  const dr5        = parseSheet(wb, 'DR5')

  // ─── Build lookups ────────────────────────────────────────────
  const boSet    = buildBOSet(boSheet)
  const poByItem = buildPOByItem(openPO)
  const soByPRD  = buildSOByPRD(openOrders)       // PRD → sales order rows
  const dr4ByProd = buildByProd(dr4)              // production order → parent
  const dr5ByProd = buildByProd(dr5)
  const dr4ByMain = isFormatB ? {} : buildByMainComp(dr4)  // main component → rows (Format A only)
  const dr5ByMain = isFormatB ? {} : buildByMainComp(dr5)
  const soBySOItem = buildSOBySOItem(openOrders)
  const soBySOLine = buildSOBySOLine(openOrders)

  return buildShortages(calc, boSet, poByItem, soByPRD, dr4ByProd, dr5ByProd, dr4ByMain, dr5ByMain, soBySOItem, soBySOLine, isFormatB)
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
function str(v)   { return v == null ? '' : String(v).trim() }
function num(v)   { return typeof v === 'number' ? v : parseFloat(v) || 0 }
function lineN(v) { if (!v) return ''; const s = str(v); const f = parseFloat(s); return isNaN(f) ? s : String(f) }

// ─── BO set ───────────────────────────────────────────────────────
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

// ─── Sales order lookups ──────────────────────────────────────────
function makeOrderRow(r) {
  return {
    salesOrder:         str(r['Sales order']),
    lineNumber:         lineN(r['Line number']),
    itemNumber:         str(r['Item number']),
    customerName:       str(r['Customer name']),
    confirmedShipDate:  fmtDate(r['Confirmed ship date']),
    requestedShipDate:  fmtDate(r['Requested ship date']),
    production:         str(r['Production']),
    pool:               str(r['Pool']),
    remainingAmount:    num(r['Remainig amount main currency']),
  }
}

function buildSOByPRD(rows) {
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

// ─── PO lookup ────────────────────────────────────────────────────
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
      poNote:               str(r['PO Note'] || ''),
      hasMissingDate:       !r['Confirmed receipt date'],
    })
  })
  return map
}

// ─── DR lookups ───────────────────────────────────────────────────
function buildByProd(rows) {
  // production order → parent PO
  const map = {}
  rows.forEach(r => {
    const prod   = str(r['Production order'])
    const parent = str(r['Parent production order '] || r['Parent production order'] || '')
    if (prod) map[prod] = parent
  })
  return map
}

function buildByMainComp(rows) {
  // main component → [{prod, parent, item}]  (Format A only)
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

// ─── Traverse DR chain to find root PRDs ─────────────────────────
// Starting from a PRD/DYNP, follow parent chain until we find a PRD in soByPRD
function findRootPRDs(startPrd, dr4ByProd, dr5ByProd, soByPRD, visited) {
  if (!visited) visited = new Set()
  if (!startPrd || visited.has(startPrd)) return []
  visited.add(startPrd)

  // Is this PRD directly in Sales?
  if (soByPRD[startPrd]) return [startPrd]

  const results = []

  // Check DR4 parent
  const dr4Parent = dr4ByProd[startPrd]
  if (dr4Parent && !visited.has(dr4Parent)) {
    results.push(...findRootPRDs(dr4Parent, dr4ByProd, dr5ByProd, soByPRD, visited))
  }

  // Check DR5 parent
  const dr5Parent = dr5ByProd[startPrd]
  if (dr5Parent && !visited.has(dr5Parent)) {
    results.push(...findRootPRDs(dr5Parent, dr4ByProd, dr5ByProd, soByPRD, visited))
  }

  return [...new Set(results)]
}

// Format A: find root PRDs via Main component lookup
function findRootPRDsViaMainComp(itemNumber, dr4ByMain, dr5ByMain, dr4ByProd, dr5ByProd, soByPRD) {
  const allRoots = new Set()

  // Try DR5 first (צבע)
  for (const row of (dr5ByMain[itemNumber] || [])) {
    const parent = row.parent
    if (parent) {
      if (soByPRD[parent]) { allRoots.add(parent); continue }
      findRootPRDs(parent, dr4ByProd, dr5ByProd, soByPRD, null).forEach(r => allRoots.add(r))
    }
    if (row.prod && soByPRD[row.prod]) allRoots.add(row.prod)
  }

  // Try DR4
  for (const row of (dr4ByMain[itemNumber] || [])) {
    const parent = row.parent
    if (parent) {
      if (soByPRD[parent]) { allRoots.add(parent); continue }
      findRootPRDs(parent, dr4ByProd, dr5ByProd, soByPRD, null).forEach(r => allRoots.add(r))
    }
    if (row.prod && soByPRD[row.prod]) allRoots.add(row.prod)
  }

  return [...allRoots]
}

// Determine stage
function determineStage(itemNumber, dr4ByMain, dr5ByMain, poByItem, isFormatB, calcPrdRef) {
  if (isFormatB) {
    // Format B: stage from PO buyer group
    const pos = poByItem[itemNumber] || []
    if (calcPrdRef) return { stage: 'PRD', prd: calcPrdRef }
    if (pos.length > 0 && pos[0].buyerGroup) return { stage: `רכש (${pos[0].buyerGroup})`, prd: '' }
    return { stage: 'לא ידוע', prd: '' }
  }
  // Format A
  if ((dr5ByMain[itemNumber] || []).length > 0) {
    const hasDR4 = (dr4ByMain[itemNumber] || []).length > 0
    return { stage: hasDR4 ? 'DR4→DR5' : 'DR5', prd: '' }
  }
  if ((dr4ByMain[itemNumber] || []).length > 0) return { stage: 'DR4', prd: '' }
  const pos = poByItem[itemNumber] || []
  if (pos.length > 0 && pos[0].buyerGroup) return { stage: `רכש (${pos[0].buyerGroup})`, prd: '' }
  return { stage: 'רכש', prd: '' }
}

// ─── Main builder ─────────────────────────────────────────────────
function buildShortages(calc, boSet, poByItem, soByPRD, dr4ByProd, dr5ByProd, dr4ByMain, dr5ByMain, soBySOItem, soBySOLine, isFormatB) {
  const itemMap = {}

  calc.forEach(r => {
    const item = str(r['Item number'])
    if (!item) return
    const shortageExist = str(r['Shortage exist']).toLowerCase() === 'yes'

    // Format B: Reference + Number columns
    const calcPRD = isFormatB ? str(r['Number'] || '') : ''
    const calcRef = isFormatB ? str(r['Reference'] || '') : ''

    // Format A: Sales order + Line number columns
    const so      = isFormatB ? '' : str(r['Sales order'] || '')
    const rawLine = isFormatB ? '' : str(r['Line number'] || '')
    const isGmar  = !rawLine || rawLine === 'תוצרת גמורה' || isNaN(parseFloat(rawLine))

    const isBO = boSet.items.has(item) ||
      (!isGmar && so && boSet.orders.has(`${so}-${lineN(rawLine)}`)) ||
      (so && boSet.orders.has(`${so}__${item}`)) ||
      str(r['BO'] || '').toLowerCase() === 'yes'

    if (!shortageExist && !isBO) return

    if (!itemMap[item]) {
      itemMap[item] = {
        itemNumber:  item,
        productName: str(r['Product name'] || ''),
        isBO: false,
        calcRows: [],
        calcPRDs: new Set(),
        totalQtyRequired: 0,
        totalQtyPicked:   0,
        totalOnOrder:     0,
        totalAvailable:   0,
        totalReserved:    0,
      }
    }

    const e = itemMap[item]
    if (isBO) e.isBO = true
    if (calcPRD) e.calcPRDs.add(calcPRD)

    e.calcRows.push({
      salesOrder: so, rawLine, isGmar, isBO, calcPRD, calcRef,
      qtyRequired:        num(r['Requested quantity']),
      qtyPicked:          num(r['Picked quantity']),
      onOrder:            num(r['On order']),
      available:          num(r['Available physical']),
      reserved:           num(r['Reserved physical']),
      qtyAllocated:       num(r['Quantity allocated']),
      remainingAmount:    num(r['Remainig amount main currency'] || 0),
      openPurchaseOrders: str(r['Open Purchase Orders'] || ''),
      customerNameCalc:   str(r['Customer Name'] || r['Customer name'] || r['Customer name2'] || ''),
      confirmedShipCalc:  fmtDate(r['Confirmed ship date']),
      requestedShipCalc:  fmtDate(r['Requested ship date']),
    })

    e.totalQtyRequired += num(r['Requested quantity'])
    e.totalQtyPicked   += num(r['Picked quantity'])
    e.totalOnOrder     += num(r['On order'])
    e.totalAvailable   += num(r['Available physical'])
    e.totalReserved    += num(r['Reserved physical'])
  })

  return Object.values(itemMap).map(item => {
    // ─── Find orders ─────────────────────────────────────────────
    let rootPRDs = []
    const allOrders = []
    const allKeys = new Set()

    if (isFormatB) {
      // Format B: Calc Number column = starting PRD, traverse chain to root
      for (const startPRD of item.calcPRDs) {
        if (!startPRD) continue
        const roots = findRootPRDs(startPRD, dr4ByProd, dr5ByProd, soByPRD, null)
        rootPRDs.push(...roots)
        if (roots.length === 0 && soByPRD[startPRD]) rootPRDs.push(startPRD)
      }
      rootPRDs = [...new Set(rootPRDs)]
    } else {
      // Format A: find via Main component in DR4/DR5
      rootPRDs = findRootPRDsViaMainComp(item.itemNumber, dr4ByMain, dr5ByMain, dr4ByProd, dr5ByProd, soByPRD)
    }

    // Collect orders from root PRDs
    rootPRDs.forEach(prd => {
      (soByPRD[prd] || []).forEach(o => {
        const key = `${o.salesOrder}-${o.lineNumber}`
        if (!allKeys.has(key)) { allKeys.add(key); allOrders.push({ ...o, prd, sourcePRD: true }) }
      })
    })

    // Format A: also collect from direct SO references
    if (!isFormatB) {
      item.calcRows.forEach(cr => {
        if (!cr.salesOrder) return
        let orderInfo = null
        if (!cr.isGmar) orderInfo = soBySOLine[`${cr.salesOrder}-${lineN(cr.rawLine)}`]
        if (!orderInfo) orderInfo = (soBySOItem[`${cr.salesOrder}__${item.itemNumber}`] || [])[0]
        const line = orderInfo?.lineNumber || (cr.isGmar ? '' : lineN(cr.rawLine))
        const key = `${cr.salesOrder}-${line}`
        if (!allKeys.has(key)) {
          allKeys.add(key)
          allOrders.push({
            salesOrder:        cr.salesOrder,
            lineNumber:        line,
            customerName:      orderInfo?.customerName || cr.customerNameCalc,
            confirmedShipDate: orderInfo?.confirmedShipDate || cr.confirmedShipCalc,
            requestedShipDate: orderInfo?.requestedShipDate || cr.requestedShipCalc,
            pool:              orderInfo?.pool || '',
            remainingAmount:   cr.remainingAmount,
            qtyRequired:       cr.qtyRequired,
            openPurchaseOrders: cr.openPurchaseOrders,
            isBO:              cr.isBO,
            prd:               orderInfo?.production || '',
          })
        }
      })
    }

    // ─── Stage ───────────────────────────────────────────────────
    const firstCalcPRD = [...item.calcPRDs][0] || ''
    const { stage, prd: stagePrd } = determineStage(item.itemNumber, dr4ByMain, dr5ByMain, poByItem, isFormatB, firstCalcPRD)
    const prd = rootPRDs[0] || stagePrd || firstCalcPRD

    // ─── PO info ─────────────────────────────────────────────────
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

    const boOrders = item.isBO ? allOrders : allOrders.filter(o =>
      o.isBO || boSet.orders.has(`${o.salesOrder}__${item.itemNumber}`) || boSet.items.has(item.itemNumber))

    return {
      itemNumber:          item.itemNumber,
      productName:         item.productName,
      isBO:                item.isBO,
      procurementStatus,
      stage, prd, rootPRDs,
      orders:              allOrders,
      boOrders,
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
      purchaseOrders: pos,
      totalRemainingAmount: allOrders.reduce((s, o) => s + (o.remainingAmount || 0), 0),
    }
  })
}
