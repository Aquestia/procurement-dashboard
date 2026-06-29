import { useMemo, useState, useRef, useEffect } from 'react'
import { Badge, fmtDate } from '../components/shared'
import * as XLSX from 'xlsx'

const AIR_STATUSES = [
  { value: '',        label: '—',            bg: 'transparent',        color: 'var(--text-muted)',  border: 'var(--border-light)' },
  { value: 'ממתין',   label: '⏳ ממתין',      bg: 'var(--bg-neutral)',   color: 'var(--text-sub)',    border: 'var(--border-light)' },
  { value: 'בתיאום',  label: '📞 בתיאום',     bg: 'var(--amber-bg)',     color: 'var(--amber-dark)',  border: '#FFCA2C'             },
  { value: 'הוזמן',   label: '✈ הוזמן',       bg: 'var(--blue-bg)',      color: 'var(--blue-dark)',   border: '#378ADD'             },
  { value: 'בדרך',    label: '🛫 בדרך',        bg: '#FFF3CD',            color: '#854F0B',            border: '#FFCA2C'             },
  { value: 'הגיע',    label: '✅ הגיע',        bg: 'var(--green-bg)',     color: 'var(--green-dark)',  border: '#75B798'             },
  { value: 'בוטל',    label: '❌ בוטל',        bg: 'var(--red-bg)',       color: 'var(--red-dark)',    border: '#F09595'             },
]

/* Cell with status dropdown + note textarea — debounced save */
function AirStatusCell({ itemNumber, airStatus, airNote, onSave }) {
  const [status, setStatus] = useState(airStatus || '')
  const [note, setNote]     = useState(airNote || '')
  const [saved, setSaved]   = useState(false)
  const timer = useRef(null)

  // Sync when external notes load (Supabase async)
  useEffect(() => { setStatus(airStatus || '') }, [airStatus])
  useEffect(() => { setNote(airNote || '') },     [airNote])

  const opt = AIR_STATUSES.find(s => s.value === status) || AIR_STATUSES[0]

  function handleStatus(e) {
    const v = e.target.value
    setStatus(v)
    onSave(itemNumber, 'air_status', v)
    flash()
  }

  function handleNote(e) {
    const v = e.target.value
    setNote(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { onSave(itemNumber, 'air_note', v); flash() }, 800)
  }

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  return (
    <td style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', verticalAlign:'top', minWidth:240 }}>
      <select value={status} onChange={handleStatus}
        style={{ fontSize:11, padding:'3px 7px', borderRadius:6, cursor:'pointer', fontWeight:600, width:'100%', marginBottom:5,
          border:`1px solid ${opt.border}`, background:opt.bg, color:opt.color, outline:'none' }}>
        {AIR_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label || '— ללא סטטוס'}</option>)}
      </select>
      <textarea value={note} onChange={handleNote} placeholder="הערת הטסה..." rows={2}
        style={{ fontSize:11, padding:'4px 8px', borderRadius:5, resize:'vertical', width:'100%',
          border: note ? '1px solid var(--blue)' : '1px solid var(--border-light)',
          background: note ? 'var(--blue-bg)' : 'var(--bg-card)',
          color:'var(--text-main)', outline:'none', direction:'rtl', fontFamily:'inherit',
          transition:'all 0.2s', minHeight:40, boxSizing:'border-box' }} />
      {saved && <div style={{ fontSize:9, color:'var(--green-dark)', marginTop:2 }}>✓ נשמר</div>}
    </td>
  )
}

