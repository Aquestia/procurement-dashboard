import React, { useState, useMemo, useRef } from 'react'
import { Badge, PageWrapper, LoadingState, EmptyState, fmtDate } from '../components/shared'
import * as XLSX from 'xlsx'

const STATUS_OPTIONS = [
  { value: '', label: '—', bg: 'transparent', color: '#888', border: '#ddd' },
  { value: 'בטיפול', label: 'בטיפול', bg: '#FFF3CD', color: '#856404', border: '#FFCA2C' },
  { value: 'טופל', label: 'טופל ✓', bg: '#D1E7DD', color: '#0A3622', border: '#75B798' },
]

export default function TapiView({ data, notes, saveNote, loading }) {
  const [confirmedMonth, setConfirmedMonth] = useState(null)
  const [requestedMonth, setRequestedMonth] = useState(null)
  const [confirmedFrom, setConfirmedFrom] = useState('')
  const [confirmedTo, setConfirmedTo] = useState('')
  const [requestedFrom, setRequestedFrom] = useState('')
  const [requestedTo, setRequestedTo] = useState('')
  const [confirmedRangeActive, setConfirmedRangeActive] = useState(false)
  const [requestedRangeActive, setRequestedRangeActive] = useState(false)
  const [boFilter, setBoFilter] = useState('הכל')
  const [filterTreatment, setFilterTreatment] = useState('הכל')
  const [search, setSearch] = useState('')
  const [editingRow, setEditingRow] = useState(null)

  // ── Compute available months ──
  const confirmedMonths = useMemo(() => {
    if (!data) return []
    const s = new Set()
    data.forEach(r => r.orders?.forEach(o => {
      if (o.confirmedShipDate) {
        const m = o.confirmedShipDate.slice(0, 7)
        s.add(m)
      }
    }))
    return [...s].sort().map(k => {
      const [y, m] = k.split('-')
      const label = new Date(`${y}-${m}-01`).toLocaleDateString('he-IL', { month: 'long', year: '2-digit' })
      return { key: k, label }
    })
  }, [data])

  const requestedMonths = useMemo(() => {
    if (!data) return []
    const s = new Set()
    data.forEach(r => r.orders?.forEach(o => {
      if (o.requestedShipDate) {
        const m = o.requestedShipDate.slice(0, 7)
        s.add(m)
      }
    }))
    return [...s].sort().map(k => {
      const [y, m] = k.split('-')
      const label = new Date(`${y}-${m}-01`).toLocaleDateString('he-IL', { month: 'long', year: '2-digit' })
      return { key: k, label }
    })
  }, [data])

  // ── Filter ──
  const filtered = useMemo(() => {
    if (!data) return []
    return data.filter(r => {
      if (boFilter === 'BO בלבד' && !r.isBO) return false
      if (boFilter === 'לא BO' && r.isBO) return false
      if (filterTreatment !== 'הכל') {
        const st = notes[r.itemNumber]?.treatment_status || ''
        if (filterTreatment === 'טופל' && st !== 'טופל') return false
        if (filterTreatment === 'בטיפול' && st !== 'בטיפול') return false
        if (filterTreatment === 'לא טופל' && st !== '') return false
      }

      // Filter by confirmed month button
      if (confirmedMonth && !confirmedRangeActive) {
        const hasMonth = r.orders?.some(o => o.confirmedShipDate?.startsWith(confirmedMonth))
        if (!hasMonth) return false
      }
      // Filter by requested month button
      if (requestedMonth && !requestedRangeActive) {
        const hasMonth = r.orders?.some(o => o.requestedShipDate?.startsWith(requestedMonth))
        if (!hasMonth) return false
      }
      // Confirmed date range
      if (confirmedRangeActive && confirmedFrom && confirmedTo) {
        const hasRange = r.orders?.some(o => o.confirmedShipDate >= confirmedFrom && o.confirmedShipDate <= confirmedTo + 'T')
        if (!hasRange) return false
      }
      // Requested date range
      if (requestedRangeActive && requestedFrom && requestedTo) {
        const hasRange = r.orders?.some(o => o.requestedShipDate >= requestedFrom && o.requestedShipDate <= requestedTo + 'T')
        if (!hasRange) return false
      }
      if (search) {
        const s = search.toLowerCase()
        return r.itemNumber?.toLowerCase().includes(s) ||
          r.productName?.toLowerCase().includes(s) ||
          r.orders?.some(o => o.salesOrder?.toLowerCase().includes(s) || o.customerName?.toLowerCase().includes(s))
      }
      return true
    })
  }, [data, boFilter, filterTreatment, confirmedMonth, requestedMonth, confirmedRangeActive, requestedRangeActive, confirmedFrom, confirmedTo, requestedFrom, requestedTo, search, notes])

  if (loading) return <LoadingState />
  if (!data || data.length === 0) return <EmptyState />

  function handleExport() {
    const rows = []
    filtered.forEach(r => {
      const n = notes[r.itemNumber] || {}
      const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
      const ords = r.orders?.length > 0 ? r.orders : [{}]
      pos.forEach(po => ords.forEach(o => {
        rows.push({
          'מק"ט': r.itemNumber,
          'תיאור פריט': r.productName || '',
          'סטטוס': r.procurementStatus,
          'סטטוס טיפול': n.treatment_status || '',
          'פק"ע / הזמנה': r.prd?.startsWith('SOIL') ? '' : r.prd || '',
          'הז. מכירה': o.salesOrder || (r.prd?.startsWith('SOIL') ? r.prd : '') || '',
          'שורת מכירה': o.lineNumber || '',
          'לקוח': o.customerName || '',
          'ת. אספקה מאושר': fmtDate(o.confirmedShipDate),
          'ת. אספקה מבוקש': fmtDate(o.requestedShipDate),
          'כמות נדרשת': r.totalQtyRequired,
          'חוסר נטו': r.shortage,
          'הז. רכש': po.purchaseOrder || '',
          'ספק': po.vendorName || '',
          'כמות הוזמנה': po.quantity || '',
          'יתרה': po.deliverRemainder || '',
          'ת. קבלה מאושר': fmtDate(po.confirmedReceiptDate),
          'הערת רכש': n.note_procurement || '',
          'הערת תפ"י': n.note_tapi || '',
        })
      }))
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'מבט תפ"י')
    XLSX.writeFile(wb, 'מבט_תפי.xlsx')
  }

  const soDisplay = (r) => {
    const first = r.orders?.[0]
    if (first?.salesOrder) return first.salesOrder
    if (r.prd?.startsWith('SOIL')) return r.prd
    return '—'
  }

  const prdDisplay = (r) => {
    const prd = r.prd || ''
    if (prd.startsWith('PRD')) return prd   // פק"ע הרכבה
    if (prd.startsWith('SOIL')) return prd  // חלק חילוף
    return '—'
  }

  const firstPO = (r) => r.purchaseOrders?.[0] || {}

  // Best confirmed/requested dates for display
  const bestDates = (r) => {
    const ords = r.orders || []
    const confirmed = ords.map(o => o.confirmedShipDate).filter(Boolean).sort()[0]
    const requested = ords.map(o => o.requestedShipDate).filter(Boolean).sort()[0]
    return { confirmed, requested }
  }

  return (
    <PageWrapper title='מבט תפ"י' topActions={
      <button onClick={handleExport} style={{ fontSize:12, padding:'5px 12px', border:'0.5px solid #378ADD', borderRadius:6, background:'transparent', color:'#378ADD', cursor:'pointer' }}>⬇ ייצוא Excel</button>
    }>
      {/* Month buttons - confirmed */}
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:11, color:'#555', fontWeight:600, marginBottom:5 }}>📅 חודש מאושר (Confirmed ship date)</div>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {confirmedMonths.map(m => (
            <button key={m.key} onClick={() => { setConfirmedMonth(confirmedMonth===m.key?null:m.key); setConfirmedRangeActive(false) }}
              style={{ fontSize:11, padding:'4px 11px', borderRadius:14, cursor:'pointer',
                border:`0.5px solid ${confirmedMonth===m.key&&!confirmedRangeActive?'#378ADD':'#ddd'}`,
                background:confirmedMonth===m.key&&!confirmedRangeActive?'#378ADD':'transparent',
                color:confirmedMonth===m.key&&!confirmedRangeActive?'#fff':'#555' }}>
              {m.label}
            </button>
          ))}
          <button onClick={() => { setConfirmedMonth(null); setConfirmedRangeActive(false) }}
            style={{ fontSize:11, padding:'4px 11px', borderRadius:14, cursor:'pointer', border:'0.5px solid #ddd', background:'transparent', color:'#888' }}>
            הכל
          </button>
        </div>
      </div>

      {/* Month buttons - requested */}
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:11, color:'#555', fontWeight:600, marginBottom:5 }}>📆 חודש מבוקש (Requested ship date)</div>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {requestedMonths.map(m => (
            <button key={m.key} onClick={() => { setRequestedMonth(requestedMonth===m.key?null:m.key); setRequestedRangeActive(false) }}
              style={{ fontSize:11, padding:'4px 11px', borderRadius:14, cursor:'pointer',
                border:`0.5px solid ${requestedMonth===m.key&&!requestedRangeActive?'#7F77DD':'#ddd'}`,
                background:requestedMonth===m.key&&!requestedRangeActive?'#7F77DD':'transparent',
                color:requestedMonth===m.key&&!requestedRangeActive?'#fff':'#555' }}>
              {m.label}
            </button>
          ))}
          <button onClick={() => { setRequestedMonth(null); setRequestedRangeActive(false) }}
            style={{ fontSize:11, padding:'4px 11px', borderRadius:14, cursor:'pointer', border:'0.5px solid #ddd', background:'transparent', color:'#888' }}>
            הכל
          </button>
        </div>
      </div>

      {/* Date ranges */}
      <div style={{ background:'#fff', border:'0.5px solid #e5e5e0', borderRadius:8, padding:'10px 14px', marginBottom:10 }}>
        <DateRange label='📅 מאושר מ:' from={confirmedFrom} to={confirmedTo}
          onFrom={setConfirmedFrom} onTo={setConfirmedTo}
          onApply={() => { setConfirmedRangeActive(true); setConfirmedMonth(null) }}
          onClear={() => { setConfirmedRangeActive(false); setConfirmedFrom(''); setConfirmedTo('') }}
          active={confirmedRangeActive} />
        <div style={{ height:8 }} />
        <DateRange label='📆 מבוקש מ:' from={requestedFrom} to={requestedTo}
          onFrom={setRequestedFrom} onTo={setRequestedTo}
          onApply={() => { setRequestedRangeActive(true); setRequestedMonth(null) }}
          onClear={() => { setRequestedRangeActive(false); setRequestedFrom(''); setRequestedTo('') }}
          active={requestedRangeActive} />
      </div>

      {/* Filters row */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', border:'0.5px solid #ddd', borderRadius:6, overflow:'hidden' }}>
          {['הכל','לא BO','BO בלבד'].map(opt => (
            <button key={opt} onClick={() => setBoFilter(opt)} style={{
              fontSize:12, padding:'5px 12px', border:'none', cursor:'pointer',
              background:boFilter===opt?(opt==='BO בלבד'?'#E24B4A':'#378ADD'):'transparent',
              color:boFilter===opt?'#fff':'#555',
            }}>{opt}</button>
          ))}
        </div>
        <select value={filterTreatment} onChange={e => setFilterTreatment(e.target.value)}
          style={{ fontSize:12, padding:'5px 8px', border:'0.5px solid #ddd', borderRadius:6, background:'#fff', color:'#1a1a1a' }}>
          {['הכל','טופל','בטיפול','לא טופל'].map(o => <option key={o}>{o}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder='חיפוש מק"ט / לקוח...'
          style={{ fontSize:12, padding:'5px 10px', border:'0.5px solid #ddd', borderRadius:6, width:200, background:'#fff', color:'#1a1a1a' }} />
        <span style={{ fontSize:11, color:'#999', marginRight:'auto' }}>{filtered.length} מק"טים</span>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', border:'0.5px solid #e5e5e0', borderRadius:10, overflowX:'auto', overflowY:'auto', maxHeight:'calc(100vh - 320px)' }}>
        <table style={{ width:'max-content', minWidth:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#f4f4f0', position:'sticky', top:0, zIndex:10 }}>
              {['סטטוס טיפול','מק"ט','תיאור מוצר','סטטוס','פק"ע / הזמנה','הז. מכירה','שורת מכירה','לקוח','ת. מאושר','ת. מבוקש','נדרש','חוסר','הז. רכש','שורת רכש','צפי קבלה','הערות'].map(h => (
                <th key={h} style={{ padding:'7px 8px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap', position:'sticky', top:0, background:'#f4f4f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const n = notes[row.itemNumber] || {}
              const treatment = n.treatment_status || ''
              const statusOpt = STATUS_OPTIONS.find(s => s.value === treatment) || STATUS_OPTIONS[0]
              const { confirmed, requested } = bestDates(row)
              const firstOrder = row.orders?.[0]
              const soVal = soDisplay(row)
              const prdVal = prdDisplay(row)

              return (
                <tr key={i}
                  style={{ background: treatment==='טופל'?'#D1E7DD22':treatment==='בטיפול'?'#FFF3CD22':row.isBO?'#FCEBEB18':i%2===0?'#fff':'#fafaf8', cursor:'pointer' }}
                  onClick={e => { if (e.defaultPrevented) return; setEditingRow(row) }}>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }} onClick={e => e.stopPropagation()}>
                    <select value={treatment} onChange={e => saveNote(row.itemNumber, 'treatment_status', e.target.value)}
                      style={{ fontSize:10, padding:'2px 5px', border:`0.5px solid ${statusOpt.border}`, borderRadius:4, background:statusOpt.bg, color:statusOpt.color, cursor:'pointer' }}>
                      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, whiteSpace:'nowrap' }}>{row.itemNumber}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.productName||'—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}><Badge status={row.procurementStatus} /></td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:10, color:'#555' }}>{prdVal||'—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', fontSize:11 }}>{soVal}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11 }}>{firstOrder?.lineNumber||'—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{firstOrder?.customerName||'—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(confirmed)||'—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(requested)||'—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{row.totalQtyRequired}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', color:row.shortage>0?'#A32D2D':'#3B6D11', fontWeight:600 }}>{row.shortage}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11, whiteSpace:'nowrap' }}>
                    {!row.hasPO ? <span style={{color:'#A32D2D'}}>❌</span> : firstPO(row).purchaseOrder||'—'}
                  </td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontSize:11 }}>{firstPO(row).lineNumber||'—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(firstPO(row).confirmedReceiptDate)||'—'}</td>
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

function DateRange({ label, from, to, onFrom, onTo, onApply, onClear, active }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
      <span style={{ fontSize:11, color:'#666', whiteSpace:'nowrap' }}>{label}</span>
      <input type='date' value={from} onChange={e => onFrom(e.target.value)}
        style={{ fontSize:11, padding:'3px 6px', border:'0.5px solid #ddd', borderRadius:5, background:'#fff', color:'#1a1a1a' }} />
      <span style={{ fontSize:11, color:'#888' }}>עד:</span>
      <input type='date' value={to} onChange={e => onTo(e.target.value)}
        style={{ fontSize:11, padding:'3px 6px', border:'0.5px solid #ddd', borderRadius:5, background:'#fff', color:'#1a1a1a' }} />
      <button onClick={onApply} style={{
        fontSize:11, padding:'3px 10px', borderRadius:5,
        border:`0.5px solid ${active?'#378ADD':'#ddd'}`,
        background:active?'#378ADD':'transparent', color:active?'#fff':'#555', cursor:'pointer'
      }}>החל</button>
      {active && <button onClick={onClear} style={{ fontSize:11, padding:'3px 8px', borderRadius:5, border:'0.5px solid #ddd', background:'transparent', color:'#888', cursor:'pointer' }}>נקה</button>}
    </div>
  )
}

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
    setProcNote(''); setTapiNote('')
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
          <button onClick={onClose} style={{ fontSize:18, background:'none', border:'none', cursor:'pointer', color:'#888' }}>✕</button>
        </div>
        <NoteField label='הערת רכש' value={procNote} onChange={setProcNote} color='#185FA5' />
        <div style={{ height:12 }} />
        <NoteField label='הערת תפ"י' value={tapiNote} onChange={setTapiNote} color='#3B6D11' />
        <div style={{ display:'flex', gap:8, marginTop:20 }}>
          <button onClick={handleSave} disabled={saving} style={{ fontSize:13, padding:'8px 20px', borderRadius:7, border:'none', background:'#378ADD', color:'#fff', cursor:'pointer', fontWeight:600 }}>
            {saving ? 'שומר...' : '💾 שמור'}
          </button>
          <button onClick={handleClear} style={{ fontSize:13, padding:'8px 16px', borderRadius:7, border:'0.5px solid #E24B4A', background:'transparent', color:'#E24B4A', cursor:'pointer' }}>🗑 מחק הערות</button>
          <button onClick={onClose} style={{ fontSize:13, padding:'8px 16px', borderRadius:7, border:'0.5px solid #ddd', background:'transparent', color:'#555', cursor:'pointer' }}>ביטול</button>
        </div>
      </div>
    </div>
  )
}

function NoteField({ label, value, onChange, color }) {
  const ref = useRef(null)
  function ins(pre, suf) {
    const el = ref.current; if (!el) return
    const s = el.selectionStart, e = el.selectionEnd
    onChange(value.slice(0,s) + pre + value.slice(s,e) + suf + value.slice(e))
    setTimeout(() => { el.focus(); el.setSelectionRange(s+pre.length, e+pre.length) }, 0)
  }
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span style={{ fontSize:12, fontWeight:600, color }}>{label}</span>
        <div style={{ display:'flex', gap:4, marginRight:'auto' }}>
          {[['B','**','**'],['I','_','_'],['U','__','__']].map(([l,p,s]) => (
            <button key={l} onClick={() => ins(p,s)} style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer', fontWeight:l==='B'?700:400, fontStyle:l==='I'?'italic':'normal', textDecoration:l==='U'?'underline':'none' }}>{l}</button>
          ))}
          <button onClick={() => onChange(value+(value&&!value.endsWith('\n')?'\n':'')+'• ')} style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer' }}>•</button>
          <button onClick={() => onChange(value+(value&&!value.endsWith('\n')?'\n':'')+'1. ')} style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer' }}>1.</button>
        </div>
      </div>
      <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
        placeholder={`כתוב ${label} כאן...`}
        style={{ width:'100%', height:120, fontSize:13, padding:'10px 12px', border:`1px solid ${color}40`, borderRadius:8, resize:'vertical', background:'#fafaf8', color:'#1a1a1a', lineHeight:1.6, fontFamily:'inherit', direction:'rtl', textAlign:'right', outline:'none', boxSizing:'border-box' }} />
    </div>
  )
}
