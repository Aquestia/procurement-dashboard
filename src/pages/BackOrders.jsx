import React, { useState, useMemo, useRef } from 'react'
import { Badge, fmtDate, LoadingState, EmptyState, PageWrapper } from '../components/shared'
import * as XLSX from 'xlsx'

// עמודות הטבלה הראשית — לפי שורת הזמנה
const COLS = [
  { label: 'הערות',          w: 90  },
  { label: 'הז. מכירה',      w: 110 },
  { label: 'שורה',           w: 55  },
  { label: 'לקוח',           w: 160 },
  { label: 'ת. אספקה מאושר', w: 110 },
  { label: 'ערך BO ($)',      w: 110 },
  { label: 'מק"טים חסרים',   w: 80  },
]

export default function BackOrders({ data, notes, saveNote, loading }) {
  const [search, setSearch]             = useState('')
  const [filterPO, setFilterPO]         = useState('הכל')
  const [editingRow, setEditingRow]     = useState(null)
  const [expandedKey, setExpandedKey]   = useState(null)

  // קיבוץ מחדש: במקום מק"ט → הזמנות, בונים הזמנה+שורה → מק"טים חסרים
  const orderLines = useMemo(() => {
    if (!data) return []

    const boItems = data.filter(r => r.isBO)
    const lineMap = {}

    boItems.forEach(item => {
      item.orders?.forEach(order => {
        if (!order.isBO) return
        const key = order.slKey || `${order.salesOrder}-${order.lineNumber}`
        if (!lineMap[key]) {
          lineMap[key] = {
            key,
            salesOrder:       order.salesOrder,
            lineNumber:       order.lineNumber,
            customerName:     order.customerName,
            confirmedShipDate: order.confirmedShipDate,
            requestedShipDate: order.requestedShipDate,
            remainingAmount:  order.remainingAmount || 0,
            shortages: [],   // כל המק"טים החסרים לשורה זו
          }
        }
        // הוספת המק"ט החסר אם לא קיים כבר
        const existing = lineMap[key].shortages.find(s => s.itemNumber === item.itemNumber)
        if (!existing) {
          const pos = item.purchaseOrders || []
          lineMap[key].shortages.push({
            itemNumber:          item.itemNumber,
            productName:         item.productName,
            shortage:            item.shortage,
            totalQtyRequired:    item.totalQtyRequired,
            hasPO:               item.hasPO,
            confirmedReceiptDate: item.confirmedReceiptDate,
            vendors:             item.vendors,
            purchaseOrders:      pos,
          })
        }
      })
    })

    return Object.values(lineMap).sort((a, b) => {
      if (a.salesOrder < b.salesOrder) return -1
      if (a.salesOrder > b.salesOrder) return 1
      return Number(a.lineNumber) - Number(b.lineNumber)
    })
  }, [data])

  const filtered = useMemo(() => {
    return orderLines.filter(line => {
      if (filterPO === 'ללא הזמנה' && line.shortages.every(s => s.hasPO)) return false
      if (filterPO === 'ללא תאריך' && line.shortages.every(s => !s.hasPO || s.confirmedReceiptDate)) return false
      if (search) {
        const s = search.toLowerCase()
        return line.salesOrder?.toLowerCase().includes(s) ||
          line.customerName?.toLowerCase().includes(s) ||
          line.shortages.some(sh => sh.itemNumber?.toLowerCase().includes(s) || sh.productName?.toLowerCase().includes(s))
      }
      return true
    })
  }, [orderLines, filterPO, search])

  const kpis = useMemo(() => {
    const totalAmount = orderLines.reduce((s, l) => s + (l.remainingAmount || 0), 0)
    const noPO   = orderLines.filter(l => l.shortages.some(s => !s.hasPO))
    const noDate = orderLines.filter(l => l.shortages.some(s => s.hasPO && !s.confirmedReceiptDate))
    return {
      totalLines:  orderLines.length,
      totalAmount,
      noPOCount:   noPO.length,
      noPOAmount:  noPO.reduce((s, l) => s + (l.remainingAmount || 0), 0),
      noDateCount: noDate.length,
      noDateAmount: noDate.reduce((s, l) => s + (l.remainingAmount || 0), 0),
    }
  }, [orderLines])

  if (loading) return <LoadingState />
  if (!data)   return <EmptyState />

  function handleExport() {
    const rows = []
    filtered.forEach(line => {
      line.shortages.forEach(sh => {
        sh.purchaseOrders?.forEach(po => {
          rows.push({
            'הז. מכירה':       line.salesOrder,
            'שורה':            line.lineNumber,
            'לקוח':            line.customerName,
            'ת. אספקה מאושר':  fmtDate(line.confirmedShipDate),
            'ערך BO ($)':      line.remainingAmount,
            'מק"ט':            sh.itemNumber,
            'תיאור':           sh.productName,
            'חוסר':            sh.shortage,
            'נדרש':            sh.totalQtyRequired,
            'הז. רכש':         po.purchaseOrder || '',
            'ספק':             po.vendorName || '',
            'ת. קבלה מאושר':   fmtDate(po.confirmedReceiptDate),
            'הערת רכש':        (notes[sh.itemNumber] || {}).note_procurement || '',
            'הערת תפ"י':       (notes[sh.itemNumber] || {}).note_tapi || '',
          })
        })
        if (!sh.purchaseOrders?.length) {
          rows.push({
            'הז. מכירה':      line.salesOrder,
            'שורה':           line.lineNumber,
            'לקוח':           line.customerName,
            'ת. אספקה מאושר': fmtDate(line.confirmedShipDate),
            'ערך BO ($)':     line.remainingAmount,
            'מק"ט':           sh.itemNumber,
            'תיאור':          sh.productName,
            'חוסר':           sh.shortage,
            'נדרש':           sh.totalQtyRequired,
            'הז. רכש':        '—',
          })
        }
      })
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Back Orders')
    XLSX.writeFile(wb, 'back_orders.xlsx')
  }

  return (
    <PageWrapper title={`Back Orders — ${orderLines.length} שורות הזמנה`} topActions={
      <button onClick={handleExport} style={{ fontSize:12, padding:'5px 12px', border:'0.5px solid #378ADD', borderRadius:6, background:'transparent', color:'#378ADD', cursor:'pointer' }}>⬇ ייצוא Excel</button>
    }>

      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'סה"כ שורות BO',   value:kpis.totalLines,  amt:kpis.totalAmount,   color:'#A32D2D' },
          { label:'ללא תאריך רכש',   value:kpis.noDateCount, amt:kpis.noDateAmount,  color:'#854F0B' },
          { label:'ללא הזמנת רכש',   value:kpis.noPOCount,   amt:kpis.noPOAmount,    color:'#A32D2D' },
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder='חיפוש הזמנה / לקוח / מק"ט...'
          style={{ fontSize:12, padding:'5px 10px', border:'0.5px solid #ddd', borderRadius:6, width:220, background:'#fff', color:'#1a1a1a' }} />
        {['הכל','ללא הזמנה','ללא תאריך'].map(o => (
          <button key={o} onClick={() => setFilterPO(o)} style={{
            fontSize:12, padding:'4px 10px', borderRadius:6, cursor:'pointer',
            border:`0.5px solid ${filterPO===o?'#378ADD':'#ddd'}`,
            background:filterPO===o?'#378ADD':'transparent', color:filterPO===o?'#fff':'#555',
          }}>{o}</button>
        ))}
        <span style={{ fontSize:11, color:'#999', marginRight:'auto' }}>{filtered.length} שורות</span>
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
            {filtered.map((line, i) => {
              const isExpanded  = expandedKey === line.key
              const hasNoPO     = line.shortages.some(s => !s.hasPO)
              const hasNoDate   = line.shortages.some(s => s.hasPO && !s.confirmedReceiptDate)
              // הערות — לפי המק"ט הראשון בשורה (או כל מק"ט שיש לו הערה)
              const noteItem    = line.shortages.find(s => (notes[s.itemNumber]?.note_procurement || notes[s.itemNumber]?.note_tapi))
              const firstItem   = line.shortages[0]
              const editItem    = noteItem || firstItem

              return (
                <React.Fragment key={line.key}>
                  <tr
                    style={{ background: hasNoPO ? '#FCEBEB18' : i%2===0 ? '#fff' : '#fafaf8', cursor:'pointer' }}
                    onClick={() => setExpandedKey(isExpanded ? null : line.key)}
                  >
                    {/* הערות — לפי כל המק"טים בשורה */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                        {line.shortages.some(s => notes[s.itemNumber]?.note_procurement) &&
                          <span style={{ fontSize:9, background:'#E6F1FB', color:'#185FA5', padding:'1px 5px', borderRadius:4 }}>רכש</span>}
                        {line.shortages.some(s => notes[s.itemNumber]?.note_tapi) &&
                          <span style={{ fontSize:9, background:'#EAF3DE', color:'#3B6D11', padding:'1px 5px', borderRadius:4 }}>תפ"י</span>}
                        <button onClick={() => editItem && setEditingRow(editItem)} style={{
                          fontSize:10, padding:'1px 6px', borderRadius:4,
                          border:'0.5px solid #ddd', background:'#f4f4f0', color:'#555', cursor:'pointer',
                        }}>✏️</button>
                      </div>
                    </td>

                    {/* הז. מכירה */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, whiteSpace:'nowrap' }}>
                      <span style={{ marginLeft:4, fontSize:10, color:'#378ADD' }}>{isExpanded ? '▲' : '▼'}</span>
                      {line.salesOrder}
                    </td>

                    {/* שורה */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11 }}>
                      {line.lineNumber}
                    </td>

                    {/* לקוח */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {line.customerName||'—'}
                    </td>

                    {/* ת. אספקה מאושר */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontSize:11, color: line.confirmedShipDate ? '#1a1a1a' : '#aaa' }}>
                      {fmtDate(line.confirmedShipDate)||'—'}
                    </td>

                    {/* ערך BO */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontWeight:600, color:'#A32D2D' }}>
                      {line.remainingAmount ? '$' + Math.round(line.remainingAmount).toLocaleString() : '—'}
                    </td>

                    {/* מק"טים חסרים */}
                    <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', textAlign:'center' }}>
                      <span style={{ fontSize:11, fontWeight:600, background:'#FCEBEB', color:'#A32D2D', padding:'1px 8px', borderRadius:10 }}>
                        {line.shortages.length}
                      </span>
                    </td>
                  </tr>

                  {/* Expanded — רשימת המק"טים החסרים */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={COLS.length} style={{ padding:0, borderBottom:'0.5px solid #e0e0da', background:'#f8f8f6' }}>
                        <div style={{ padding:'12px 16px', direction:'rtl' }}>
                          <div style={{ fontSize:11, fontWeight:600, color:'#555', marginBottom:8 }}>
                            מק"טים חסרים — {line.salesOrder} שורה {line.lineNumber} ({line.shortages.length})
                          </div>
                          <div style={{ overflowX:'auto' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                              <thead>
                                <tr>
                                  {['מק"ט','תיאור','חוסר','נדרש','הז. רכש','ספק','ת. קבלה','הערות'].map(h => (
                                    <th key={h} style={{ background:'#f0f0ec', padding:'4px 8px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {line.shortages.map((sh, j) => {
                                  const n = notes[sh.itemNumber] || {}
                                  const po = sh.purchaseOrders?.[0] || {}
                                  return (
                                    <tr key={j} style={{ background: j%2===0 ? '#fff' : '#fafaf8' }}>
                                      <td style={{ padding:'4px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, whiteSpace:'nowrap' }}>{sh.itemNumber}</td>
                                      <td style={{ padding:'4px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sh.productName||'—'}</td>
                                      <td style={{ padding:'4px 8px', borderBottom:'0.5px solid #f0f0ea', color:'#A32D2D', fontWeight:600 }}>{sh.shortage}</td>
                                      <td style={{ padding:'4px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{sh.totalQtyRequired}</td>
                                      <td style={{ padding:'4px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>
                                        {!sh.hasPO
                                          ? <span style={{ color:'#A32D2D', fontSize:10 }}>❌ ללא הז. רכש</span>
                                          : po.purchaseOrder||'—'}
                                      </td>
                                      <td style={{ padding:'4px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sh.vendors?.[0]||'—'}</td>
                                      <td style={{ padding:'4px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', color: !sh.confirmedReceiptDate ? '#A32D2D' : '#1a1a1a' }}>
                                        {fmtDate(sh.confirmedReceiptDate)||'⚠️ חסר'}
                                      </td>
                                      <td style={{ padding:'4px 8px', borderBottom:'0.5px solid #f0f0ea' }} onClick={e => e.stopPropagation()}>
                                        <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                                          {n.note_procurement && <span style={{ fontSize:9, background:'#E6F1FB', color:'#185FA5', padding:'1px 4px', borderRadius:3 }}>רכש</span>}
                                          {n.note_tapi        && <span style={{ fontSize:9, background:'#EAF3DE', color:'#3B6D11', padding:'1px 4px', borderRadius:3 }}>תפ"י</span>}
                                          <button onClick={() => setEditingRow(sh)} style={{ fontSize:10, padding:'1px 5px', borderRadius:4, border:'0.5px solid #ddd', background:'#f4f4f0', color:'#555', cursor:'pointer' }}>✏️</button>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
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
