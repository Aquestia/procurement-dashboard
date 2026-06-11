import * as XLSX from 'xlsx'

export function processExcelFile(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  const sheets = {}
  for (const name of workbook.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null })
  }

  const boRows = parseBO(sheets)
  const openOrders = parseOpenSalesOrders(sheets)
  const dr4Rows = parseDR4(sheets)
  const dr5Rows = parseDR5(sheets)
  const calcAlloc = parseCalcAllocation(sheets)
  const openPO = parseOpenPO(sheets)

  const enriched = enrichData(boRows, openOrders, dr4Rows, dr5Rows, calcAlloc, openPO)

  return {
    boRows,
    openOrders,
    dr4Rows,
    dr5Rows,
    calcAlloc,
    openPO,
    enriched,
    allItems: enriched,
  }
}

function getSheetByName(sheets, keywords) {
  for (const name of Object.keys(sheets)) {
    for (const kw of keywords) {
      if (name.toLowerCase().includes(kw.toLowerCase())) return sheets[name]
    }
  }
  return []
}

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return []
  const headers = rows[0].map((h, i) => (h ? String(h).trim() : `col_${i}`))
  return rows.slice(1).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? null })
    return obj
  })
}

function parseBO(sheets) {
  const raw = getSheetByName(sheets, ['BO'])
  const rows = rowsToObjects(raw)
  return rows.filter(r => r['S & L'] || r['Doc']).map(r => ({
    sl: String(r['S & L'] || '').trim(),
    doc: String(r['Doc'] || '').trim(),
    line: String(r['Line'] !== undefined ? r['Line'] : '').trim(),
    itemCode: String(r['Item Code'] || '').trim(),
    customer: String(r['Customer'] || '').trim(),
    requestedDate: r['Requested Date'],
    sla: r['SLA'],
    cdd: r['CDD'],
    backOrdersUSD: r['Back Orders $'] || 0,
    boNotes: String(r['BO Notes'] || '').trim(),
  }))
}

function parseOpenSalesOrders(sheets) {
  const raw = getSheetByName(sheets, ['open sales', 'sales order'])
  const rows = rowsToObjects(raw)
  return rows.filter(r => r['Sales order'] || r['Sales order line numbers']).map(r => ({
    salesOrder: String(r['Sales order'] || '').trim(),
    lineNumber: String(r['Line number'] !== undefined ? r['Line number'] : '').trim(),
    slKey: String(r['Sales order line numbers'] || '').trim(),
    production: String(r['Production'] || '').trim(),
    itemNumber: String(r['Item number'] || '').trim(),
    customerName: String(r['Customer name'] || '').trim(),
    confirmedShipDate: r['Confirmed ship date'],
    requestedShipDate: r['Requested ship date'],
    pool: String(r['Pool'] || '').trim(),
    deliverRemainder: r['Deliver remainder'],
    salesAmountUSD: r['Market Cost'] || 0,
  }))
}

function parseDR4(sheets) {
  const raw = getSheetByName(sheets, ['DR4'])
  const rows = rowsToObjects(raw)
  return rows.filter(r => r['Parent production order'] || r['Production order']).map(r => ({
    parentPO: String(r['Parent production order'] || '').trim(),
    productionOrder: String(r['Production order'] || '').trim(),
    itemNumber: String(r['Item number'] || '').trim(),
    productName: String(r['Product name'] || '').trim(),
    quantity: r['Quantity'] || 0,
    status: String(r['Status'] || '').trim(),
    deliveryDate: r['Original Delivery Date'],
    productionDate: r['Production date'],
    parentPORequestedDate: r['Parent PO requested date'],
  }))
}

