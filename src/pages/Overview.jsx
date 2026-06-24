import { useMemo, useState, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import { Badge, fmtDate, LoadingState, EmptyState } from '../components/shared'
import * as XLSX from 'xlsx'

const COLORS = ['#378ADD', '#7F77DD', '#EF9F27', '#E24B4A', '#639922', '#B5D4F4']

function exportToExcel(data, filename, sheetName) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'נתונים')
  XLSX.writeFile(wb, filename)
}

export default function Overview({ data, loading, stageSummary, financials, notes, saveNote }) {
  const [expandedBottleneck, setExpandedBottleneck] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [editingRow, setEditingRow] = useState(null)

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
    data.forEach(r => {
      const seenMonths = new Set()
      r.orders?.forEach(o => {
        if (o.confirmedShipDate) {
          const s = String(o.confirmedShipDate)
          const match = s.match(/^(\d{4})-(\d{2})/)
          if (match) {
            const key = `${match[1]}-${match[2]}`
            if (seenMonths.has(key)) return
            seenMonths.add(key)
            const d = new Date(`${match[1]}-${match[2]}-01`)
            const label = d.toLocaleDateString('he-IL', { month:'short', year:'2-digit' })
            if (!byMonth[key]) byMonth[key] = { key, label, count: 0 }
            byMonth[key].count++
          }
        }
      })
    })
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

    const seenOrders = new Set()
    let totalUSD = 0
    bo.forEach(r => {
      r.orders?.forEach(o => {
        const key = `${o.salesOrder}-${o.lineNumber}`
        if (!seenOrders.has(key)) {
          seenOrders.add(key)
          totalUSD += (o.remainingAmount || 0)
        }
      })
    })
    return { bo, danger, noPO, noDate, monthData, customerData, bottlenecks, poStatus, totalUSD }
  }, [data])

  const selectedMonthData = useMemo(() => {
    if (!selectedMonth || !data) return null
    const items = data.filter(r =>
      r.orders?.some(o => o.confirmedShipDate?.startsWith(selectedMonth.key))
    )
    const boItems = items.filter(r => r.isBO)
    const byCustomer = {}
    boItems.forEach(r => {
      r.orders?.filter(o => o.confirmedShipDate?.startsWith(selectedMonth.key)).forEach(o => {
        const name = o.customerName || 'לא ידוע'
        if (!byCustomer[name]) byCustomer[name] = { name, items: [], orders: new Set() }
        if (o.salesOrder) byCustomer[name].orders.add(o.salesOrder)
        if (!byCustomer[name].items.find(i => i.itemNumber === r.itemNumber))
          byCustomer[name].items.push(r)
      })
    })
    const topCustomers = Object.values(byCustomer)
      .map(c => ({ ...c, count: c.orders.size }))
      .sort((a,b) => b.count - a.count).slice(0, 8)
    return { items, boItems, topCustomers }
  }, [selectedMonth, data])

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

  if (loading) return <LoadingState />
  if (!data || data.length === 0 || !stats) return <EmptyState />

  const kpiItems = [
    { label:'סה"כ מק"טים חסרים', value:data.length,          sub:financials ? `$${Math.round(financials.totalRemainingAll).toLocaleString()}` : 'ייחודיים', color:'#185FA5', rows:data,
      info:'כל המק"טים הייחודיים שמופיעים בלשונית Calculated Allocation עם Shortage = Yes. כל פריט שיש לו חוסר כלשהו, ללא קשר אם הוא BO או לא.' },
    { label:'מק"טים BO',          value:stats.bo.length,      sub:financials ? `$${Math.round(financials.totalBO).toLocaleString()}` : `$${Math.round(stats.totalUSD).toLocaleString()}`, color:'#A32D2D', rows:stats.bo,
      info:'מק"טים שמשויכים להזמנות Back Orders — הזמנות שעבר תאריך האספקה ועדיין לא סופקו. הסכום הוא שווי ההזמנות הייחודיות בדולרים.' },
    { label:'בסכנת BO',           value:stats.danger.length,  sub:'ללא רכש',      color:'#854F0B', rows:stats.danger,
      info:'מק"טים שעדיין אינם BO, אבל אין להם הזמנת רכש פתוחה או שאין תאריך קבלה מאושר — עלולים להפוך ל-BO אם לא יטפלו בהם.' },
    { label:'ללא הזמנת רכש',      value:stats.noPO.length,    sub:'דורש טיפול',   color:'#A32D2D', rows:stats.noPO,
      info:'מק"טים שיש להם חוסר אבל לא יצאה בכלל הזמנת רכש עבורם. דורש טיפול מיידי.' },
    { label:'ללא תאריך קבלה',     value:stats.noDate.length,  sub:'הזמנות פתוחות',color:'#854F0B', rows:stats.noDate,
      info:'מק"טים שיש להם הזמנת רכש פתוחה, אבל הספק לא אישר תאריך קבלה. יש הזמנה אבל לא ידוע מתי יגיע החומר.' },
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
        {kpiItems.map((k,i) => (
          <KpiCard key={i} {...k} notes={notes} saveNote={saveNote} onEditNote={setEditingRow} />
        ))}
      </div>

      {/* Monthly chart */}
      <div style={{ marginBottom:12 }}>
        <ChartCard title='חוסרים לפי חודש אספקה מאושר'>
          <ResponsiveContainer width='100%' height={180}>
            <BarChart data={stats.monthData} margin={{ top:16, right:8, left:-20, bottom:4 }}
              onClick={e => {
                if (e?.activePayload?.[0]) {
                  const clicked = e.activePayload[0].payload
                  setSelectedMonth(prev => prev?.key === clicked.key ? null : clicked)
                }
              }}
              style={{ cursor:'pointer' }}>
              <XAxis dataKey='label' tick={{ fontSize:10 }} />
              <YAxis tick={{ fontSize:10 }} />
              <Tooltip formatter={v => [v, 'מק"טים']} />
              <Bar dataKey='count' radius={[3,3,0,0]}>
                <LabelList dataKey='count' position='top' style={{ fontSize:10, fill:'#555' }} />
                {stats.monthData.map((m,i) => <Cell key={i} fill={selectedMonth?.key===m.key ? '#1a3a5c' : COLORS[i%COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {selectedMonth && (
            <div style={{ fontSize:11, color:'#378ADD', marginTop:4, textAlign:'center' }}>
              לחץ שוב על העמודה לביטול הסינון
            </div>
          )}
        </ChartCard>
      </div>

      {/* Month drill-down panel */}
      {selectedMonth && selectedMonthData && (
        <div style={{ background:'#fff', border:'1.5px solid #378ADD', borderRadius:10, padding:16, marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', marginBottom:12 }}>
            <h3 style={{ fontSize:14, fontWeight:600, flex:1, margin:0 }}>
              📅 {selectedMonth.label} — {selectedMonthData.items.length} מק"טים ({selectedMonthData.boItems.length} BO)
            </h3>
            <button onClick={() => setSelectedMonth(null)}
              style={{ fontSize:12, padding:'3px 10px', border:'0.5px solid #ddd', borderRadius:6, background:'transparent', color:'#888', cursor:'pointer' }}>✕ סגור</button>
          </div>

          {/* TOP 8 BO לפי לקוח */}
          {selectedMonthData.topCustomers.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#A32D2D', marginBottom:8 }}>🔴 Back Orders לפי לקוח — TOP 8</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {selectedMonthData.topCustomers.map((c,i) => (
                  <div key={i} style={{ background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:8, padding:'8px 14px', minWidth:140 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'#A32D2D' }}>{c.name}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#A32D2D', marginTop:2 }}>{c.count} הזמנות</div>
                    <div style={{ fontSize:10, color:'#888', marginTop:1 }}>{c.items.length} מק"טים</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* טבלת כל המק"טים */}
          <div style={{ fontSize:12, fontWeight:600, color:'#555', marginBottom:6 }}>כל המק"טים בחודש זה</div>
          <div style={{ overflowX:'auto', maxHeight:400, overflowY:'auto', border:'0.5px solid #e5e5e0', borderRadius:8 }}>
            <table style={{ width:'max-content', minWidth:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:'#f4f4f0', position:'sticky', top:0, zIndex:5 }}>
                  {['הערות','BO','מק"ט','תיאור מוצר','סטטוס','הז. מכירה','שורה','לקוח','ת. אספקה מאושר','ת. אספקה מבוקש','נדרש','חוסר','הז. רכש','שורת רכש','מסלול','ספק','צפי קבלה'].map(h => (
                    <th key={h} style={{ padding:'6px 8px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedMonthData.items.flatMap((r,i) => {
                  const ords = r.orders?.filter(o => o.confirmedShipDate?.startsWith(selectedMonth.key))
                  const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
                  const rows = []
                  const ordList = ords?.length > 0 ? ords : [{}]
                  const n = notes?.[r.itemNumber] || {}
                  ordList.forEach((o,oi) => {
                    pos.forEach((po,pi) => {
                      const isFirst = oi === 0 && pi === 0
                      const totalRows = ordList.length * pos.length
                      rows.push(
                        <tr key={`${i}-${oi}-${pi}`} style={{ background: r.isBO ? '#FCEBEB18' : i%2===0?'#fff':'#fafaf8' }}>
                          {/* הערות — רק בשורה ראשונה */}
                          {isFirst && (
                            <td rowSpan={totalRows} style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', verticalAlign:'middle', whiteSpace:'nowrap' }}>
                              <button
                                onClick={() => setEditingRow(r)}
                                style={{
                                  fontSize:10, padding:'3px 7px', borderRadius:5, cursor:'pointer',
                                  border: (n.note_procurement || n.note_tapi) ? '1px solid #378ADD' : '0.5px solid #ddd',
                                  background: (n.note_procurement || n.note_tapi) ? '#E6F1FB' : 'transparent',
                                  color: (n.note_procurement || n.note_tapi) ? '#185FA5' : '#888',
                                  fontWeight: (n.note_procurement || n.note_tapi) ? 600 : 400,
                                }}>
                                ✏️ {(n.note_procurement || n.note_tapi) ? 'יש הערה' : 'הוסף'}
                              </button>
                              <div style={{ marginTop:3, display:'flex', gap:3 }}>
                                {n.note_procurement && <span style={{ fontSize:9, background:'#E6F1FB', color:'#185FA5', padding:'1px 5px', borderRadius:4 }}>רכש</span>}
                                {n.note_tapi && <span style={{ fontSize:9, background:'#EAF3DE', color:'#3B6D11', padding:'1px 5px', borderRadius:4 }}>תפ"י</span>}
                              </div>
                            </td>
                          )}
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', textAlign:'center' }}>
                            {r.isBO ? <span style={{ color:'#A32D2D', fontWeight:700, fontSize:10 }}>BO</span> : ''}
                          </td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, whiteSpace:'nowrap' }}>{r.itemNumber}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.productName||'—'}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}><Badge status={r.procurementStatus} /></td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{o.salesOrder||r.prd||'—'}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{o.lineNumber||'—'}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.customerName||'—'}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(o.confirmedShipDate)||'—'}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(o.requestedShipDate)||'—'}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{r.totalQtyRequired}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', color:r.shortage>0?'#A32D2D':'#3B6D11', fontWeight:600 }}>{r.shortage}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{po.purchaseOrder||'—'}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{po.lineNumber||'—'}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{po.voyage||'—'}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{po.vendorName||'—'}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', color:!po.confirmedReceiptDate?'#A32D2D':'#1a1a1a' }}>{fmtDate(po.confirmedReceiptDate)||'—'}</td>
                        </tr>
                      )
                    })
                  })
                  return rows
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Row 2 */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:12, marginBottom:12 }}>
        {/* Bottlenecks */}
        <ChartCard title='צווארי בקבוק — מק"טים קריטיים' info='מק"טים שמשפיעים על הכי הרבה הזמנות. לחץ על שורה לפרטים מלאים כולל הזמנות מכירה והזמנות רכש.'>
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

      {/* Notes Modal */}
      {editingRow && (
        <NotesModal
          row={editingRow}
          notes={notes?.[editingRow.itemNumber] || {}}
          onSave={(field, value) => saveNote(editingRow.itemNumber, field, value)}
          onClose={() => setEditingRow(null)}
        />
      )}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, rows, info, notes, saveNote, onEditNote }) {
  const [open, setOpen] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  function exportRows() {
    if (!rows || rows.length === 0) return
    const exportData = []
    rows.forEach(r => {
      const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
      const ords = r.orders?.length > 0 ? r.orders : [{}]
      pos.forEach(po => ords.forEach(o => {
        exportData.push({
          'מק"ט': r.itemNumber,
          'תיאור פריט': r.productName||'',
          'סטטוס': r.procurementStatus,
          'פק"ע': r.prd||'',
          'כמות נדרשת': r.totalQtyRequired,
          'כמות הוזמנה': po.quantity||'',
          'יתרה': po.deliverRemainder||'',
          'הז. רכש': po.purchaseOrder||'',
          'שורת רכש': po.lineNumber||'',
          'הז. מכירה': o.salesOrder || (r.prd?.startsWith?.('SOIL') ? r.prd : '')||'',
          'שורת מכירה': o.lineNumber||'',
          'לקוח': o.customerName||'',
          'ת. קבלה מאושר': fmtDate(po.confirmedReceiptDate),
          'ת. קבלה מבוקש': fmtDate(po.requestedReceiptDate),
          'ת. אספקה מאושר': fmtDate(o.confirmedShipDate),
          'ת. אספקה מבוקש': fmtDate(o.requestedShipDate),
          'ספק': po.vendorName||'',
          'קב. רכש': po.buyerGroup||'',
          'הערת רכש': notes?.[r.itemNumber]?.note_procurement || '',
          'הערת תפ"י': notes?.[r.itemNumber]?.note_tapi || '',
        })
      }))
    })
    exportToExcel(exportData, `${label}.xlsx`, label)
  }

  return (
    <div style={{ background:'#f4f4f0', borderRadius:8, padding:'10px 12px', cursor:'pointer', position:'relative' }}
      onClick={() => rows && setOpen(o => !o)}>
      {info && (
        <div style={{ position:'absolute', top:6, left:8 }}>
          <button
            onClick={e => { e.stopPropagation(); setShowInfo(s => !s) }}
            style={{ width:16, height:16, borderRadius:'50%', border:'1px solid #888', background:'transparent', color:'#888', fontSize:10, cursor:'pointer', fontWeight:600, lineHeight:'14px', padding:0, display:'flex', alignItems:'center', justifyContent:'center' }}
            title='מידע'>i</button>
          {showInfo && (
            <div style={{ position:'absolute', bottom:20, left:0, background:'#333', color:'#fff', fontSize:11, padding:'8px 10px', borderRadius:6, width:220, zIndex:100, lineHeight:1.5, textAlign:'right' }}
              onClick={e => e.stopPropagation()}>
              {info}
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize:11, color:'#666', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:600, color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'#999', marginTop:3 }}>{sub}</div>}
      {rows && <div style={{ fontSize:10, color:'#378ADD', marginTop:4 }}>{open?'▲ סגור':'▼ הצג רשימה'}</div>}
      {open && rows && (
        <div style={{ marginTop:10 }} onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:6 }}>
            <button onClick={exportRows} style={{ fontSize:10, padding:'3px 8px', border:'0.5px solid #378ADD', borderRadius:5, background:'#378ADD', color:'#fff', cursor:'pointer' }}>ייצוא Excel</button>
          </div>
          <div style={{ overflowX:'auto', maxHeight:300, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, minWidth:1000 }}>
              <thead>
                <tr>{['הערות','מק"ט','תיאור פריט','סטטוס','נדרש','כמות הוזמנה','יתרה','פק"ע / הזמנה','הז. רכש','שורת רכש','הז. מכירה','שורת מכירה','ת. קבלה מאושר','ת. קבלה מבוקש'].map(h => (
                  <th key={h} style={{ background:'#f0f0ec', padding:'4px 6px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {rows.slice(0,200).flatMap((r,i) => {
                  const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
                  const ords = r.orders?.length > 0 ? r.orders : [{}]
                  const combos = []
                  pos.forEach(po => ords.forEach(o => combos.push({po, o})))
                  const n = notes?.[r.itemNumber] || {}
                  return combos.map(({po, o}, j) => (
                    <tr key={`${i}-${j}`} style={{ background: i%2===0?'#fff':'#fafaf8' }}>
                      {j===0 && (
                        <td rowSpan={combos.length} style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', verticalAlign:'middle', whiteSpace:'nowrap' }}>
                          <button
                            onClick={e => { e.stopPropagation(); onEditNote && onEditNote(r) }}
                            style={{
                              fontSize:10, padding:'2px 6px', borderRadius:4, cursor:'pointer',
                              border: (n.note_procurement || n.note_tapi) ? '1px solid #378ADD' : '0.5px solid #ddd',
                              background: (n.note_procurement || n.note_tapi) ? '#E6F1FB' : 'transparent',
                              color: (n.note_procurement || n.note_tapi) ? '#185FA5' : '#888',
                            }}>
                            ✏️ {(n.note_procurement || n.note_tapi) ? 'יש הערה' : 'הוסף'}
                          </button>
                          <div style={{ marginTop:2, display:'flex', gap:2 }}>
                            {n.note_procurement && <span style={{ fontSize:9, background:'#E6F1FB', color:'#185FA5', padding:'1px 4px', borderRadius:3 }}>רכש</span>}
                            {n.note_tapi && <span style={{ fontSize:9, background:'#EAF3DE', color:'#3B6D11', padding:'1px 4px', borderRadius:3 }}>תפ"י</span>}
                          </div>
                        </td>
                      )}
                      {j===0 && <td rowSpan={combos.length} style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, verticalAlign:'top', whiteSpace:'nowrap' }}>{r.itemNumber}</td>}
                      {j===0 && <td rowSpan={combos.length} style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', verticalAlign:'top' }}>{r.productName||'—'}</td>}
                      {j===0 && <td rowSpan={combos.length} style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', verticalAlign:'top' }}><Badge status={r.procurementStatus} /></td>}
                      {j===0 && <td rowSpan={combos.length} style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, verticalAlign:'top' }}>{r.totalQtyRequired}</td>}
                      {j===0 && <td rowSpan={combos.length} style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', fontSize:10, color:'#555', verticalAlign:'top', whiteSpace:'nowrap' }}>{r.prd||'—'}</td>}
                      <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{po.quantity||'—'}</td>
                      <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, color: po.deliverRemainder>0?'#185FA5':'#888' }}>{po.deliverRemainder||'—'}</td>
                      <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{po.purchaseOrder||'—'}</td>
                      <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea' }}>{po.lineNumber||'—'}</td>
                      <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{o.salesOrder || (r.prd?.startsWith('SOIL') ? r.prd : '—')}</td>
                      <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea' }}>{o.lineNumber||'—'}</td>
                      <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', color: po.confirmedReceiptDate ? '#1a1a1a' : '#A32D2D' }}>{fmtDate(po.confirmedReceiptDate)||'—'}</td>
                      <td style={{ padding:'4px 6px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(po.requestedReceiptDate)||'—'}</td>
                    </tr>
                  ))
                })}
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
function ChartCard({ title, children, onExport, info }) {
  const [showInfo, setShowInfo] = useState(false)
  return (
    <div style={{ background:'#fff', border:'0.5px solid #e5e5e0', borderRadius:10, padding:14, position:'relative' }}>
      <div style={{ display:'flex', alignItems:'center', marginBottom:8, gap:6 }}>
        <span style={{ fontSize:12, fontWeight:600, flex:1 }}>{title}</span>
        {info && (
          <div style={{ position:'relative' }}>
            <button onClick={() => setShowInfo(s=>!s)} style={{ width:16, height:16, borderRadius:'50%', border:'1px solid #888', background:'transparent', color:'#888', fontSize:10, cursor:'pointer', fontWeight:600, padding:0, display:'flex', alignItems:'center', justifyContent:'center' }}>i</button>
            {showInfo && (
              <div style={{ position:'absolute', top:20, left:-100, background:'#333', color:'#fff', fontSize:11, padding:'8px 10px', borderRadius:6, width:220, zIndex:100, lineHeight:1.5, textAlign:'right' }}>
                {info}
              </div>
            )}
          </div>
        )}
        {onExport && (
          <button onClick={onExport} style={{ fontSize:10, padding:'2px 8px', border:'0.5px solid #378ADD', borderRadius:5, background:'transparent', color:'#378ADD', cursor:'pointer' }}>⬇ Excel</button>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Notes Modal ───────────────────────────────────────────────────
function NotesModal({ row, notes, onSave, onClose }) {
  const [procNote, setProcNote] = useState(notes.note_procurement || '')
  const [tapiNote, setTapiNote] = useState(notes.note_tapi || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave('both', { note_procurement: procNote, note_tapi: tapiNote })
    setSaving(false)
    onClose()
  }

  async function handleClear() {
    if (!confirm('למחוק את כל ההערות?')) return
    setProcNote('')
    setTapiNote('')
    await onSave('both', { note_procurement: '', note_tapi: '' })
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:12, padding:24, width:680, maxHeight:'85vh', overflow:'auto', direction:'rtl' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', alignItems:'center', marginBottom:16, gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:600 }}>{row.itemNumber}</div>
            <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{row.productName}</div>
          </div>
          <button onClick={onClose} style={{ fontSize:18, background:'none', border:'none', cursor:'pointer', color:'#888', lineHeight:1 }}>✕</button>
        </div>

        <NoteField label='הערת רכש' value={procNote} onChange={setProcNote} color='#185FA5' />
        <div style={{ height:12 }} />
        <NoteField label='הערת תפ"י' value={tapiNote} onChange={setTapiNote} color='#3B6D11' />

        <div style={{ display:'flex', gap:8, marginTop:20, justifyContent:'flex-start' }}>
          <button onClick={handleSave} disabled={saving} style={{
            fontSize:13, padding:'8px 20px', borderRadius:7, border:'none',
            background:'#378ADD', color:'#fff', cursor:'pointer', fontWeight:600
          }}>{saving ? 'שומר...' : '💾 שמור'}</button>
          <button onClick={handleClear} style={{
            fontSize:13, padding:'8px 16px', borderRadius:7,
            border:'0.5px solid #E24B4A', background:'transparent', color:'#E24B4A', cursor:'pointer'
          }}>🗑 מחק הערות</button>
          <button onClick={onClose} style={{
            fontSize:13, padding:'8px 16px', borderRadius:7,
            border:'0.5px solid #ddd', background:'transparent', color:'#555', cursor:'pointer'
          }}>ביטול</button>
        </div>
      </div>
    </div>
  )
}

// ── Note Field ────────────────────────────────────────────────────
function NoteField({ label, value, onChange, color }) {
  const ref = useRef(null)

  function insertFormat(prefix, suffix) {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const newVal = value.slice(0, start) + prefix + selected + suffix + value.slice(end)
    onChange(newVal)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + prefix.length, end + prefix.length)
    }, 0)
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span style={{ fontSize:12, fontWeight:600, color }}>{label}</span>
        <div style={{ display:'flex', gap:4, marginRight:'auto' }}>
          {[
            { label:'B', title:'מודגש', prefix:'**', suffix:'**', style:{ fontWeight:700 } },
            { label:'I', title:'נטוי', prefix:'_', suffix:'_', style:{ fontStyle:'italic' } },
            { label:'U', title:'קו תחתי', prefix:'__', suffix:'__', style:{ textDecoration:'underline' } },
          ].map(btn => (
            <button key={btn.label} title={btn.title} onClick={() => insertFormat(btn.prefix, btn.suffix)}
              style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer', ...btn.style }}>
              {btn.label}
            </button>
          ))}
          <button title='רשימה' onClick={() => { onChange(value + (value && !value.endsWith('\n') ? '\n• ' : '• ')); setTimeout(()=>ref.current?.focus(),0) }}
            style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer' }}>
            •
          </button>
          <button title='מספור' onClick={() => { onChange(value + (value && !value.endsWith('\n') ? '\n1. ' : '1. ')); setTimeout(()=>ref.current?.focus(),0) }}
            style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer' }}>
            1.
          </button>
        </div>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={`כתוב ${label} כאן...`}
        style={{
          width:'100%', height:120, fontSize:13, padding:'10px 12px',
          border:`1px solid ${color}40`, borderRadius:8, resize:'vertical',
          background:'#fafaf8', color:'#1a1a1a', lineHeight:1.6,
          fontFamily:'inherit', direction:'rtl', textAlign:'right',
          outline:'none', boxSizing:'border-box',
        }}
      />
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
