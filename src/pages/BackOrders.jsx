import { useState, useMemo, useRef } from 'react'
import { Badge, fmtDate, LoadingState, EmptyState, PageWrapper } from '../components/shared'
import * as XLSX from 'xlsx'

export default function BackOrders({ data, notes, saveNote, loading }) {
  const [search, setSearch] = useState('')
  const [filterPO, setFilterPO] = useState('הכל')
  const [expandedItem, setExpandedItem] = useState(null)
  const [editingRow, setEditingRow] = useState(null)

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
      <button onClick={handleExport} style={{ fontSize:12, padding:'5px 12px', border:'0.5px solid #378ADD', borderRadius:6, background:'transparent', color:'#378ADD', cursor:'pointer' }}>⬇ ייצוא Excel</button>
    }>
      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'סה"כ מק"טים BO', value:kpis.total, amt:kpis.totalAmt, color:'#A32D2D' },
          { label:'ללא תאריך רכש', value:kpis.noDate, amt:kpis.noDateAmt, color:'#854F0B' },
          { label:'ללא הזמנת רכש', value:kpis.noPO, amt:kpis.noPOAmt, color:'#A32D2D' },
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

      {/* List */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.map((item, i) => {
          const n = notes[item.itemNumber] || {}
          const firstOrder = item.orders?.[0]
          const firstPO = item.purchaseOrders?.[0]
          const isExpanded = expandedItem === item.itemNumber
          const hasNote = !!(n.note_procurement || n.note_tapi)

          return (
            <div key={i} style={{ background:'#fff', border:`0.5px solid ${!item.hasPO?'#F09595':'#e0e0da'}`, borderRadius:10, overflow:'hidden' }}>
              {/* Header row */}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#FCEBEB18', cursor:'pointer' }}
                onClick={() => setExpandedItem(isExpanded ? null : item.itemNumber)}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>{item.itemNumber}</span>
                    <Badge status='BO' />
                    <span style={{ fontSize:11, color:'#555', background:'#f0f0ea', padding:'1px 7px', borderRadius:4 }}>{prdDisplay(item)}</span>
                    {!item.hasPO && <span style={{ fontSize:10, background:'#FCEBEB', color:'#A32D2D', padding:'1px 6px', borderRadius:6 }}>ללא הז. רכש</span>}
                    {item.hasPO && !item.confirmedReceiptDate && <span style={{ fontSize:10, background:'#FAEEDA', color:'#854F0B', padding:'1px 6px', borderRadius:6 }}>ללא תאריך</span>}
                  </div>
                  <div style={{ fontSize:11, color:'#666' }}>{item.productName}</div>
                </div>
                <div style={{ display:'flex', gap:14, fontSize:11, color:'#555', flexShrink:0, flexWrap:'wrap' }}>
                  <div><span style={{ color:'#888' }}>הז: </span><strong>{firstOrder?.salesOrder||'—'}</strong></div>
                  <div><span style={{ color:'#888' }}>לקוח: </span><strong style={{ maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', display:'inline-block' }}>{firstOrder?.customerName||'—'}</strong></div>
                  <div><span style={{ color:'#888' }}>נדרש: </span><strong>{item.totalQtyRequired}</strong></div>
                  <div><span style={{ color:'#888' }}>חוסר: </span><strong style={{ color:'#A32D2D' }}>{item.shortage}</strong></div>
                  <div><span style={{ color:'#888' }}>אספקה: </span><strong>{fmtDate(firstOrder?.confirmedShipDate)||'—'}</strong></div>
                  <div><span style={{ color:'#888' }}>קבלה: </span><strong style={{ color:!item.confirmedReceiptDate?'#A32D2D':'#1a1a1a' }}>{fmtDate(item.confirmedReceiptDate)||'—'}</strong></div>
                  <div><span style={{ color:'#888' }}>ספק: </span><strong>{item.vendors?.[0]||'—'}</strong></div>
                  {item.hasPO && <div><span style={{ color:'#888' }}>הז.רכש: </span><strong>{firstPO?.purchaseOrder||'—'}</strong></div>}
                </div>

                {/* כפתור הערה */}
                <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }} onClick={e => e.stopPropagation()}>
                  {n.note_procurement && <span style={{ fontSize:9, background:'#E6F1FB', color:'#185FA5', padding:'1px 5px', borderRadius:4 }}>רכש</span>}
                  {n.note_tapi && <span style={{ fontSize:9, background:'#EAF3DE', color:'#3B6D11', padding:'1px 5px', borderRadius:4 }}>תפ"י</span>}
                  <button
                    onClick={e => { e.stopPropagation(); setEditingRow(item) }}
                    style={{ fontSize:10, padding:'2px 7px', borderRadius:4, border:'0.5px solid #ddd', background: hasNote ? '#E6F1FB' : '#f4f4f0', color: hasNote ? '#185FA5' : '#555', cursor:'pointer' }}>
                    ✏️
                  </button>
                </div>

                <span style={{ fontSize:12, color:'#378ADD', flexShrink:0 }}>{isExpanded?'▲':'▼'}</span>
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div style={{ padding:'12px 14px', borderTop:'0.5px solid #f0e0e0' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {/* Sales orders */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, color:'#555', marginBottom:6 }}>הזמנות מכירה ({item.orders?.length||0})</div>
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                          <thead><tr>{['הזמנה','שורה','לקוח','ת. מאושר','ת. מבוקש','כמות'].map(h=>(
                            <th key={h} style={{ background:'#f4f4f0', padding:'4px 7px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                          ))}</tr></thead>
                          <tbody>{item.orders?.map((o,j)=>(
                            <tr key={j} style={{ background:j%2===0?'#fff':'#fafaf8' }}>
                              <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{o.salesOrder||'—'}</td>
                              <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{o.lineNumber||'—'}</td>
                              <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.customerName||'—'}</td>
                              <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(o.confirmedShipDate)||'—'}</td>
                              <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(o.requestedShipDate)||'—'}</td>
                              <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{o.qtyRequired||'—'}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </div>
                    {/* Purchase orders */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, color:'#555', marginBottom:6 }}>הזמנות רכש ({item.purchaseOrders?.length||0})</div>
                      {!item.hasPO
                        ? <div style={{ fontSize:11, color:'#A32D2D' }}>❌ אין הזמנות רכש</div>
                        : <div style={{ overflowX:'auto' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                              <thead><tr>{['הז. רכש','שורה','ספק','כמות','יתרה','ת. קבלה'].map(h=>(
                                <th key={h} style={{ background:'#f4f4f0', padding:'4px 7px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                              ))}</tr></thead>
                              <tbody>{item.purchaseOrders?.map((po,j)=>(
                                <tr key={j} style={{ background:j%2===0?'#fff':'#fafaf8' }}>
                                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{po.purchaseOrder||'—'}</td>
                                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{po.lineNumber||'—'}</td>
                                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{po.vendorName||'—'}</td>
                                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{po.quantity||'—'}</td>
                                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{po.deliverRemainder||'—'}</td>
                                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', color:!po.confirmedReceiptDate?'#A32D2D':'#1a1a1a' }}>
                                    {fmtDate(po.confirmedReceiptDate)||'⚠️ חסר'}
                                  </td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && <EmptyState message='אין Back Orders' />}
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
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:12, padding:24, width:680, maxHeight:'85vh', overflow:'auto', direction:'rtl' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', marginBottom:16, gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:600 }}>{row.itemNumber}</div>
            <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{row.productName}</div>
          </div>
          <button onClick={onClose} style={{ fontSize:18, background:'none', border:'none', cursor:'pointer', color:'#888', lineHeight:1 }}>✕</button>
        </div>

        {/* Note fields */}
        <NoteField label='הערת רכש' value={procNote} onChange={setProcNote} color='#185FA5' />
        <div style={{ height:12 }} />
        <NoteField label='הערת תפ"י' value={tapiNote} onChange={setTapiNote} color='#3B6D11' />

        {/* Actions */}
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

// ── Note Field with formatting toolbar ───────────────────────────
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
