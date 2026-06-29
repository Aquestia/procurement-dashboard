import { useState, useMemo } from 'react'
import { Badge, fmtDate, LoadingState, EmptyState, PageWrapper } from '../components/shared'
import * as XLSX from 'xlsx'

export default function BackOrders({ data, notes, saveNote, loading }) {
  const [search, setSearch] = useState('')
  const [filterPO, setFilterPO] = useState('הכל')
  const [expandedItem, setExpandedItem] = useState(null)

  const boData = useMemo(() => data?.filter(r => r.isBO) || [], [data])

  const filtered = useMemo(() => boData.filter(r => {
    if (filterPO === 'ללא הזמנה' && r.hasPO) return false
    if (filterPO === 'ללא תאריך' && (!r.hasPO || r.confirmedReceiptDate)) return false
    if (search) {
      const s = search.toLowerCase()
      return r.itemNumber?.toLowerCase().includes(s) ||
        r.productName?.toLowerCase().includes(s) ||
        r.orders?.some(o => o.salesOrder?.toLowerCase().includes(s) || o.customerName?.toLowerCase().includes(s))
    }
    return true
  }), [boData, filterPO, search])

  const kpis = useMemo(() => {
    // סכום לפי הזמנה+שורה ייחודיים בלבד — ללא כפילויות
    let totalAll = 0, totalNoDate = 0, totalNoPO = 0

    boData.forEach(r => {
      // Use boAmount (sum of Back Orders $ for linked BO docs)
      const amt = r.boAmount || 0
      totalAll += amt
      if (!r.hasPO) totalNoPO += amt
      if (r.hasPO && r.hasNoDate) totalNoDate += amt
    })

    return {
      total: boData.length, totalAmt: totalAll,
      noPO: boData.filter(r => !r.hasPO).length, noPOAmt: totalNoPO,
      noDate: boData.filter(r => r.hasPO && !r.confirmedReceiptDate).length, noDateAmt: totalNoDate,
    }
  }, [boData])

  // Early returns AFTER all hooks
  if (loading) return <LoadingState />
  if (!data) return <EmptyState />

  function handleExport() {
    const rows = []
    filtered.forEach(r => {
      const n = notes[r.itemNumber] || {}
      const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
      const ords = r.orders?.length > 0 ? r.orders : [{}]
      pos.forEach(po => ords.forEach(o => {
        rows.push({
          'מק"ט': r.itemNumber, 'תיאור': r.productName || '',
          'פק"ע / הזמנה': r.prd?.startsWith('PRD') ? r.prd : r.prd?.startsWith('SOIL') ? r.prd : '—',
          'הז. מכירה': o.salesOrder || '', 'שורת מכירה': o.lineNumber || '',
          'לקוח': o.customerName || '',
          'ת. אספקה מאושר': fmtDate(o.confirmedShipDate),
          'ת. אספקה מבוקש': fmtDate(o.requestedShipDate),
          'נדרש': r.totalQtyRequired, 'חוסר': r.shortage,
          'הז. רכש': po.purchaseOrder || '', 'שורת רכש': po.lineNumber || '',
          'ספק': po.vendorName || '', 'כמות הוזמנה': po.quantity || '',
          'יתרה': po.deliverRemainder || '',
          'ת. קבלה מאושר': fmtDate(po.confirmedReceiptDate),
          'הערת רכש': n.note_procurement || '', 'הערת תפ"י': n.note_tapi || '',
        })
      }))
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Back Orders')
    XLSX.writeFile(wb, 'back_orders.xlsx')
  }

  const prdDisplay = (r) => {
    const p = r.prd || ''
    if (p.startsWith('PRD') || p.startsWith('SOIL')) return p
    return '—'
  }

  return (
    <PageWrapper title={`Back Orders — ${boData.length} מק"טים`} topActions={
      <button onClick={handleExport} style={{ fontSize:12, padding:'5px 12px', border:'1px solid #378ADD', borderRadius:6, background:'transparent', color:'var(--blue)', cursor:'pointer' }}>⬇ ייצוא Excel</button>
    }>
      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'סה"כ מק"טים BO', value:kpis.total, amt:kpis.totalAmt, color:'var(--red-dark)', info:'כל המק"טים החסרים המשויכים להזמנות Back Order' },
          { label:'ללא תאריך רכש', value:kpis.noDate, amt:kpis.noDateAmt, color:'var(--amber-dark)', info:'יש הזמנת רכש אך ללא תאריך קבלה מאושר מהספק' },
          { label:'ללא הזמנת רכש', value:kpis.noPO, amt:kpis.noPOAmt, color:'var(--red-dark)', info:'אין כלל הזמנת רכש פתוחה עבור מק"ט זה' },
        ].map((k,i) => (
          <div key={i} style={{ background:'var(--bg-page)', borderRadius:8, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:24, fontWeight:600, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>${Math.round(k.amt).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder='חיפוש מק"ט / לקוח...'
          style={{ fontSize:12, padding:'5px 10px', border:'1px solid var(--border-light)', borderRadius:6, width:200, background:'var(--bg-card)', color:'var(--text-main)' }} />
        {['הכל','ללא הזמנה','ללא תאריך'].map(o => (
          <button key={o} onClick={() => setFilterPO(o)} style={{
            fontSize:12, padding:'4px 10px', borderRadius:6, cursor:'pointer',
            border:`0.5px solid ${filterPO===o?'#378ADD':'#ddd'}`,
            background:filterPO===o?'#378ADD':'transparent', color:filterPO===o?'#fff':'#555',
          }}>{o}</button>
        ))}
        <span style={{ fontSize:11, color:'var(--text-hint)', marginRight:'auto' }}>{filtered.length} מק"טים</span>
      </div>

      {/* List */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.map((item, i) => {
          const n = notes[item.itemNumber] || {}
          const firstOrder = item.orders?.[0]
          const firstPO = item.purchaseOrders?.[0]
          const isExpanded = expandedItem === item.itemNumber

          return (
            <div key={i} style={{ background:'var(--bg-card)', border:`0.5px solid ${!item.hasPO?'#F09595':'#e0e0da'}`, borderRadius:10, overflow:'hidden' }}>
              {/* Header row */}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#FCEBEB18', cursor:'pointer' }}
                onClick={() => setExpandedItem(isExpanded ? null : item.itemNumber)}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>{item.itemNumber}</span>
                    <Badge status='BO' />
                    <span style={{ fontSize:11, color:'var(--text-sub)', background:'var(--bg-neutral)', padding:'1px 7px', borderRadius:4 }}>{prdDisplay(item)}</span>
                    {!item.hasPO && <span style={{ fontSize:10, background:'var(--red-bg)', color:'var(--red-dark)', padding:'1px 6px', borderRadius:6 }}>ללא הז. רכש</span>}
                    {item.hasPO && !item.confirmedReceiptDate && <span style={{ fontSize:10, background:'var(--amber-bg)', color:'var(--amber-dark)', padding:'1px 6px', borderRadius:6 }}>ללא תאריך</span>}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{item.productName}</div>
                </div>
                <div style={{ display:'flex', gap:14, fontSize:11, color:'var(--text-sub)', flexShrink:0, flexWrap:'wrap' }}>
                  <div><span style={{ color:'var(--text-muted)' }}>הז: </span><strong>{firstOrder?.salesOrder||'—'}</strong></div>
                  <div><span style={{ color:'var(--text-muted)' }}>לקוח: </span><strong style={{ maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', display:'inline-block' }}>{firstOrder?.customerName||'—'}</strong></div>
                  <div><span style={{ color:'var(--text-muted)' }}>נדרש: </span><strong>{item.totalQtyRequired}</strong></div>
                  <div><span style={{ color:'var(--text-muted)' }}>חוסר: </span><strong style={{ color:'var(--red-dark)' }}>{item.shortage}</strong></div>
                  <div><span style={{ color:'var(--text-muted)' }}>אספקה: </span><strong>{fmtDate(firstOrder?.confirmedShipDate)||'—'}</strong></div>
                  <div><span style={{ color:'var(--text-muted)' }}>קבלה: </span><strong style={{ color:!item.confirmedReceiptDate?'#A32D2D':'#1a1a1a' }}>{fmtDate(item.confirmedReceiptDate)||'—'}</strong></div>
                  <div><span style={{ color:'var(--text-muted)' }}>ספק: </span><strong>{item.vendors?.[0]||'—'}</strong></div>
                  {item.hasPO && <div><span style={{ color:'var(--text-muted)' }}>הז.רכש: </span><strong>{firstPO?.purchaseOrder||'—'}</strong></div>}
                </div>
                <span style={{ fontSize:12, color:'var(--blue)', flexShrink:0 }}>{isExpanded?'▲':'▼'}</span>
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div style={{ padding:'12px 14px', borderTop:'1px solid #f0e0e0' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:10 }}>
                    {/* Sales orders */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, color:'var(--text-sub)', marginBottom:6 }}>הזמנות מכירה ({item.orders?.length||0})</div>
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                          <thead><tr>{['הזמנה','שורה','לקוח','ת. מאושר','ת. מבוקש','כמות'].map(h=>(
                            <th key={h} style={{ background:'var(--bg-page)', padding:'4px 7px', fontWeight:600, fontSize:10, color:'var(--text-sub)', borderBottom:'1px solid var(--border-tbl)', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                          ))}</tr></thead>
                          <tbody>{item.orders?.map((o,j)=>(
                            <tr key={j} style={{ background:j%2===0?'var(--bg-card)':'var(--bg-row)' }}>
                              <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)', whiteSpace:'nowrap' }}>{o.salesOrder||'—'}</td>
                              <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)' }}>{o.lineNumber||'—'}</td>
                              <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.customerName||'—'}</td>
                              <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)', whiteSpace:'nowrap' }}>{fmtDate(o.confirmedShipDate)||'—'}</td>
                              <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)', whiteSpace:'nowrap' }}>{fmtDate(o.requestedShipDate)||'—'}</td>
                              <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)' }}>{o.qtyRequired||'—'}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </div>
                    {/* Purchase orders */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, color:'var(--text-sub)', marginBottom:6 }}>הזמנות רכש ({item.purchaseOrders?.length||0})</div>
                      {!item.hasPO
                        ? <div style={{ fontSize:11, color:'var(--red-dark)' }}>❌ אין הזמנות רכש</div>
                        : <div style={{ overflowX:'auto' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                              <thead><tr>{['הז. רכש','שורה','ספק','כמות','יתרה','ת. קבלה'].map(h=>(
                                <th key={h} style={{ background:'var(--bg-page)', padding:'4px 7px', fontWeight:600, fontSize:10, color:'var(--text-sub)', borderBottom:'1px solid var(--border-tbl)', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                              ))}</tr></thead>
                              <tbody>{item.purchaseOrders?.map((po,j)=>(
                                <tr key={j} style={{ background:j%2===0?'var(--bg-card)':'var(--bg-row)' }}>
                                  <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)', whiteSpace:'nowrap' }}>{po.purchaseOrder||'—'}</td>
                                  <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)' }}>{po.lineNumber||'—'}</td>
                                  <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{po.vendorName||'—'}</td>
                                  <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)' }}>{po.quantity||'—'}</td>
                                  <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)', fontWeight:600 }}>{po.deliverRemainder||'—'}</td>
                                  <td style={{ padding:'4px 7px', borderBottom:'1px solid var(--border-tbl)', whiteSpace:'nowrap', color:!po.confirmedReceiptDate?'#A32D2D':'#1a1a1a' }}>
                                    {fmtDate(po.confirmedReceiptDate)||'⚠️ חסר'}
                                  </td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                      }
                    </div>
                  </div>
                  {/* Notes */}
                  <div style={{ display:'flex', gap:12 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>הערת רכש:</div>
                      <NoteInput value={n.note_procurement||''} onChange={v => saveNote(item.itemNumber,'note_procurement',v)} placeholder='הערת רכש...' />
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>הערת תפ"י:</div>
                      <NoteInput value={n.note_tapi||''} onChange={v => saveNote(item.itemNumber,'note_tapi',v)} placeholder='הערת תפ"י...' />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && <EmptyState message='אין Back Orders' />}
      </div>
    </PageWrapper>
  )
}

function NoteInput({ value, onChange, placeholder }) {
  const [val, setVal] = useState(value)
  const [timer, setTimer] = useState(null)
  function handle(e) {
    setVal(e.target.value)
    clearTimeout(timer)
    setTimer(setTimeout(() => onChange(e.target.value), 800))
  }
  return (
    <input value={val} onChange={handle} placeholder={placeholder}
      style={{ fontSize:11, padding:'4px 8px', border:'1px solid var(--border-light)', borderRadius:5, width:'100%', background:'var(--bg-card)', color:'var(--text-main)', boxSizing:'border-box' }} />
  )
}