function parseDR5(sheets) {
  const raw = getSheetByName(sheets, ['DR5'])
  const rows = rowsToObjects(raw)
  return rows.filter(r => r['Parent production order'] || r['Production order']).map(r => ({
    parentPO: String(r['Parent production order'] || '').trim(),
    productionOrder: String(r['Production order'] || '').trim(),
    itemNumber: String(r['Item number'] || '').trim(),
    productName: String(r['Product name'] || '').trim(),
    quantity: r['Quantity'] || 0,
    status: String(r['Status'] || '').trim(),
    deliveryDate: r['Original Delivery Date'],
    productionDate: r['Production date'],
  }))
}

function parseCalcAllocation(sheets) {
  const raw = getSheetByName(sheets, ['calculated', 'alloc'])
  const rows = rowsToObjects(raw)
  return rows.filter(r => r['Item number']).map(r => ({
    itemNumber: String(r['Item number'] || '').trim(),
    reference: String(r['Reference'] || r['Sales order'] || '').trim(),
    salesOrder: String(r['Sales order'] || '').trim(),
    lineNumber: String(r['Line number'] !== undefined ? r['Line number'] : '').trim(),
    customerName: String(r['Customer name2'] || r['Customer Name'] || '').trim(),
    shortageExist: r['Shortage exist'],
    requestedQty: r['Requested quantity'] || 0,
    pickedQty: r['Picked quantity'] || 0,
    availablePhysical: r['Available physical'] || 0,
    onOrder: r['On order'] || 0,
    requestedDeliveryDate: r['Requested delivery date'],
    purchaseOrderQty: r['Purchase Order Quantity'] || 0,
    openPurchaseOrders: String(r['Open Purchase Orders'] || '').trim(),
  }))
}

function parseOpenPO(sheets) {
  const raw = getSheetByName(sheets, ['open purchase order lines', 'purchase order lines'])
  const rows = rowsToObjects(raw)
  return rows.filter(r => r['Item number']).map(r => ({
    itemNumber: String(r['Item number'] || '').trim(),
    purchaseOrder: String(r['Purchase order'] || '').trim(),
    lineNumber: String(r['Line number'] !== undefined ? r['Line number'] : '').trim(),
    poLineNumber: String(r['PO & Line number'] || '').trim(),
    vendorName: String(r['Vendor name'] || '').trim(),
    quantity: r['Quantity'] || 0,
    deliverRemainder: r['Deliver remainder'] || 0,
    confirmedReceiptDate: r['Confirmed receipt date'],
    requestedReceiptDate: r['Requested receipt date'],
    approvalStatus: String(r['Approval status'] || '').trim(),
    documentStatus: String(r['Document status'] || '').trim(),
    poNote: String(r['PO Note'] || '').trim(),
    buyerGroup: String(r['Buyer group'] || '').trim(),
  }))
}

