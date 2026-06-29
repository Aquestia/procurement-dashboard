import { useMemo, useState, useRef } from 'react'
import { Badge, fmtDate } from '../components/shared'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const AIR_STATUSES = [
  { value: '',           label: '—',              bg: 'transparent',          color: 'var(--text-muted)',  border: 'var(--border-light)' },
  { value: 'ממתין',      label: '⏳ ממתין',        bg: 'var(--bg-neutral)',     color: 'var(--text-sub)',    border: 'var(--border-light)' },
  { value: 'בתיאום',     label: '📞 בתיאום',       bg: 'var(--amber-bg)',       color: 'var(--amber-dark)',  border: 'var(--yellow-bdr)'   },
  { value: 'הוזמן',      label: '✈ הוזמן',         bg: 'var(--blue-bg)',        color: 'var(--blue-dark)',   border: 'var(--border-blue)'  },
  { value: 'בדרך',       label: '🛫 בדרך',          bg: '#FFF3CD',              color: '#854F0B',            border: '#FFCA2C'              },
  { value: 'הגיע',       label: '✅ הגיע',          bg: 'var(--green-bg)',       color: 'var(--green-dark)',  border: 'var(--green-bdr)'    },
  { value: 'בוטל',       label: '❌ בוטל',          bg: 'var(--red-bg)',         color: 'var(--red-dark)',    border: 'var(--red-border)'   },
]

function AirStatusCell({ itemNumber, initialStatus, initialNote, onSave }) {
  const [status, setStatus] = useState(initialStatus || '')
  const [note, setNote] = useState(initialNote || '')
  const [saving, setSaving] = useState(false)
  const timer = useRef(null)

  const opt = AIR_STATUSES.find(s => s.value === status) || AIR_STATUSES[0]

  async function saveField(field, value) {
    setSaving(true)
    try {
      await onSave(itemNumber, field, value)
    } finally {
      setTimeout(() => setSaving(false), 600)
    }
  }

  function handleStatusChange(e) {
    const v = e.target.value
    setStatus(v)
    saveField('air_status', v)
  }

  function handleNoteChange(e) {
    const v = e.target.value
    setNote(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveField('air_note', v), 800)
  }

  return (
    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', verticalAlign: 'top', minWidth: 280 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* Status dropdown */}
        <select
          value={status}
          onChange={handleStatusChange}
          style={{
            fontSize: 11, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
            border: `1px solid ${opt.border}`,
            background: opt.bg,
            color: opt.color,
            outline: 'none',
            transition: 'all 0.15s',
          }}>
          {AIR_STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label || '— ללא סטטוס'}</option>
          ))}
        </select>
        {/* Note textarea */}
        <textarea
          value={note}
          onChange={handleNoteChange}
          placeholder="הערת הטסה..."
          rows={2}
          style={{
            fontSize: 11, padding: '4px 8px', borderRadius: 5, resize: 'vertical',
            border: note ? '1px solid var(--blue)' : '1px solid var(--border-light)',
            background: note ? 'var(--blue-bg)' : 'var(--bg-card)',
            color: 'var(--text-main)', outline: 'none', direction: 'rtl',
            fontFamily: 'inherit', transition: 'all 0.2s', minHeight: 44,
          }}
        />
        {saving && <span style={{ fontSize: 9, color: 'var(--green-dark)' }}>✓ נשמר</span>}
      </div>
    </td>
  )
}

