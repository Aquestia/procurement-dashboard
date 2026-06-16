import React, { useState, useMemo, useRef } from 'react'
import { Badge, ExportButton, PageWrapper, LoadingState, EmptyState, fmtDate } from '../components/shared'
import * as XLSX from 'xlsx'

const STATUS_OPTIONS = [
  { value: '', label: '—', bg: 'transparent', color: '#888', border: '#ddd' },
  { value: 'בטיפול', label: 'בטיפול', bg: '#FFF3CD', color: '#856404', border: '#FFCA2C' },
  { value: 'טופל', label: 'טופל ✓', bg: '#D1E7DD', color: '#0A3622', border: '#75B798' },
]

export default function ProcurementView({ data, notes, saveNote, loading }) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('הכל')
  const [filterTreatment, setFilterTreatment] = useState('הכל')
  const [editingRow, setEditingRow] = useState(null)

  const filtered = useMemo(() => {
    if (!data || data.length === 0) return []
    return data.filter(r => {
    if (filterStatus !== 'הכל' && r.procurementStatus !== filterStatus) return false
    if (filterTreatment !== 'הכל') {
      const n = notes[r.itemNumber]
      const st = n?.treatment_status || ''
      if (filterTreatment === 'טופל' && st !== 'טופל') return false
      if (filterTreatment === 'בטיפול' && st !== 'בטיפול') return false
      if (filterTreatment === 'לא טופל' && st !== '') return false
    }
    if (search) {
      const s = search.toLowerCase()
      return r.itemNumber?.toLowerCase().includes(s) ||
        r.productName?.toLowerCase().includes(s) ||
        r.orders?.some(o => o.salesOrder?.toLowerCase().includes(s) || o.customerName?.toLowerCase().includes(s))
    }
      return true
    })
  }, [data, search, filterStatus, filterTreatment, notes])

  if (loading) return <LoadingState />
  if (!data || data.length === 0) return <EmptyState />

  function handleExport() {
    const rows = []
    filtered.forEach(r => {
      const n = notes[r.itemNumber] || {}
      const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
      const ords = r.orders?.length > 0 ? r.orders : [{}]
      pos.forEach(po => ords.forEach(o => {
        const soVal = o.salesOrder || (r.prd?.startsWith('SOIL') ? r.prd : '')
        rows.push({
          'מק"ט': r.itemNumber,
          'תיאור פריט': r.productName||'',
          'סטטוס': r.procurementStatus,
          'סטטוס טיפול': n.treatment_status||'',
          'פק"ע / הזמנה': r.prd?.startsWith('SOIL') ? '' : r.prd||'',
          'הז. מכירה': soVal||'',
          'שורת מכירה': o.lineNumber||'',
          'לקוח': o.customerName||'',
          'ת. אספקה מאושר': fmtDate(o.confirmedShipDate),
          'ת. אספקה מבוקש': fmtDate(o.requestedShipDate),
          'כמות נדרשת': r.totalQtyRequired,
          'נאסף': r.totalQtyPicked,
          'זמין': r.totalAvailable,
          'בהזמנה': r.totalOnOrder,
          'חוסר נטו': r.shortage,
          'הז. רכש': po.purchaseOrder||'',
          'שורת רכש': po.lineNumber||'',
          'ספק': po.vendorName||'',
          'קב. רכש': po.buyerGroup||'',
          'כמות הוזמנה': po.quantity||'',
          'יתרה': po.deliverRemainder||'',
          'ת. קבלה מאושר': fmtDate(po.confirmedReceiptDate),
          'ת. קבלה מבוקש': fmtDate(po.requestedReceiptDate),
          'הערת רכש': n.note_procurement||'',
          'הערת תפ"י': n.note_tapi||'',
        })
      }))
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'מבט רכש')
    XLSX.writeFile(wb, 'מבט_רכש.xlsx')
  }

  const prdDisplay = (r) => {
    const prd = r.prd || ''
    if (prd.startsWith('SOIL')) return prd
    if (prd.startsWith('PRD')) return '' // hide PRD, show SOIL from orders instead
    return prd
  }

  const soDisplay = (r) => {
    const firstOrder = r.orders?.[0]
    if (firstOrder?.salesOrder) return firstOrder.salesOrder
    if (r.prd?.startsWith('SOIL')) return r.prd
    return '—'
  }

  return (
    <PageWrapper title='מבט רכש — חוסרים לפי מק"ט' topActions={
      <button onClick={handleExport} style={{ fontSize:12, padding:'5px 12px', border:'0.5px solid #378ADD', borderRadius:6, background:'transparent', color:'#378ADD', cursor:'pointer' }}>⬇ ייצוא Excel</button>
    }>
      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder='חיפוש מק"ט / תיאור / לקוח...'
          style={{ fontSize:12, padding:'5px 10px', border:'0.5px solid #ddd', borderRadius:6, width:220, background:'#fff', color:'#1a1a1a' }} />
        {['הכל','BO','בסכנה','תקין'].map(o => (
          <button key={o} onClick={() => setFilterStatus(o)} style={{
            fontSize:12, padding:'4px 10px', borderRadius:6, cursor:'pointer',
            border:'0.5px solid '+(filterStatus===o?'#378ADD':'#ddd'),
            background:filterStatus===o?'#378ADD':'transparent',
            color:filterStatus===o?'#fff':'#555',
          }}>{o}</button>
        ))}
        <select value={filterTreatment} onChange={e => setFilterTreatment(e.target.value)}
          style={{ fontSize:12, padding:'5px 8px', border:'0.5px solid #ddd', borderRadius:6, background:'#fff', color:'#1a1a1a' }}>
          {['הכל','טופל','בטיפול','לא טופל'].map(o => <option key={o}>{o}</option>)}
        </select>
        <span style={{ fontSize:11, color:'#999', marginRight:'auto' }}>{filtered.length} מק"טים</span>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', border:'0.5px solid #e5e5e0', borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#f4f4f0' }}>
              {['סטטוס טיפול','מק"ט','תיאור מוצר','סטטוס','פק"ע / הזמנה','הז. מכירה','BO','הזמנות','נדרש','נאסף','בהזמנה','זמין','חוסר','הז. רכש','ספק','צפי קבלה','הערות'].map(h => (
                <th key={h} style={{ padding:'7px 8px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const n = notes[row.itemNumber] || {}
              const treatment = n.treatment_status || ''
              const soVal = soDisplay(row)
              const prdVal = prdDisplay(row)
              const statusOpt = STATUS_OPTIONS.find(s => s.value === treatment) || STATUS_OPTIONS[0]

              return (
                <tr key={i} style={{ background: treatment==='טופל' ? '#D1E7DD22' : treatment==='בטיפול' ? '#FFF3CD22' : row.isBO ? '#FCEBEB18' : i%2===0?'#fff':'#fafaf8', cursor:'pointer' }}
                  onClick={e => { if (e.defaultPrevented) return; setEditingRow(row) }}>
                  {/* Treatment status */}
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }} onClick={e => e.preventDefault()}>
                    <select value={treatment} onChange={e => { e.preventDefault(); saveNote(row.itemNumber, 'treatment_status', e.target.value) }}
                      style={{ fontSize:10, padding:'2px 5px', border:`0.5px solid ${statusOpt.border}`, borderRadius:4, background:statusOpt.bg, color:statusOpt.color, cursor:'pointer' }}>
                      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, whiteSpace:'nowrap' }}>{row.itemNumber}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.productName||'—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}><Badge status={row.procurementStatus} /></td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:10, color:'#555', whiteSpace:'nowrap' }}>{prdVal||'—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontSize:11 }}>{soVal}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', color:row.boOrdersCount>0?'#A32D2D':'#1a1a1a', fontWeight:row.boOrdersCount>0?600:400 }}>{row.boOrdersCount}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{row.affectedOrdersCount}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{row.totalQtyRequired}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{row.totalQtyPicked}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{row.totalOnOrder}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{row.totalAvailable}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', color:row.shortage>0?'#A32D2D':'#3B6D11', fontWeight:600 }}>{row.shortage}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:10 }}>
                    {!row.hasPO ? <span style={{ color:'#A32D2D' }}>❌</span> : row.hasNoDate ? <span style={{ color:'#854F0B' }}>⚠️</span> : <span style={{ color:'#3B6D11' }}>✅</span>}
                  </td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.vendors?.join(', ')||'—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(row.confirmedReceiptDate)||'—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      {n.note_procurement && <span style={{ fontSize:9, background:'#E6F1FB', color:'#185FA5', padding:'1px 5px', borderRadius:4 }}>רכש</span>}
                      {n.note_tapi && <span style={{ fontSize:9, background:'#EAF3DE', color:'#3B6D11', padding:'1px 5px', borderRadius:4 }}>תפ"י</span>}
                      {!n.note_procurement && !n.note_tapi && <span style={{ fontSize:10, color:'#ccc' }}>+ הוסף</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding:30, textAlign:'center', color:'#aaa' }}>אין נתונים</div>}
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
    await onSave('note_procurement', procNote)
    await onSave('note_tapi', tapiNote)
    setSaving(false)
    onClose()
  }

  async function handleClear() {
    if (!confirm('למחוק את כל ההערות?')) return
    setProcNote('')
    setTapiNote('')
    await onSave('note_procurement', '')
    await onSave('note_tapi', '')
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
        <NoteField
          label='הערת רכש'
          value={procNote}
          onChange={setProcNote}
          color='#185FA5'
        />
        <div style={{ height:12 }} />
        <NoteField
          label='הערת תפ"י'
          value={tapiNote}
          onChange={setTapiNote}
          color='#3B6D11'
        />

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

  function insertList() {
    const lines = value.split('\n')
    const newLine = value && !value.endsWith('\n') ? '\n• ' : '• '
    onChange(value + newLine)
    setTimeout(() => ref.current?.focus(), 0)
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
          <button title='רשימה' onClick={insertList}
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
