import React, { useState, useMemo, useRef } from 'react'
import { Badge, fmtDate, PageWrapper } from '../components/shared'
import * as XLSX from 'xlsx'

const STATUS_OPTIONS = [
  { value: '',        label: '—',        bg: 'transparent', color: '#888',   border: '#ddd'    },
  { value: 'בטיפול', label: 'בטיפול',   bg: '#FFF3CD',     color: '#856404', border: '#FFCA2C' },
  { value: 'טופל',   label: 'טופל ✓',   bg: '#D1E7DD',     color: '#0A3622', border: '#75B798' },
  { value: 'הטסה',   label: 'הטסה ✈',   bg: '#E6F1FB',     color: '#185FA5', border: '#378ADD' },
]

const COLS = [
  { label: 'הערות',          w: 100 },
  { label: 'סטטוס טיפול',    w: 110 },
  { label: 'מק"ט',           w: 130 },
  { label: 'תיאור מוצר',     w: 180 },
  { label: 'סטטוס',          w: 65  },
  { label: 'פק"ע / הזמנה',   w: 110 },
  { label: 'הז. מכירה',      w: 110 },
  { label: 'שורת מכירה',     w: 70  },
  { label: 'לקוח',           w: 150 },
  { label: 'ת. אספקה מאושר', w: 110 },
  { label: 'נדרש',           w: 60  },
  { label: 'נאסף',           w: 60  },
  { label: 'בהזמנה',         w: 70  },
  { label: 'זמין',           w: 60  },
  { label: 'חוסר',           w: 60  },
  { label: 'הז. רכש',        w: 110 },
  { label: 'שורת רכש',       w: 70  },
  { label: 'ספק',            w: 150 },
  { label: 'מסלול',          w: 80  },
  { label: 'צפי קבלה',       w: 110 },
]

