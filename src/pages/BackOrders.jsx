import React, { useState, useMemo, useRef } from 'react'
import { Badge, fmtDate, LoadingState, EmptyState, PageWrapper } from '../components/shared'
import * as XLSX from 'xlsx'

const COLS = [
  { label: 'הערות',          w: 90  },
  { label: 'מק"ט',           w: 130 },
  { label: 'תיאור מוצר',     w: 180 },
  { label: 'סטטוס',          w: 60  },
  { label: 'פק"ע / הזמנה',   w: 110 },
  { label: 'הז. מכירה',      w: 110 },
  { label: 'שורת מכירה',     w: 70  },
  { label: 'לקוח',           w: 150 },
  { label: 'ת. אספקה מאושר', w: 110 },
  { label: 'נדרש',           w: 60  },
  { label: 'חוסר',           w: 60  },
  { label: 'הז. רכש',        w: 110 },
  { label: 'שורת רכש',       w: 70  },
  { label: 'ספק',            w: 150 },
  { label: 'כמות הוזמנה',    w: 80  },
  { label: 'יתרה',           w: 60  },
  { label: 'ת. קבלה מאושר',  w: 110 },
  { label: 'ערך BO ($)',        w: 100 },
]

export default function BackOrders({ data, notes, saveNote, loading }) {
  const [search, setSearch]             = useState('')
  const [filterPO, setFilterPO]         = useState('הכל')
  const [editingRow, setEditingRow]     = useState(null)
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
    let totalAll = 0, totalNoDate = 0, totalNoPO = 0
    boData.forEach(r => {
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

  const soDisplay = (r) => {
    const firstOrder = r.orders?.[0]
    if (firstOrder?.salesOrder) return firstOrder.salesOrder
    if (r.prd?.startsWith('SOIL')) return r.prd
    return '—'
  }

  const firstPO = (r) => r.purchaseOrders?.[0] || {}

  return (
    <PageWrapper title={`Back Orders — ${boData.length} מק"טים`} topActions={
      <button onClick={handleExport} style={{ fontSize:12, padding:'5px 12px', border:'0.5px solid #378ADD', borderRadius:6, background:'transparent', color:'#378ADD', cursor:'pointer' }}>⬇ ייצוא Excel</button>
    }>

      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'סה"כ מק"טים BO', value:kpis.total,  amt:kpis.totalAmt,  color:'#A32D2D' },
          { label:'ללא תאריך רכש',  value:kpis.noDate, amt:kpis.noDateAmt, color:'#854F0B' },
          { label:'ללא הזמנת רכש',  value:kpis.noPO,   amt:kpis.noPOAmt,   color:'#A32D2D' },
        ].map((k,i) => (
          <div key={i} style={{ background:'#f4f4f0', borderRadius:8, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:'#666', marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:24, fontWeight:600, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11, color:'#888', marginTop:3 }}>${Math.round(k.amt).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder='חיפוש מק"ט / לקוח...'
          style={{ fontSize:12, padding:'5px 10px', border:'0.5px solid #ddd', borderRadius:6, width:200, background:'#fff', color:'#1a1a1a' }} />
        {['הכל','ללא הזמנה','ללא תאריך'].map(o => (
          <button key={o} onClick={() => setFilterPO(o)} style={{
            fontSize:12, padding:'4px 10px', borderRadius:6, cursor:'pointer',
            border:`0.5px solid ${filterPO===o?'#378ADD':'#ddd'}`,
            background:filterPO===o?'#378ADD':'transparent', color:filterPO===o?'#fff':'#555',
          }}>{o}</button>
        ))}
        <span style={{ fontSize:11, color:'#999', marginRight:'auto' }}>{filtered.length} מק"טים</span>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', border:'0.5px solid #e5e5e0', borderRadius:10, overflowX:'auto', overflowY:'auto', maxHeight:'calc(100vh - 320px)' }}>
        <table style={{ width:'max-content', minWidth:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#f4f4f0', position:'sticky', top:0, zIndex:10 }}>
              {COLS.map(({ label, w }) => (
                <th key={label} style={{
                  padding:'7px 8px', fontWeight:600, fontSize:10, color:'#555',
                  borderBottom:'0.5px solid #e0e0da', textAlign:'right',
                  whiteSpace:'nowrap', position:'sticky', top:0,
                  background:'#f4f4f0', zIndex:10, minWidth:w, width:w,
                }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const n          = notes[row.itemNumber] || {}
              const hasNote    = !!(n.note_procurement || n.note_tapi)
              const firstOrd   = row.orders?.[0] || {}
              const po         = firstPO(row)
              const isExpanded = expandedItem === row.itemNumber

              return (
                <React.Fragment key={i}>
                  {/* Main row */}
                  <tr
                    style={{ background: !row.hasPO ? '#FCEBEB18' : i%2===0 ? '#fff' : '#fafaf8', cursor:'pointer' }}
                    onClick={() => setExpandedItem(isExpanded ? null : row.itemNumber)}
                  >
                    {/* הערות */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                        {n.note_procurement && <span style={{ fontSize:9, background:'#E6F1FB', color:'#185FA5', padding:'1px 5px', borderRadius:4 }}>רכש</span>}
                        {n.note_tapi        && <span style={{ fontSize:9, background:'#EAF3DE', color:'#3B6D11', padding:'1px 5px', borderRadius:4 }}>תפ"י</span>}
                        <button onClick={() => setEditingRow(row)} style={{
                          fontSize:10, padding:'1px 6px', borderRadius:4,
                          border:'0.5px solid #ddd',
                          background: hasNote ? '#E6F1FB' : '#f4f4f0',
                          color: hasNote ? '#185FA5' : '#555',
                          cursor:'pointer',
                        }}>✏️</button>
                      </div>
                    </td>

                    {/* מק"ט */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, whiteSpace:'nowrap' }}>
                      <span style={{ marginLeft:4, fontSize:10, color:'#378ADD' }}>{isExpanded ? '▲' : '▼'}</span>
                      {row.itemNumber}
                    </td>

                    {/* תיאור */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {row.productName||'—'}
                    </td>

                    {/* סטטוס */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>
                      <Badge status='BO' />
                    </td>

                    {/* פק"ע */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11, color:'#555', whiteSpace:'nowrap' }}>
                      {prdDisplay(row)}
                    </td>

                    {/* הז. מכירה */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontSize:11 }}>
                      {soDisplay(row)}
                    </td>

                    {/* שורת מכירה */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11 }}>
                      {firstOrd.lineNumber||'—'}
                    </td>

                    {/* לקוח */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {firstOrd.customerName||'—'}
                    </td>

                    {/* ת. אספקה מאושר */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontSize:11, color: firstOrd.confirmedShipDate ? '#1a1a1a' : '#aaa' }}>
                      {fmtDate(firstOrd.confirmedShipDate)||'—'}
                    </td>

                    {/* נדרש */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>
                      {row.totalQtyRequired}
                    </td>

                    {/* חוסר */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', color: row.shortage > 0 ? '#A32D2D' : '#3B6D11', fontWeight:600 }}>
                      {row.shortage}
                    </td>

                    {/* הז. רכש */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11, whiteSpace:'nowrap' }}>
                      {!row.hasPO
                        ? <span style={{ color:'#A32D2D', fontSize:10 }}>❌ ללא הז. רכש</span>
                        : po.purchaseOrder||'—'}
                    </td>

                    {/* שורת רכש */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11 }}>
                      {po.lineNumber||'—'}
                    </td>

                    {/* ספק */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {row.vendors?.join(', ')||'—'}
                    </td>

                    {/* כמות הוזמנה */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>
                      {po.quantity||'—'}
                    </td>

                    {/* יתרה */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>
                      {po.deliverRemainder||'—'}
                    </td>

                    {/* ת. קבלה מאושר */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontSize:11, color: !row.confirmedReceiptDate ? '#A32D2D' : '#1a1a1a' }}>
                      {fmtDate(row.confirmedReceiptDate)||'⚠️ חסר'}
                    </td>

                    {/* ערך BO */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontSize:11, fontWeight:600, color:'#A32D2D' }}>
                      {row.totalRemainingAmount ? '$' + Math.round(row.totalRemainingAmount).toLocaleString() : '—'}
                    </td>
                  </tr>

                  {/* Expanded row — הזמנות מכירה + רכש */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={COLS.length} style={{ padding:0, borderBottom:'0.5px solid #e0e0da', background:'#f8f8f6' }}>
                        <div style={{ padding:'12px 16px', direction:'rtl' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

                            {/* הזמנות מכירה */}
                            <div>
                              <div style={{ fontSize:11, fontWeight:600, color:'#555', marginBottom:6 }}>
                                הזמנות מכירה ({row.orders?.length||0})
                              </div>
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                  <thead>
                                    <tr>
                                      {['הזמנה','שורה','לקוח','ת. מאושר','ת. מבוקש','כמות'].map(h => (
                                        <th key={h} style={{ background:'#f0f0ec', padding:'4px 7px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.orders?.map((o, j) => (
                                      <tr key={j} style={{ background: j%2===0 ? '#fff' : '#fafaf8' }}>
                                        <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{o.salesOrder||'—'}</td>
                                        <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{o.lineNumber||'—'}</td>
                                        <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.customerName||'—'}</td>
                                        <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(o.confirmedShipDate)||'—'}</td>
                                        <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(o.requestedShipDate)||'—'}</td>
                                        <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{o.qtyRequired||'—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* הזמנות רכש */}
                            <div>
                              <div style={{ fontSize:11, fontWeight:600, color:'#555', marginBottom:6 }}>
                                הזמנות רכש ({row.purchaseOrders?.length||0})
                              </div>
                              {!row.hasPO
                                ? <div style={{ fontSize:11, color:'#A32D2D' }}>❌ אין הזמנות רכש פתוחות</div>
                                : <div style={{ overflowX:'auto' }}>
                                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                      <thead>
                                        <tr>
                                          {['הז. רכש','שורה','ספק','כמות','יתרה','ת. קבלה'].map(h => (
                                            <th key={h} style={{ background:'#f0f0ec', padding:'4px 7px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row.purchaseOrders?.map((p, j) => (
                                          <tr key={j} style={{ background: j%2===0 ? '#fff' : '#fafaf8' }}>
                                            <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontWeight:500 }}>{p.purchaseOrder||'—'}</td>
                                            <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{p.lineNumber||'—'}</td>
                                            <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.vendorName||'—'}</td>
                                            <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{p.quantity||'—'}</td>
                                            <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{p.deliverRemainder||'—'}</td>
                                            <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', color: !p.confirmedReceiptDate ? '#A32D2D' : '#1a1a1a' }}>
                                              {fmtDate(p.confirmedReceiptDate)||'⚠️ חסר'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                              }
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding:30, textAlign:'center', color:'#aaa' }}>אין Back Orders</div>}
      </div>

      {/* Notes Modal */}
      {editingRow && (
        <NotesModal
          row={editingRow}
          notes={notes[editingRow.itemNumber] || {}}
          onSave={(field, value) => saveNote(editingRow.itemNumber, field, value)}
          onClose={() => setEditingRow(null)}
        />
      )}
    </PageWrapper>
  )
}

// ── Notes Modal ───────────────────────────────────────────────────
function NotesModal({ row, notes, onSave, onClose }) {
  const [procNote, setProcNote] = useState(notes.note_procurement || '')
  const [tapiNote, setTapiNote] = useState(notes.note_tapi || '')
  const [saving, setSaving]     = useState(false)

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
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
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
        <div style={{ display:'flex', gap:8, marginTop:20 }}>
          <button onClick={handleSave} disabled={saving} style={{ fontSize:13, padding:'8px 20px', borderRadius:7, border:'none', background:'#378ADD', color:'#fff', cursor:'pointer', fontWeight:600 }}>
            {saving ? 'שומר...' : '💾 שמור'}
          </button>
          <button onClick={handleClear} style={{ fontSize:13, padding:'8px 16px', borderRadius:7, border:'0.5px solid #E24B4A', background:'transparent', color:'#E24B4A', cursor:'pointer' }}>
            🗑 מחק הערות
          </button>
          <button onClick={onClose} style={{ fontSize:13, padding:'8px 16px', borderRadius:7, border:'0.5px solid #ddd', background:'transparent', color:'#555', cursor:'pointer' }}>
            ביטול
          </button>
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
    const start = el.selectionStart, end = el.selectionEnd
    const newVal = value.slice(0, start) + prefix + value.slice(start, end) + suffix + value.slice(end)
    onChange(newVal)
    setTimeout(() => { el.focus(); el.setSelectionRange(start + prefix.length, end + prefix.length) }, 0)
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span style={{ fontSize:12, fontWeight:600, color }}>{label}</span>
        <div style={{ display:'flex', gap:4, marginRight:'auto' }}>
          {[
            { label:'B', prefix:'**', suffix:'**', style:{ fontWeight:700 } },
            { label:'I', prefix:'_',  suffix:'_',  style:{ fontStyle:'italic' } },
            { label:'U', prefix:'__', suffix:'__', style:{ textDecoration:'underline' } },
          ].map(btn => (
            <button key={btn.label} onClick={() => insertFormat(btn.prefix, btn.suffix)}
              style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer', ...btn.style }}>
              {btn.label}
            </button>
          ))}
          <button onClick={() => { onChange(value + (value && !value.endsWith('\n') ? '\n• ' : '• ')); setTimeout(()=>ref.current?.focus(),0) }}
            style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer' }}>•</button>
          <button onClick={() => { onChange(value + (value && !value.endsWith('\n') ? '\n1. ' : '1. ')); setTimeout(()=>ref.current?.focus(),0) }}
            style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer' }}>1.</button>
        </div>
      </div>
      <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
        placeholder={`כתוב ${label} כאן...`}
        style={{ width:'100%', height:120, fontSize:13, padding:'10px 12px', border:`1px solid ${color}40`, borderRadius:8, resize:'vertical', background:'#fafaf8', color:'#1a1a1a', lineHeight:1.6, fontFamily:'inherit', direction:'rtl', textAlign:'right', outline:'none', boxSizing:'border-box' }}
      />
    </div>
  )
}