export default function AirShipment({ data, notes, saveNote, loading }) {
  const [search, setSearch] = useState('')
  const [airNotes, setAirNotes] = useState({}) // local state for air_status / air_note

  const airItems = useMemo(() => {
    if (!data || !notes) return []
    return data
      .filter(r => notes[r.itemNumber]?.treatment_status === 'הטסה')
      .map(r => {
        const n = notes[r.itemNumber] || {}
        return { ...r, note: n }
      })
  }, [data, notes])

  const filtered = useMemo(() => {
    let list = airItems
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(r =>
        r.itemNumber?.toLowerCase().includes(s) ||
        r.productName?.toLowerCase().includes(s) ||
        r.orders?.some(o => o.salesOrder?.toLowerCase().includes(s) || o.customerName?.toLowerCase().includes(s))
      )
    }
    return list
  }, [airItems, search])

  async function handleAirSave(itemNumber, field, value) {
    // Update local state
    setAirNotes(prev => ({
      ...prev,
      [itemNumber]: { ...prev[itemNumber], [field]: value }
    }))
    // Save to procurement_notes via saveNote — reuse the existing field mechanism
    // We piggyback on the 'both' mechanism with a special field
    const existing = notes[itemNumber] || {}
    const existingAir = airNotes[itemNumber] || {}
    const merged = {
      ...existingAir,
      [field]: value,
    }
    // Store in note_procurement as JSON prefix OR use saveNote with custom field
    // Best approach: use supabase directly for air_status / air_note columns
    try {
      const { data: existing_row } = await supabase
        .from('procurement_notes')
        .select('*')
        .eq('item_number', itemNumber)
        .maybeSingle()

      if (existing_row?.id) {
        await supabase.from('procurement_notes').update({ [field]: value }).eq('id', existing_row.id)
      } else {
        await supabase.from('procurement_notes').insert({
          item_number: itemNumber,
          sales_order: '', line_number: '',
          note_procurement: '', note_tapi: '', treatment_status: 'הטסה',
          [field]: value,
        })
      }
    } catch(e) {
      // fallback: encode in note
      console.warn('air save error', e)
    }
  }

  function getAirField(itemNumber, field) {
    return airNotes[itemNumber]?.[field] ?? notes[itemNumber]?.[field] ?? ''
  }

  function buildExcel() {
    const rows = []
    filtered.forEach(r => {
      const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
      const ords = r.orders?.length > 0 ? r.orders : [{}]
      pos.forEach(po => ords.forEach(o => {
        rows.push({
          'מק"ט': r.itemNumber,
          'תיאור פריט': r.productName || '',
          'סטטוס': r.procurementStatus,
          'פק"ע / הזמנה': r.prd || '',
          'הז. מכירה': o.salesOrder || (r.prd?.startsWith('SOIL') ? r.prd : '') || '',
          'לקוח': o.customerName || '',
          'ת. אספקה מאושר': fmtDate(o.confirmedShipDate),
          'נדרש': r.totalQtyRequired,
          'חוסר': r.shortage,
          'הז. רכש': po.purchaseOrder || '',
          'ספק': po.vendorName || '',
          'צפי קבלה': fmtDate(po.confirmedReceiptDate),
          'סטטוס הטסה': getAirField(r.itemNumber, 'air_status'),
          'הערת הטסה': getAirField(r.itemNumber, 'air_note'),
          'הערת רכש': r.note?.note_procurement || '',
          'הערת תפ"י': r.note?.note_tapi || '',
        })
      }))
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'פריטים להטסה')
    XLSX.writeFile(wb, 'פריטים_להטסה.xlsx')
  }

  function buildMessage() {
    const today = new Date().toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric' })
    const itemList = filtered.map(r => {
      const airSt = getAirField(r.itemNumber, 'air_status')
      return `• ${r.itemNumber} — ${r.productName || ''}${airSt ? ` [${airSt}]` : ''}`
    }).join('\n')
    return { today, itemList }
  }

  function handleExportAndWhatsApp() {
    buildExcel()
    const { today, itemList } = buildMessage()
    const text = encodeURIComponent(`✈ *פריטים להטסה — ${today}*\n\n${itemList}\n\nסה"כ ${filtered.length} מק"טים\n_(קובץ Excel מצורף בנפרד)_`)
    setTimeout(() => { window.open(`https://web.whatsapp.com/send?text=${text}`, '_blank') }, 800)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>

  const HEADERS = ['מק"ט','תיאור מוצר','סטטוס','פק"ע / הזמנה','הז. מכירה','שורת מכירה','לקוח','ת. אספקה מאושר','נדרש','נאסף','בהזמנה','זמין','חוסר','הז. רכש','שורת רכש','ספק','מסלול','צפי קבלה','הערת רכש','הערת תפ"י','סטטוס הטסה + הערה']

  return (
    <div style={{ padding: 24, direction: 'rtl' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
            ✈ פריטים להטסה
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            {filtered.length !== airItems.length
              ? `${filtered.length} מתוך ${airItems.length} מק"טים`
              : `${airItems.length} מק"טים מסומנים להטסה`}
          </div>
        </div>
        <div style={{ marginRight: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={buildExcel} style={{
            fontSize: 12, padding: '7px 16px', borderRadius: 7,
            border: '1px solid var(--green-dark)', background: 'var(--green-dark)', color: '#fff',
            cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}>⬇ ייצוא Excel</button>
          <button onClick={handleExportAndWhatsApp} style={{
            fontSize: 12, padding: '7px 16px', borderRadius: 7,
            border: '1px solid #25D366', background: '#25D366', color: '#fff',
            cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}>💬 ייצוא + WhatsApp</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder='חיפוש מק"ט / תיאור / לקוח...'
          style={{ flex: 1, fontSize: 12, padding: '6px 10px', border: '1px solid var(--border-light)', borderRadius: 6, background: 'var(--bg-row)', color: 'var(--text-main)', direction: 'rtl', outline: 'none' }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border-light)', borderRadius: 6, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>✕ נקה</button>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {AIR_STATUSES.filter(s => s.value).map(s => (
          <span key={s.value} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
            {s.label}
          </span>
        ))}
      </div>

      {/* Empty */}
      {airItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-hint)', fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✈</div>
          אין מק"טים מסומנים להטסה כרגע
          <div style={{ fontSize: 12, marginTop: 8 }}>סמן פריטים כ"הטסה" במבט רכש או מבט תפ"י</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-hint)', fontSize: 13 }}>לא נמצאו תוצאות לחיפוש</div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 10, overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
          <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--blue-bg)', position: 'sticky', top: 0, zIndex: 10 }}>
                {HEADERS.map(h => (
                  <th key={h} style={{ padding: '7px 10px', fontWeight: 600, fontSize: 10, color: 'var(--blue-dark)', borderBottom: '1px solid var(--border-blue)', textAlign: 'right', whiteSpace: 'nowrap', background: 'var(--blue-bg)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.flatMap((row, i) => {
                const pos = row.purchaseOrders?.length > 0 ? row.purchaseOrders : [{}]
                const ords = row.orders?.length > 0 ? row.orders : [{}]
                const combos = []
                pos.forEach(po => ords.forEach(o => combos.push({ po, o })))
                const n = row.note || {}

                return combos.map(({ po, o }, j) => (
                  <tr key={`${i}-${j}`} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-row-alt)', verticalAlign: 'top' }}>
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'middle', color: 'var(--blue-dark)' }}>{row.itemNumber}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', color: 'var(--text-main)' }}>{row.productName || '—'}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', verticalAlign: 'middle' }}><Badge status={row.procurementStatus} /></td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', fontSize: 10, color: 'var(--text-sub)', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{row.prd || '—'}</td>}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-main)' }}>{o.salesOrder || (row.prd?.startsWith('SOIL') ? row.prd : '—')}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', fontSize: 11, color: 'var(--text-main)' }}>{o.lineNumber || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>{o.customerName || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', whiteSpace: 'nowrap', color: o.confirmedShipDate ? 'var(--text-main)' : 'var(--text-hint)' }}>{fmtDate(o.confirmedShipDate) || '—'}</td>
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', fontWeight: 600, verticalAlign: 'middle', color: 'var(--text-main)' }}>{row.totalQtyRequired}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', verticalAlign: 'middle', color: 'var(--text-main)' }}>{row.totalQtyPicked}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', verticalAlign: 'middle', color: 'var(--text-main)' }}>{row.totalOnOrder}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', verticalAlign: 'middle', color: 'var(--text-main)' }}>{row.totalAvailable}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', fontWeight: 600, color: row.shortage > 0 ? 'var(--red-dark)' : 'var(--green-dark)', verticalAlign: 'middle' }}>{row.shortage}</td>}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-main)' }}>{po.purchaseOrder || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', fontSize: 11, color: 'var(--text-main)' }}>{po.lineNumber || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>{po.vendorName || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>{po.voyage || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', whiteSpace: 'nowrap', color: !po.confirmedReceiptDate ? 'var(--red-dark)' : 'var(--text-main)' }}>{fmtDate(po.confirmedReceiptDate) || '—'}</td>
                    {j === 0 && (
                      <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', maxWidth: 160, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, verticalAlign: 'top' }}>
                        {n.note_procurement ? (
                          <div style={{ background: 'var(--blue-bg)', borderRadius: 4, padding: '3px 6px', marginBottom: 3 }}>
                            <span style={{ fontSize: 9, color: 'var(--blue-dark)', fontWeight: 600 }}>רכש: </span>
                            <span style={{ color: 'var(--text-main)' }}>{n.note_procurement}</span>
                          </div>
                        ) : '—'}
                      </td>
                    )}
                    {j === 0 && (
                      <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-tbl)', maxWidth: 160, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, verticalAlign: 'top' }}>
                        {n.note_tapi ? (
                          <div style={{ background: 'var(--green-bg)', borderRadius: 4, padding: '3px 6px' }}>
                            <span style={{ fontSize: 9, color: 'var(--green-dark)', fontWeight: 600 }}>תפ"י: </span>
                            <span style={{ color: 'var(--text-main)' }}>{n.note_tapi}</span>
                          </div>
                        ) : '—'}
                      </td>
                    )}
                    {j === 0 && (
                      <AirStatusCell
                        key={row.itemNumber}
                        itemNumber={row.itemNumber}
                        initialStatus={getAirField(row.itemNumber, 'air_status')}
                        initialNote={getAirField(row.itemNumber, 'air_note')}
                        onSave={handleAirSave}
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