export default function AirShipment({ data, notes, saveNote, loading }) {
  const [search, setSearch] = useState('')

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

  function buildExcel() {
    const rows = []
    filtered.forEach(r => {
      const n = r.note
      const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
      const ords = r.orders?.length > 0 ? r.orders : [{}]
      pos.forEach(po => ords.forEach(o => rows.push({
        'מק"ט': r.itemNumber, 'תיאור': r.productName || '',
        'סטטוס': r.procurementStatus, 'פק"ע': r.prd || '',
        'הז. מכירה': o.salesOrder || '', 'לקוח': o.customerName || '',
        'ת. אספקה': fmtDate(o.confirmedShipDate),
        'נדרש': r.totalQtyRequired, 'חוסר': r.shortage,
        'הז. רכש': po.purchaseOrder || '', 'ספק': po.vendorName || '',
        'צפי קבלה': fmtDate(po.confirmedReceiptDate),
        'סטטוס הטסה': n.air_status || '',
        'הערת הטסה':  n.air_note || '',
        'הערת רכש':   n.note_procurement || '',
        'הערת תפ"י':  n.note_tapi || '',
      })))
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'פריטים להטסה')
    XLSX.writeFile(wb, 'פריטים_להטסה.xlsx')
  }

  function handleWhatsApp() {
    buildExcel()
    const today = new Date().toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric' })
    const itemList = filtered.map(r => {
      const st = r.note?.air_status
      return `• ${r.itemNumber} — ${r.productName || ''}${st ? ` [${st}]` : ''}`
    }).join('\n')
    const text = encodeURIComponent(`✈ *פריטים להטסה — ${today}*\n\n${itemList}\n\nסה"כ ${filtered.length} מק"טים`)
    setTimeout(() => window.open(`https://web.whatsapp.com/send?text=${text}`, '_blank'), 800)
  }

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'var(--text-muted)' }}>טוען...</div>

  const HEADERS = ['מק"ט','תיאור מוצר','סטטוס','פק"ע / הזמנה','הז. מכירה','שורת מכירה','לקוח','ת. אספקה מאושר','נדרש','נאסף','בהזמנה','זמין','חוסר','הז. רכש','שורת רכש','ספק','מסלול','צפי קבלה','הערת רכש','הערת תפ"י','סטטוס הטסה + הערה']

  return (
    <div style={{ padding:24, direction:'rtl' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:18, fontWeight:600, color:'var(--text-main)', margin:0 }}>✈ פריטים להטסה</h1>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:3 }}>
            {filtered.length !== airItems.length ? `${filtered.length} מתוך ${airItems.length} מק"טים` : `${airItems.length} מק"טים מסומנים להטסה`}
          </div>
        </div>
        <div style={{ marginRight:'auto', display:'flex', gap:8 }}>
          <button onClick={buildExcel} style={{ fontSize:12, padding:'7px 16px', borderRadius:7, border:'1px solid var(--green-dark)', background:'var(--green-dark)', color:'#fff', cursor:'pointer', fontWeight:600 }}>⬇ ייצוא Excel</button>
          <button onClick={handleWhatsApp} style={{ fontSize:12, padding:'7px 16px', borderRadius:7, border:'1px solid #25D366', background:'#25D366', color:'#fff', cursor:'pointer', fontWeight:600 }}>💬 ייצוא + WhatsApp</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
        {AIR_STATUSES.filter(s => s.value).map(s => (
          <span key={s.value} style={{ fontSize:10, padding:'2px 8px', borderRadius:10, fontWeight:600, background:s.bg, color:s.color, border:`1px solid ${s.border}` }}>{s.label}</span>
        ))}
      </div>

      {/* Search */}
      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border-card)', borderRadius:10, padding:'10px 14px', marginBottom:14, display:'flex', gap:10, alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder='חיפוש מק"ט / תיאור / לקוח...'
          style={{ flex:1, fontSize:12, padding:'6px 10px', border:'1px solid var(--border-light)', borderRadius:6, background:'var(--bg-row)', color:'var(--text-main)', direction:'rtl', outline:'none' }} />
        {search && <button onClick={() => setSearch('')} style={{ fontSize:11, padding:'4px 10px', border:'1px solid var(--border-light)', borderRadius:6, background:'transparent', color:'var(--text-muted)', cursor:'pointer' }}>✕ נקה</button>}
      </div>

      {/* Empty */}
      {airItems.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-hint)', fontSize:14 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✈</div>
          אין מק"טים מסומנים להטסה כרגע
          <div style={{ fontSize:12, marginTop:8 }}>סמן פריטים כ"הטסה" במבט רכש או מבט תפ"י</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--text-hint)', fontSize:13 }}>לא נמצאו תוצאות לחיפוש</div>
      ) : (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border-card)', borderRadius:10, overflowX:'auto', overflowY:'auto', maxHeight:'calc(100vh - 310px)' }}>
          <table style={{ width:'max-content', minWidth:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'var(--blue-bg)', position:'sticky', top:0, zIndex:10 }}>
                {HEADERS.map(h => (
                  <th key={h} style={{ padding:'7px 10px', fontWeight:600, fontSize:10, color:'var(--blue-dark)', borderBottom:'1px solid #B5D4F4', textAlign:'right', whiteSpace:'nowrap', background:'var(--blue-bg)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.flatMap((row, i) => {
                const pos = row.purchaseOrders?.length > 0 ? row.purchaseOrders : [{}]
                const ords = row.orders?.length > 0 ? row.orders : [{}]
                const combos = []
                pos.forEach(po => ords.forEach(o => combos.push({ po, o })))
                const n = row.note

                return combos.map(({ po, o }, j) => (
                  <tr key={`${i}-${j}`} style={{ background: i%2===0 ? 'var(--bg-card)' : 'var(--bg-row)', verticalAlign:'top' }}>
                    {j===0 && <td rowSpan={combos.length} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', fontWeight:700, whiteSpace:'nowrap', verticalAlign:'middle', color:'var(--blue-dark)' }}>{row.itemNumber}</td>}
                    {j===0 && <td rowSpan={combos.length} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', verticalAlign:'middle', color:'var(--text-main)' }}>{row.productName||'—'}</td>}
                    {j===0 && <td rowSpan={combos.length} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', verticalAlign:'middle' }}><Badge status={row.procurementStatus} /></td>}
                    {j===0 && <td rowSpan={combos.length} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', fontSize:10, color:'var(--text-sub)', whiteSpace:'nowrap', verticalAlign:'middle' }}>{row.prd||'—'}</td>}
                    <td style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', whiteSpace:'nowrap', fontSize:11, color:'var(--text-main)' }}>{o.salesOrder||(row.prd?.startsWith('SOIL')?row.prd:'—')}</td>
                    <td style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', fontSize:11, color:'var(--text-main)' }}>{o.lineNumber||'—'}</td>
                    <td style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text-main)' }}>{o.customerName||'—'}</td>
                    <td style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', whiteSpace:'nowrap', color: o.confirmedShipDate?'var(--text-main)':'var(--text-hint)' }}>{fmtDate(o.confirmedShipDate)||'—'}</td>
                    {j===0 && <td rowSpan={combos.length} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', fontWeight:600, verticalAlign:'middle', color:'var(--text-main)' }}>{row.totalQtyRequired}</td>}
                    {j===0 && <td rowSpan={combos.length} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', verticalAlign:'middle', color:'var(--text-main)' }}>{row.totalQtyPicked}</td>}
                    {j===0 && <td rowSpan={combos.length} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', verticalAlign:'middle', color:'var(--text-main)' }}>{row.totalOnOrder}</td>}
                    {j===0 && <td rowSpan={combos.length} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', verticalAlign:'middle', color:'var(--text-main)' }}>{row.totalAvailable}</td>}
                    {j===0 && <td rowSpan={combos.length} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', fontWeight:600, color: row.shortage>0?'var(--red-dark)':'var(--green-dark)', verticalAlign:'middle' }}>{row.shortage}</td>}
                    <td style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', whiteSpace:'nowrap', fontSize:11, color:'var(--text-main)' }}>{po.purchaseOrder||'—'}</td>
                    <td style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', fontSize:11, color:'var(--text-main)' }}>{po.lineNumber||'—'}</td>
                    <td style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text-main)' }}>{po.vendorName||'—'}</td>
                    <td style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', whiteSpace:'nowrap', color:'var(--text-main)' }}>{po.voyage||'—'}</td>
                    <td style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', whiteSpace:'nowrap', color: !po.confirmedReceiptDate?'var(--red-dark)':'var(--text-main)' }}>{fmtDate(po.confirmedReceiptDate)||'—'}</td>
                    {j===0 && (
                      <td rowSpan={combos.length} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', maxWidth:160, whiteSpace:'pre-wrap', wordBreak:'break-word', fontSize:11, verticalAlign:'top' }}>
                        {n.note_procurement
                          ? <div style={{ background:'var(--blue-bg)', borderRadius:4, padding:'3px 6px', marginBottom:3 }}><span style={{ fontSize:9, color:'var(--blue-dark)', fontWeight:600 }}>רכש: </span><span style={{ color:'var(--text-main)' }}>{n.note_procurement}</span></div>
                          : '—'}
                      </td>
                    )}
                    {j===0 && (
                      <td rowSpan={combos.length} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border-tbl)', maxWidth:160, whiteSpace:'pre-wrap', wordBreak:'break-word', fontSize:11, verticalAlign:'top' }}>
                        {n.note_tapi
                          ? <div style={{ background:'var(--green-bg)', borderRadius:4, padding:'3px 6px' }}><span style={{ fontSize:9, color:'var(--green-dark)', fontWeight:600 }}>תפ"י: </span><span style={{ color:'var(--text-main)' }}>{n.note_tapi}</span></div>
                          : '—'}
                      </td>
                    )}
                    {j===0 && (
                      <AirStatusCell
                        key={`air-${row.itemNumber}`}
                        itemNumber={row.itemNumber}
                        airStatus={n.air_status || ''}
                        airNote={n.air_note || ''}
                        onSave={saveNote}
                      />
                    )}
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