export default function AirShipment({ data, notes, saveNote, loading }) {
  const [search, setSearch]         = useState('')
  const [editingRow, setEditingRow] = useState(null)
  const [expandedItem, setExpandedItem] = useState(null)

  const airItems = useMemo(() => {
    if (!data || !notes) return []
    return data
      .filter(r => notes[r.itemNumber]?.treatment_status === 'הטסה')
      .map(r => ({ ...r, note: notes[r.itemNumber] || {} }))
  }, [data, notes])

  const filtered = useMemo(() => {
    if (!search) return airItems
    const s = search.toLowerCase()
    return airItems.filter(r =>
      r.itemNumber?.toLowerCase().includes(s) ||
      r.productName?.toLowerCase().includes(s) ||
      r.orders?.some(o => o.salesOrder?.toLowerCase().includes(s) || o.customerName?.toLowerCase().includes(s))
    )
  }, [airItems, search])

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'#888' }}>טוען...</div>

  function handleExport() {
    const rows = []
    filtered.forEach(r => {
      const pos  = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
      const ords = r.orders?.length > 0 ? r.orders : [{}]
      const n    = r.note || {}
      pos.forEach(po => ords.forEach(o => {
        rows.push({
          'סטטוס הטסה':     n.air_status || '',
          'מק"ט':           r.itemNumber,
          'תיאור פריט':     r.productName || '',
          'סטטוס':          r.procurementStatus,
          'פק"ע / הזמנה':   r.prd || '',
          'הז. מכירה':      o.salesOrder || '',
          'שורת מכירה':     o.lineNumber || '',
          'לקוח':           o.customerName || '',
          'ת. אספקה מאושר': fmtDate(o.confirmedShipDate),
          'נדרש':           r.totalQtyRequired,
          'נאסף':           r.totalQtyPicked,
          'בהזמנה':         r.totalOnOrder,
          'זמין':           r.totalAvailable,
          'חוסר':           r.shortage,
          'הז. רכש':        po.purchaseOrder || '',
          'שורת רכש':       po.lineNumber || '',
          'ספק':            po.vendorName || '',
          'מסלול':          po.voyage || '',
          'צפי קבלה':       fmtDate(po.confirmedReceiptDate),
          'הערת רכש':       n.note_procurement || '',
          'הערת תפ"י':      n.note_tapi || '',
          'הערת הטסה':      n.air_note || '',
        })
      }))
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'פריטים להטסה')
    XLSX.writeFile(wb, 'פריטים_להטסה.xlsx')
  }

  function handleWhatsApp() {
    handleExport()
    const today = new Date().toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric' })
    const itemList = filtered.map(r => `• ${r.itemNumber} — ${r.productName || ''}`).join('\n')
    const text = encodeURIComponent(`✈ *פריטים להטסה — ${today}*\n\n${itemList}\n\nסה"כ ${filtered.length} מק"טים\n_(קובץ Excel מצורף בנפרד)_`)
    setTimeout(() => window.open(`https://web.whatsapp.com/send?text=${text}`, '_blank'), 800)
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
    <PageWrapper
      title={`✈ פריטים להטסה`}
      subtitle={`${filtered.length} מק"טים מסומנים להטסה`}
      topActions={
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handleExport} style={{ fontSize:12, padding:'5px 12px', border:'0.5px solid #3B6D11', borderRadius:6, background:'#3B6D11', color:'#fff', cursor:'pointer', fontWeight:600 }}>⬇ ייצוא Excel</button>
          <button onClick={handleWhatsApp} style={{ fontSize:12, padding:'5px 12px', border:'0.5px solid #25D366', borderRadius:6, background:'#25D366', color:'#fff', cursor:'pointer', fontWeight:600 }}>💬 WhatsApp +</button>
        </div>
      }
    >
      {/* חיפוש */}
      <div style={{ display:'flex', gap:8, marginBottom:12, alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder='חיפוש מק"ט / תיאור / לקוח...'
          style={{ fontSize:12, padding:'5px 10px', border:'0.5px solid #ddd', borderRadius:6, width:240, background:'#fff', color:'#1a1a1a' }} />
        {search && <button onClick={() => setSearch('')} style={{ fontSize:11, padding:'4px 10px', border:'0.5px solid #ddd', borderRadius:6, background:'transparent', color:'#888', cursor:'pointer' }}>✕</button>}
        <span style={{ fontSize:11, color:'#999', marginRight:'auto' }}>{filtered.length} מק"טים</span>
      </div>

      {/* Empty state */}
      {airItems.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#aaa', fontSize:14 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✈</div>
          אין מק"טים מסומנים להטסה כרגע
          <div style={{ fontSize:12, marginTop:8 }}>סמן פריטים כ"הטסה" במבט רכש או מבט תפ"י</div>
        </div>
      ) : (
        <div style={{ background:'#fff', border:'0.5px solid #e5e5e0', borderRadius:10, overflowX:'auto', overflowY:'auto', maxHeight:'calc(100vh - 260px)' }}>
          <table style={{ width:'max-content', minWidth:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#E6F1FB', position:'sticky', top:0, zIndex:10 }}>
                {COLS.map(({ label, w }) => (
                  <th key={label} style={{
                    padding:'7px 8px', fontWeight:600, fontSize:10, color:'#185FA5',
                    borderBottom:'1px solid #B5D4F4', textAlign:'right',
                    whiteSpace:'nowrap', position:'sticky', top:0,
                    background:'#E6F1FB', zIndex:10, minWidth:w, width:w,
                  }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const n          = row.note || {}
                const hasNote    = !!(n.note_procurement || n.note_tapi || n.air_note)
                const firstOrd   = row.orders?.[0] || {}
                const po         = firstPO(row)
                const isExpanded = expandedItem === row.itemNumber
                const airStatus  = n.treatment_status || ''
                const airOpt     = STATUS_OPTIONS.find(s => s.value === airStatus) || STATUS_OPTIONS[0]

                return (
                  <React.Fragment key={i}>
                    <tr
                      style={{ background: i%2===0 ? '#fff' : '#f7fbff', cursor:'pointer' }}
                      onClick={() => setExpandedItem(isExpanded ? null : row.itemNumber)}
                    >
                      {/* הערות */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                          {n.note_procurement && <span style={{ fontSize:9, background:'#E6F1FB', color:'#185FA5', padding:'1px 5px', borderRadius:4 }}>רכש</span>}
                          {n.note_tapi        && <span style={{ fontSize:9, background:'#EAF3DE', color:'#3B6D11', padding:'1px 5px', borderRadius:4 }}>תפ"י</span>}
                          {n.air_note         && <span style={{ fontSize:9, background:'#EEEDFE', color:'#3C3489', padding:'1px 5px', borderRadius:4 }}>הטסה</span>}
                          <button onClick={() => setEditingRow(row)} style={{
                            fontSize:10, padding:'1px 6px', borderRadius:4,
                            border:'0.5px solid #ddd',
                            background: hasNote ? '#E6F1FB' : '#f4f4f0',
                            color: hasNote ? '#185FA5' : '#555',
                            cursor:'pointer',
                          }}>✏️</button>
                        </div>
                      </td>

                      {/* סטטוס הטסה */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }} onClick={e => e.stopPropagation()}>
                        <select value={airStatus}
                          onChange={e => saveNote(row.itemNumber, 'treatment_status', e.target.value)}
                          style={{ fontSize:10, padding:'2px 5px', border:`0.5px solid ${airOpt.border}`, borderRadius:4, background:airOpt.bg, color:airOpt.color, cursor:'pointer' }}>
                          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>

                      {/* מק"ט */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, whiteSpace:'nowrap', color:'#185FA5' }}>
                        <span style={{ marginLeft:4, fontSize:10, color:'#378ADD' }}>{isExpanded ? '▲' : '▼'}</span>
                        {row.itemNumber}
                      </td>

                      {/* תיאור */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.productName||'—'}</td>

                      {/* סטטוס */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}><Badge status={row.procurementStatus} /></td>

                      {/* פק"ע */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11, color:'#555', whiteSpace:'nowrap' }}>{prdDisplay(row)}</td>

                      {/* הז. מכירה */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontSize:11 }}>{soDisplay(row)}</td>

                      {/* שורת מכירה */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11 }}>{firstOrd.lineNumber||'—'}</td>

                      {/* לקוח */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{firstOrd.customerName||'—'}</td>

                      {/* ת. אספקה */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontSize:11, color: firstOrd.confirmedShipDate ? '#1a1a1a' : '#aaa' }}>{fmtDate(firstOrd.confirmedShipDate)||'—'}</td>

                      {/* כמויות */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{row.totalQtyRequired}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{row.totalQtyPicked}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{row.totalOnOrder}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{row.totalAvailable}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', color: row.shortage>0 ? '#A32D2D' : '#3B6D11', fontWeight:600 }}>{row.shortage}</td>

                      {/* הז. רכש */}
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11, whiteSpace:'nowrap' }}>{po.purchaseOrder||'—'}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11 }}>{po.lineNumber||'—'}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.vendors?.join(', ')||po.vendorName||'—'}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{po.voyage||'—'}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontSize:11, color: !po.confirmedReceiptDate ? '#A32D2D' : '#1a1a1a' }}>{fmtDate(po.confirmedReceiptDate)||'—'}</td>
                    </tr>

                    {/* Expanded — הזמנות מכירה + רכש */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={COLS.length} style={{ padding:0, borderBottom:'0.5px solid #B5D4F4', background:'#f0f6fd' }}>
                          <div style={{ padding:'12px 16px', direction:'rtl' }}>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                              {/* הזמנות מכירה */}
                              <div>
                                <div style={{ fontSize:11, fontWeight:600, color:'#185FA5', marginBottom:6 }}>הזמנות מכירה ({row.orders?.length||0})</div>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                  <thead><tr>{['הזמנה','שורה','לקוח','ת. מאושר','ת. מבוקש','כמות'].map(h => (
                                    <th key={h} style={{ background:'#E6F1FB', padding:'4px 7px', fontWeight:600, fontSize:10, color:'#185FA5', borderBottom:'0.5px solid #B5D4F4', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                                  ))}</tr></thead>
                                  <tbody>{row.orders?.map((o,j) => (
                                    <tr key={j} style={{ background: j%2===0?'#fff':'#f7fbff' }}>
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
                              {/* הזמנות רכש */}
                              <div>
                                <div style={{ fontSize:11, fontWeight:600, color:'#185FA5', marginBottom:6 }}>הזמנות רכש ({row.purchaseOrders?.length||0})</div>
                                {!row.hasPO
                                  ? <div style={{ fontSize:11, color:'#A32D2D' }}>❌ אין הזמנות רכש פתוחות</div>
                                  : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                      <thead><tr>{['הז. רכש','שורה','ספק','כמות','יתרה','ת. קבלה'].map(h => (
                                        <th key={h} style={{ background:'#E6F1FB', padding:'4px 7px', fontWeight:600, fontSize:10, color:'#185FA5', borderBottom:'0.5px solid #B5D4F4', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                                      ))}</tr></thead>
                                      <tbody>{row.purchaseOrders?.map((p,j) => (
                                        <tr key={j} style={{ background: j%2===0?'#fff':'#f7fbff' }}>
                                          <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontWeight:500 }}>{p.purchaseOrder||'—'}</td>
                                          <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{p.lineNumber||'—'}</td>
                                          <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.vendorName||'—'}</td>
                                          <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{p.quantity||'—'}</td>
                                          <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{p.deliverRemainder||'—'}</td>
                                          <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', color: !p.confirmedReceiptDate ? '#A32D2D' : '#1a1a1a' }}>{fmtDate(p.confirmedReceiptDate)||'⚠️ חסר'}</td>
                                        </tr>
                                      ))}</tbody>
                                    </table>
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
          {filtered.length === 0 && <div style={{ padding:30, textAlign:'center', color:'#aaa' }}>לא נמצאו תוצאות</div>}
        </div>
      )}

      {/* Notes Modal */}
      {editingRow && (
        <NotesModal
          row={editingRow}
          notes={editingRow.note || {}}
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
  const [airNote,  setAirNote]  = useState(notes.air_note || '')
  const [saving, setSaving]     = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave('both', { note_procurement: procNote, note_tapi: tapiNote, air_note: airNote })
    setSaving(false)
    onClose()
  }

  async function handleClear() {
    if (!confirm('למחוק את כל ההערות?')) return
    setProcNote(''); setTapiNote(''); setAirNote('')
    await onSave('both', { note_procurement: '', note_tapi: '', air_note: '' })
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
          <button onClick={onClose} style={{ fontSize:18, background:'none', border:'none', cursor:'pointer', color:'#888' }}>✕</button>
        </div>
        <NoteField label='הערת רכש'  value={procNote} onChange={setProcNote} color='#185FA5' />
        <div style={{ height:10 }} />
        <NoteField label='הערת תפ"י' value={tapiNote} onChange={setTapiNote} color='#3B6D11' />
        <div style={{ height:10 }} />
        <NoteField label='הערת הטסה ✈' value={airNote} onChange={setAirNote} color='#3C3489' />
        <div style={{ display:'flex', gap:8, marginTop:20 }}>
          <button onClick={handleSave} disabled={saving} style={{ fontSize:13, padding:'8px 20px', borderRadius:7, border:'none', background:'#378ADD', color:'#fff', cursor:'pointer', fontWeight:600 }}>
            {saving ? 'שומר...' : '💾 שמור'}
          </button>
          <button onClick={handleClear} style={{ fontSize:13, padding:'8px 16px', borderRadius:7, border:'0.5px solid #E24B4A', background:'transparent', color:'#E24B4A', cursor:'pointer' }}>🗑 מחק</button>
          <button onClick={onClose} style={{ fontSize:13, padding:'8px 16px', borderRadius:7, border:'0.5px solid #ddd', background:'transparent', color:'#555', cursor:'pointer' }}>ביטול</button>
        </div>
      </div>
    </div>
  )
}

function NoteField({ label, value, onChange, color }) {
  const ref = useRef(null)
  function insertFormat(prefix, suffix) {
    const el = ref.current; if (!el) return
    const start = el.selectionStart, end = el.selectionEnd
    const newVal = value.slice(0,start) + prefix + value.slice(start,end) + suffix + value.slice(end)
    onChange(newVal)
    setTimeout(() => { el.focus(); el.setSelectionRange(start+prefix.length, end+prefix.length) }, 0)
  }
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span style={{ fontSize:12, fontWeight:600, color }}>{label}</span>
        <div style={{ display:'flex', gap:4, marginRight:'auto' }}>
          {[{label:'B',prefix:'**',suffix:'**',style:{fontWeight:700}},{label:'I',prefix:'_',suffix:'_',style:{fontStyle:'italic'}},{label:'U',prefix:'__',suffix:'__',style:{textDecoration:'underline'}}].map(btn => (
            <button key={btn.label} onClick={() => insertFormat(btn.prefix, btn.suffix)}
              style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer', ...btn.style }}>{btn.label}</button>
          ))}
          <button onClick={() => { onChange(value+(value&&!value.endsWith('\n')?'\n• ':'• ')); setTimeout(()=>ref.current?.focus(),0) }}
            style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer' }}>•</button>
        </div>
      </div>
      <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
        placeholder={`כתוב ${label} כאן...`}
        style={{ width:'100%', height:100, fontSize:13, padding:'10px 12px', border:`1px solid ${color}40`, borderRadius:8, resize:'vertical', background:'#fafaf8', color:'#1a1a1a', lineHeight:1.6, fontFamily:'inherit', direction:'rtl', textAlign:'right', outline:'none', boxSizing:'border-box' }}
      />
    </div>
  )
}