function enrichData(boRows, openOrders, dr4Rows, dr5Rows, calcAlloc, openPO) {
  // Build lookup maps
  const boSet = new Set(boRows.map(r => r.sl))

  // DR4: parentPO → production order mapping
  const dr4ByParent = {}
  dr4Rows.forEach(r => {
    if (r.parentPO && r.parentPO !== 'NaN') {
      if (!dr4ByParent[r.parentPO]) dr4ByParent[r.parentPO] = []
      dr4ByParent[r.parentPO].push(r)
    }
  })

  // DR5: parentPO → production order mapping
  const dr5ByParent = {}
  dr5Rows.forEach(r => {
    if (r.parentPO && r.parentPO !== 'NaN') {
      if (!dr5ByParent[r.parentPO]) dr5ByParent[r.parentPO] = []
      dr5ByParent[r.parentPO].push(r)
    }
  })

  // Open orders: production → sales order mapping
  const ordersByProduction = {}
  openOrders.forEach(r => {
    if (r.production) {
      if (!ordersByProduction[r.production]) ordersByProduction[r.production] = []
      ordersByProduction[r.production].push(r)
    }
  })

  // Open orders: by sales order + line
  const ordersBySL = {}
  openOrders.forEach(r => {
    const key = `${r.salesOrder}-${r.lineNumber}`
    ordersBySL[key] = r
  })

  // Open PO by item number
  const poByItem = {}
  openPO.forEach(r => {
    if (!poByItem[r.itemNumber]) poByItem[r.itemNumber] = []
    poByItem[r.itemNumber].push(r)
  })

  // Calc allocation by item+order+line
  const allocByItem = {}
  calcAlloc.forEach(r => {
    if (!allocByItem[r.itemNumber]) allocByItem[r.itemNumber] = []
    allocByItem[r.itemNumber].push(r)
  })

  // Build enriched rows from open orders
  const result = openOrders.map(order => {
    const slKey = `${order.salesOrder}-${order.lineNumber}`
    const isBO = boSet.has(slKey) || boSet.has(order.slKey)

    // Determine production stage
    let stage = null
    let stageDetails = null

    if (order.production && order.production.startsWith('PRD')) {
      stage = 'PRD'
      stageDetails = order.production
    } else {
      // Check DR4
      const dr4Match = dr4Rows.find(d => d.parentPO === order.production || d.productionOrder === order.production)
      if (dr4Match) {
        stage = 'DR4'
        stageDetails = dr4Match.productionOrder
        // Check if also goes through DR5
        const dr5Match = dr5Rows.find(d => d.parentPO === dr4Match.productionOrder || d.parentPO === dr4Match.parentPO)
        if (dr5Match) stage = 'DR4→DR5'
      } else {
        // Check DR5
        const dr5Match = dr5Rows.find(d => d.parentPO === order.production || d.productionOrder === order.production)
        if (dr5Match) {
          stage = 'DR5'
          stageDetails = dr5Match.productionOrder
          // Check if also goes through DR4
          const dr4Match2 = dr4Rows.find(d => d.parentPO === dr5Match.productionOrder)
          if (dr4Match2) stage = 'DR5→DR4'
        }
      }
    }

    // Get open PO for this item
    const itemPOs = poByItem[order.itemNumber] || []
    const hasPO = itemPOs.length > 0
    const latestPO = itemPOs.sort((a, b) => {
      if (!a.confirmedReceiptDate) return 1
      if (!b.confirmedReceiptDate) return -1
      return new Date(a.confirmedReceiptDate) - new Date(b.confirmedReceiptDate)
    })[0]

    const confirmedReceiptDate = latestPO?.confirmedReceiptDate || null
    const isLateReceipt = confirmedReceiptDate && order.confirmedShipDate &&
      new Date(confirmedReceiptDate) > new Date(order.confirmedShipDate)
    const hasNoDate = hasPO && !confirmedReceiptDate

    // Shortage info
    const allocs = allocByItem[order.itemNumber] || []
    const shortage = allocs.find(a => a.salesOrder === order.salesOrder)

    // Determine procurement status
    let procurementStatus = 'תקין'
    if (isBO) procurementStatus = 'BO'
    else if (!hasPO || isLateReceipt) procurementStatus = 'בסכנה'

    return {
      // Keys
      salesOrder: order.salesOrder,
      lineNumber: order.lineNumber,
      slKey,
      itemNumber: order.itemNumber,
      // Status
      isBO,
      procurementStatus,
      stage: stage || 'לא ידוע',
      stageDetails,
      // Order info
      customerName: order.customerName,
      confirmedShipDate: order.confirmedShipDate,
      requestedShipDate: order.requestedShipDate,
      pool: order.pool,
      deliverRemainder: order.deliverRemainder,
      salesAmountUSD: order.salesAmountUSD,
      // PO info
      hasPO,
      purchaseOrders: itemPOs,
      confirmedReceiptDate,
      isLateReceipt,
      hasNoDate,
      vendorName: latestPO?.vendorName || null,
      poQtyOrdered: itemPOs.reduce((sum, p) => sum + (p.deliverRemainder || 0), 0),
      // Shortage
      shortage,
      qtyRequired: shortage?.requestedQty || order.deliverRemainder || 0,
    }
  })

  return result
}
