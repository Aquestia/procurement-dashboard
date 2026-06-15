import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts'
import { Badge, fmtDate, LoadingState, EmptyState } from '../components/shared'
import * as XLSX from 'xlsx'

const COLORS = ['#378ADD', '#7F77DD', '#EF9F27', '#E24B4A', '#639922', '#B5D4F4']

function exportToExcel(data, filename, sheetName) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'נתונים')
  XLSX.writeFile(wb, filename)
}

export default function Overview({ data, loading, stageSummary }) {
  // ── ALL HOOKS FIRST — no early returns before this line ──
  const [expandedBottleneck, setExpandedBottleneck] = useState(null)

  const now = new Date()
  const dateStr = now.toLocaleDateString('he-IL', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
  const timeStr = now.toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' })

  const stats = useMemo(() => {
    if (!data || data.length === 0) return null
    const bo     = data.filter(r => r.isBO)
    const danger = data.filter(r => r.procurementStatus === 'בסכנה')
    const noPO   = data.filter(r => !r.hasPO)
    const noDate = data.filter(r => r.hasPO && r.hasNoDate)
    const late   = data.filter(r => r.isLateReceipt)

    const byMonth = {}
    data.forEach(r => r.orders?.forEach(o => {
      if (o.confirmedShipDate) {
        const d = new Date(o.confirmedShipDate)
        if (!isNaN(d)) {
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
          const label = d.toLocaleDateString('he-IL', { month:'short', year:'2-digit' })
          if (!byMonth[key]) byMonth[key] = { key, label, count: 0 }
          byMonth[key].count++
        }
      }
    }))
    const monthData = Object.values(byMonth).sort((a,b) => a.key.localeCompare(b.key)).slice(0,8)

    const byCustomer = {}
    bo.forEach(r => {
      const addCustomer = (name, so) => {
        if (!byCustomer[name]) byCustomer[name] = new Set()
        if (so) byCustomer[name].add(so)
      }
      if (r.boOrders?.length > 0) {
        r.boOrders.forEach(o => addCustomer(o.customerName || 'לא ידוע', o.salesOrder))
      } else {
        r.orders?.forEach(o => addCustomer(o.customerName || 'לא ידוע', o.salesOrder))
      }
    })
    const customerData = Object.entries(byCustomer)
      .map(([name, orders]) => ({ name, count: orders.size }))
      .sort((a,b) => b.count - a.count).slice(0, 8)

    const bottlenecks = [...data]
      .sort((a,b) => b.affectedOrdersCount - a.affectedOrdersCount)
      .slice(0, 5)
      .map(r => ({
        item: r.itemNumber, productName: r.productName,
        count: r.affectedOrdersCount, isBO: r.isBO,
        stage: r.stage, prd: r.prd,
        orders: r.orders || [], purchaseOrders: r.purchaseOrders || [],
        totalQtyRequired: r.totalQtyRequired, shortage: r.shortage,
        vendors: r.vendors || [],
        level: r.affectedOrdersCount >= 10 ? 'קריטי' : r.affectedOrdersCount >= 5 ? 'בינוני' : 'נמוך',
        levelColor: r.affectedOrdersCount >= 10 ? '#A32D2D' : r.affectedOrdersCount >= 5 ? '#854F0B' : '#3B6D11',
        levelBg: r.affectedOrdersCount >= 10 ? '#FCEBEB' : r.affectedOrdersCount >= 5 ? '#FAEEDA' : '#EAF3DE',
      }))

    const poStatus = [
      { name:'הוזמן',        value: data.filter(r=>r.hasPO&&!r.hasNoDate).length, color:'#639922', rows: data.filter(r=>r.hasPO&&!r.hasNoDate) },
      { name:'ללא הזמנה',    value: noPO.length,  color:'#E24B4A', rows: noPO },
      { name:'ללא תאריך',    value: noDate.length, color:'#EF9F27', rows: noDate },
      { name:'מאחר',         value: late.length,   color:'#E24B4A', rows: late },
    ]

    const totalUSD = bo.reduce((s,r) => s + (r.totalRemainingAmount||0), 0)
    return { bo, danger, noPO, noDate, monthData, customerData, bottlenecks, poStatus, totalUSD }
  }, [data])

  const stageData = useMemo(() => {
    if (stageSummary) {
      const arr = [
        { name:'DR5 — צבע',           value: stageSummary.dr5Count   || 0 },
        { name:'DR4 — עיבוד שבבי',    value: stageSummary.dr4Count   || 0 },
        { name:'PRD — הרכבה ישירה',   value: stageSummary.prdCount   || 0 },
        { name:'רכש גלם ישיר',        value: stageSummary.directCount|| 0 },
      ].filter(s => s.value > 0)
      if (arr.length > 0) return arr
    }
    if (!data) return []
    const c = {'DR5 — צבע':0,'DR4 — עיבוד שבבי':0,'PRD — הרכבה ישירה':0,'רכש גלם ישיר':0}
    data.forEach(r => {
      const s = r.stage || ''
      if (s.includes('DR5'))      c['DR5 — צבע']++
      else if (s.includes('DR4')) c['DR4 — עיבוד שבבי']++
      else if (s === 'PRD')       c['PRD — הרכבה ישירה']++
      else                        c['רכש גלם ישיר']++
    })
    return Object.entries(c).filter(([,v])=>v>0).map(([name,value])=>({name,value}))
  }, [data, stageSummary])

  // ── EARLY RETURNS after all hooks ──
  if (loading) return <LoadingState />
  if (!data || data.length === 0 || !stats) return <EmptyState />

  const kpiItems = [
    { label:'סה"כ מק"טים חסרים', value:data.length,          sub:'ייחודיים',     color:'#185FA5', rows:data },
    { label:'מק"טים BO',          value:stats.bo.length,      sub:`$${Math.round(stats.totalUSD).toLocaleString()}`, color:'#A32D2D', rows:stats.bo },
    { label:'בסכנת BO',           value:stats.danger.length,  sub:'ללא רכש',      color:'#854F0B', rows:stats.danger },
    { label:'ללא הזמנת רכש',      value:stats.noPO.length,    sub:'דורש טיפול',   color:'#A32D2D', rows:stats.noPO },
    { label:'ללא תאריך קבלה',     value:stats.noDate.length,  sub:'הזמנות פתוחות',color:'#854F0B', rows:stats.noDate },
  ]

  return (
    <div style={{ padding:20 }}>
      <div style={{ display:'flex', alignItems:'center', marginBottom:16 }}>
        <h1 style={{ fontSize:18, fontWeight:600, color:'#1a1a1a', flex:1 }}>סקירה כללית</h1>
        <div style={{ fontSize:12, color:'#888', display:'flex', alignItems:'center', gap:6 }}>
          <span>🕐</span><span>{dateStr} — {timeStr}</span>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:16 }}>
        {kpiItems.map((k,i) => <KpiCard key={i} {...k} />)}
      </div>

      {/* Monthly chart */}
      <div style={{ marginBottom:12 }}>
        <ChartCard title='חוסרים לפי חודש אספקה מאושר'>
          <ResponsiveContainer width='100%' height={180}>
            <BarChart data={stats.monthData} margin={{ top:16, right:8, left:-20, bottom:4 }}>
              <XAxis dataKey='label' tick={{ fontSize:10 }} />
              <YAxis tick={{ fontSize:10 }} />
              <Tooltip formatter={v => [v, 'מק"טים']} />
              <Bar dataKey='count' radius={[3,3,0,0]}>
                <LabelList dataKey='count' position='top' style={{ fontSize:10, fill:'#555' }} />
                {stats.monthData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2 */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:12, marginBottom:12 }}>
        {/* Bottlenecks */}
        <ChartCard title='צווארי בקבוק — מק"טים קריטיים'>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:4 }}>
            {stats.bottlenecks.map((bn,i) => (
              <div key={i}>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:6,
                  border:`0.5px solid ${bn.isBO?'#F09595':'#e0e0da'}`,
                  background:bn.isBO?'#FCEBEB18':'#fff', cursor:'pointer' }}
                  onClick={() => setExpandedBottleneck(expandedBottleneck===bn.item ? null : bn.item)}>
                  <span style={{ fontSize:11, fontWeight:600, flex:1, overflow:'hidden', textOverflow:'ellipsis' }}>{bn.item}</span>
                  <span style={{ fontSize:10, color:'#888' }}>{bn.count} הזמנות</span>
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:8, fontWeight:600, background:bn.levelBg, color:bn.levelColor }}>{bn.level}</span>
                  <span style={{ fontSize:11, color:'#378ADD' }}>{expandedBottleneck===bn.item?'▲':'▼'}</span>
                </div>
                {expandedBottleneck === bn.item && <BottleneckPanel bn={bn} />}
              </div>
            ))}
          </div>
        </ChartCard>



        {/* PO Status */}
        <ChartCard title='סטטוס רכש'>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:4 }}>
            {stats.poStatus.map((s,i) => {
              const max = Math.max(...stats.poStatus.map(x => x.value), 1)
              return (
                <div key={i}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:2 }}>
                    <span style={{ color:'#555' }}>{s.name}</span>
                    <span style={{ fontWeight:600 }}>{s.value}</span>
                  </div>
                  <div style={{ height:8, background:'#f0f0ea', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(s.value/max)*100}%`, background:s.color, borderRadius:4 }} />
                  </div>
                </div>
              )
            })}
          </div>
          <button onClick={() => exportPOStatus(stats.poStatus)} style={{
            marginTop:12, width:'100%', fontSize:11, padding:'5px 0',
            border:'0.5px solid #378ADD', borderRadius:6, background:'transparent',
            color:'#378ADD', cursor:'pointer'
          }}>⬇ ייצוא נתונים מלאים</button>
        </ChartCard>
      </div>

      {/* BO by customer — full width */}
      <ChartCard title='Back Orders לפי לקוח — TOP 8'>
        <ResponsiveContainer width='100%' height={260}>
          <BarChart data={stats.customerData} layout='vertical' margin={{ top:4, right:50, left:8, bottom:4 }}>
            <XAxis type='number' tick={{ fontSize:11 }} />
            <YAxis type='category' dataKey='name' tick={{ fontSize:11, fill:'#444' }} width={230} />
            <Tooltip formatter={v => [v, 'הזמנות BO']} />
            <Bar dataKey='count' fill='#C0392B' radius={[0,4,4,0]}>
              <LabelList dataKey='count' position='right' style={{ fontSize:12, fill:'#333', fontWeight:600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, rows }) {
  const [open, setOpen] = useState(false)

  function exportRows() {
    if (!rows || rows.length === 0) return
    const exportData = rows.map(r => ({
      'מק"ט': r.itemNumber, 'תיאור': r.productName,
      'סטטוס': r.procurementStatus, 'שלב': r.stage, 'פק"ע': r.prd||'',
      'מספר הזמנה': r.orders?.[0]?.salesOrder||'', 'שורה': r.orders?.[0]?.lineNumber||'',
      'לקוח': r.orders?.[0]?.customerName||'',
      'ת. אספקה מאושר': fmtDate(r.orders?.[0]?.confirmedShipDate),
      'נדרש': r.totalQtyRequired, 'חוסר נטו': r.shortage,
      'ספק': r.vendors?.join(', ')||'', 'צפי קבלה': fmtDate(r.confirmedReceiptDate),
      'הזמנות מושפעות': r.affectedOrdersCount,
    }))
    exportToExcel(exportData, `${label}.xlsx`, label)
  }

  return (
    <div style={{ background:'#f4f4f0', borderRadius:8, padding:'10px 12px', cursor:'pointer' }}
      onClick={() => rows && setOpen(o => !o)}>
      <div style={{ fontSize:11, color:'#666', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:600, color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'#999', marginTop:3 }}>{sub}</div>}
      {rows && <div style={{ fontSize:10, color:'#378ADD', marginTop:4 }}>{open?'▲ סגור':'▼ הצג רשימה'}</div>}
      {open && rows && (
        <div style={{ marginTop:10 }} onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:6 }}>
            <button onClick={exportRows} style={{ fontSize:10, padding:'3px 8px', border:'0.5px solid #378ADD', borderRadius:5, background:'#378ADD', color:'#fff', cursor:'pointer' }}>ייצוא Excel</button>
          </div>
          <div style={{ overflowX:'auto', maxHeight:250, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr>{['מק"ט','סטטוס','שלב','נדרש','חוסר','ספק','צפי קבלה'].map(h => (
                  <th key={h} style={{ background:'#f0f0ec', padding:'4px 6px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {rows.slice(0,100).map((r,i) => (
                  <tr key={i} style={{ background:i%2===0?'#fff':'#fafaf8' }}>
                    <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', fontWeight:500 }}>{r.itemNumber}</td>
                    <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea' }}><Badge status={r.procurementStatus} /></td>
                    <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', fontSize:10 }}>{r.stage}</td>
                    <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea' }}>{r.totalQtyRequired}</td>
                    <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', color:r.shortage>0?'#A32D2D':'#3B6D11', fontWeight:600 }}>{r.shortage}</td>
                    <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.vendors?.join(', ')||'—'}</td>
                    <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(r.confirmedReceiptDate)||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bottleneck panel ──────────────────────────────────────────────
function BottleneckPanel({ bn }) {
  function exportBN() {
    const rows = []
    bn.orders.forEach(o => rows.push({
      'סוג':'הזמנת מכירה', 'מספר':o.salesOrder, 'שורה':o.lineNumber,
      'לקוח':o.customerName, 'ת. מאושר':fmtDate(o.confirmedShipDate),
      'ת. מבוקש':fmtDate(o.requestedShipDate), 'כמות':o.qtyRequired||'',
      'פק"ע':o.prd||'', 'ספק':'', 'יתרה':'', 'צפי קבלה':'',
    }))
    bn.purchaseOrders.forEach(p => rows.push({
      'סוג':'הזמנת רכש', 'מספר':p.purchaseOrder, 'שורה':p.lineNumber,
      'לקוח':'', 'ת. מאושר':'', 'ת. מבוקש':'', 'כמות':p.quantity,
      'פק"ע':'', 'ספק':p.vendorName, 'יתרה':p.deliverRemainder,
      'צפי קבלה':fmtDate(p.confirmedReceiptDate),
    }))
    exportToExcel(rows, `צוואר_${bn.item}.xlsx`, bn.item)
  }

  return (
    <div style={{ background:'#fafaf8', border:'0.5px solid #e0e0da', borderRadius:6, padding:'10px 12px', marginTop:4 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <span style={{ fontSize:11, fontWeight:600 }}>{bn.item} — {bn.productName}</span>
        <Badge status={bn.stage} />
        <span style={{ fontSize:10, color:'#888', marginRight:'auto' }}>נדרש: <strong>{bn.totalQtyRequired}</strong> | חוסר: <strong style={{ color:'#A32D2D' }}>{bn.shortage}</strong></span>
        <button onClick={exportBN} style={{ fontSize:10, padding:'3px 8px', border:'0.5px solid #378ADD', borderRadius:5, background:'#378ADD', color:'#fff', cursor:'pointer' }}>⬇ Excel</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:'#555', marginBottom:4 }}>הזמנות ({bn.orders.length})</div>
          <div style={{ maxHeight:140, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
              <thead><tr>{['הזמנה','שורה','לקוח','ת. מאושר'].map(h => (
                <th key={h} style={{ background:'#f0f0ec', padding:'3px 5px', fontWeight:600, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
              ))}</tr></thead>
              <tbody>{bn.orders.map((o,j) => (
                <tr key={j} style={{ background:j%2===0?'#fff':'#f9f9f7' }}>
                  <td style={{ padding:'3px 5px', borderBottom:'0.5px solid #f0f0ea' }}>{o.salesOrder||'—'}</td>
                  <td style={{ padding:'3px 5px', borderBottom:'0.5px solid #f0f0ea' }}>{o.lineNumber||'—'}</td>
                  <td style={{ padding:'3px 5px', borderBottom:'0.5px solid #f0f0ea', maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.customerName||'—'}</td>
                  <td style={{ padding:'3px 5px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(o.confirmedShipDate)||'—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:'#555', marginBottom:4 }}>הזמנות רכש ({bn.purchaseOrders.length})</div>
          {bn.purchaseOrders.length === 0
            ? <div style={{ fontSize:10, color:'#A32D2D' }}>❌ אין הזמנות רכש</div>
            : <div style={{ maxHeight:140, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                  <thead><tr>{['הז. רכש','ספק','יתרה','צפי קבלה'].map(h => (
                    <th key={h} style={{ background:'#f0f0ec', padding:'3px 5px', fontWeight:600, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{bn.purchaseOrders.map((p,j) => (
                    <tr key={j} style={{ background:j%2===0?'#fff':'#f9f9f7' }}>
                      <td style={{ padding:'3px 5px', borderBottom:'0.5px solid #f0f0ea' }}>{p.purchaseOrder}</td>
                      <td style={{ padding:'3px 5px', borderBottom:'0.5px solid #f0f0ea', maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.vendorName}</td>
                      <td style={{ padding:'3px 5px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{p.deliverRemainder}</td>
                      <td style={{ padding:'3px 5px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', color:!p.confirmedReceiptDate?'#A32D2D':'#1a1a1a' }}>
                        {p.confirmedReceiptDate ? fmtDate(p.confirmedReceiptDate) : '⚠️ חסר'}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
          }
        </div>
      </div>
    </div>
  )
}

// ── Chart card ────────────────────────────────────────────────────
function ChartCard({ title, children, onExport }) {
  return (
    <div style={{ background:'#fff', border:'0.5px solid #e5e5e0', borderRadius:10, padding:14 }}>
      <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:12, fontWeight:600, flex:1 }}>{title}</span>
        {onExport && (
          <button onClick={onExport} style={{ fontSize:10, padding:'2px 8px', border:'0.5px solid #378ADD', borderRadius:5, background:'transparent', color:'#378ADD', cursor:'pointer' }}>⬇ Excel</button>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Exports ───────────────────────────────────────────────────────
function exportPOStatus(poStatus) {
  const rows = []
  poStatus.forEach(s => {
    s.rows?.forEach(r => {
      const orders = r.orders?.length > 0 ? r.orders : [{}]
      const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
      orders.forEach(o => pos.forEach(po => {
        rows.push({
          'קטגוריה': s.name, 'מק"ט': r.itemNumber, 'תיאור': r.productName,
          'סטטוס': r.procurementStatus, 'שלב': r.stage, 'פק"ע': r.prd||'',
          'מספר הזמנה': o.salesOrder||'', 'שורה': o.lineNumber||'',
          'לקוח': o.customerName||'', 'ת. אספקה מאושר': fmtDate(o.confirmedShipDate),
          'ת. אספקה מבוקש': fmtDate(o.requestedShipDate),
          'נדרש': r.totalQtyRequired, 'נאסף': r.totalQtyPicked,
          'זמין': r.totalAvailable, 'חוסר נטו': r.shortage,
          'הז. רכש': po.purchaseOrder||'אין', 'שורת רכש': po.lineNumber||'',
          'ספק': po.vendorName||'', 'קב. רכש': po.buyerGroup||'',
          'כמות הוזמנה': po.quantity||'', 'יתרה': po.deliverRemainder||'',
          'ת. קבלה מאושר': fmtDate(po.confirmedReceiptDate),
        })
      }))
    })
  })
  exportToExcel(rows, 'סטטוס_רכש_מלא.xlsx', 'סטטוס רכש')
}

function exportStageData(stageData, data) {
  const rows = []
  data?.forEach(r => {
    const s = r.stage || ''
    let cat = s.includes('DR5') ? 'DR5 — צבע' : s.includes('DR4') ? 'DR4 — עיבוד שבבי' : s==='PRD' ? 'PRD — הרכבה ישירה' : 'רכש גלם ישיר'
    const orders = r.orders?.length > 0 ? r.orders : [{}]
    const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
    orders.forEach(o => pos.forEach(po => {
      rows.push({
        'שלב': cat, 'פק"ע': r.prd||'', 'מק"ט': r.itemNumber, 'תיאור': r.productName,
        'מספר הזמנה': o.salesOrder||'', 'שורה': o.lineNumber||'',
        'לקוח': o.customerName||'', 'ת. אספקה מאושר': fmtDate(o.confirmedShipDate),
        'נדרש': r.totalQtyRequired, 'חוסר נטו': r.shortage,
        'הז. רכש': po.purchaseOrder||'', 'ספק': po.vendorName||'',
        'קב. רכש': po.buyerGroup||'', 'יתרה': po.deliverRemainder||'',
        'ת. קבלה מאושר': fmtDate(po.confirmedReceiptDate),
      })
    }))
  })
  exportToExcel(rows, 'שלבי_ייצור_מלא.xlsx', 'שלבי ייצור')
}
