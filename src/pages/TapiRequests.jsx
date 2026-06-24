import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const REQUESTERS = [
  'דליה כוהן',
  'נטע שוחט אילוז',
  'עופרית ברנע',
  'טלי קדוש',
  'נתנאל סיידה',
  'מגי רוזנברג',
  'דורית הדרי',
  'מעוז מזור',
  'יניב חגי',
]

const STATUS_OPTIONS = [
  { value: '—',       label: '—',       color: '#888',    bg: '#f0f0ea' },
  { value: 'בטיפול', label: 'בטיפול',  color: '#854F0B', bg: '#FAEEDA' },
  { value: 'טופל',   label: 'טופל',    color: '#3B6D11', bg: '#EAF3DE' },
  { value: 'בוטל',   label: 'בוטל',    color: '#A32D2D', bg: '#FCEBEB' },
]

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric' }) +
    ' ' + d.toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' })
}

export default function TapiRequests() {
  const [requests, setRequests]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [nextId, setNextId]       = useState('')

  // ── Filters ──────────────────────────────────────────────────────
  const [filterRequester, setFilterRequester] = useState('הכל')
  const [filterStatus,    setFilterStatus]    = useState('הכל')
  const [dateFrom,        setDateFrom]        = useState('')
  const [dateTo,          setDateTo]          = useState('')

  useEffect(() => { loadRequests() }, [])

  async function loadRequests() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('tapi_requests')
        .select('*')
        .order('created_at', { ascending: false })
      setRequests(data || [])
      calcNextId(data || [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  function calcNextId(list) {
    const nums = list.map(r => {
      const m = r.request_id?.match(/request_(\d+)/)
      return m ? parseInt(m[1], 10) : 0
    })
    const next = Math.max(...nums, 0) + 1
    setNextId(`request_${String(next).padStart(2, '0')}`)
  }

  async function updateStatus(id, status) {
    try {
      await supabase.from('tapi_requests').update({ status }).eq('id', id)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    } catch (err) { console.error(err) }
  }

  async function handleSave(requester, text) {
    try {
      const { data: all } = await supabase.from('tapi_requests').select('request_id')
      const nums = (all || []).map(r => {
        const m = r.request_id?.match(/request_(\d+)/)
        return m ? parseInt(m[1], 10) : 0
      })
      const next = Math.max(...nums, 0) + 1
      const newId = `request_${String(next).padStart(2, '0')}`
      const now = new Date().toISOString()
      const { data: inserted } = await supabase.from('tapi_requests').insert({
        request_id: newId, requester, body: text, status: '—', created_at: now,
      }).select().single()
      if (inserted) {
        const updated = [inserted, ...requests]
        setRequests(updated)
        calcNextId(updated)
      }
    } catch (err) { console.error(err) }
    setShowModal(false)
  }

  // ── Filtered list ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return requests.filter(r => {
      if (filterRequester !== 'הכל' && r.requester !== filterRequester) return false
      if (filterStatus !== 'הכל' && (r.status || '—') !== filterStatus) return false
      if (dateFrom) {
        const d = new Date(r.created_at)
        d.setHours(0,0,0,0)
        const from = new Date(dateFrom)
        if (d < from) return false
      }
      if (dateTo) {
        const d = new Date(r.created_at)
        d.setHours(23,59,59,999)
        const to = new Date(dateTo)
        to.setHours(23,59,59,999)
        if (d > to) return false
      }
      return true
    })
  }, [requests, filterRequester, filterStatus, dateFrom, dateTo])

  const hasFilters = filterRequester !== 'הכל' || filterStatus !== 'הכל' || dateFrom || dateTo

  function clearFilters() {
    setFilterRequester('הכל')
    setFilterStatus('הכל')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <div style={{ padding: 24, direction: 'rtl' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>בקשות רכש תפ"י</h1>
          <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
            {filtered.length !== requests.length
              ? `${filtered.length} מתוך ${requests.length} בקשות`
              : `${requests.length} בקשות סה"כ`}
          </div>
        </div>
        <button onClick={() => setShowModal(true)} style={{
          marginRight: 'auto', fontSize: 13, fontWeight: 600,
          padding: '9px 20px', borderRadius: 8, border: 'none',
          background: '#378ADD', color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>＋ פתיחת בקשה</button>
      </div>

      {/* ── Filter bar ── */}
      <div style={{
        background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10,
        padding: '12px 16px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        {/* מבקש */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>מבקש</label>
          <select value={filterRequester} onChange={e => setFilterRequester(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '0.5px solid #ddd', background: '#fafaf8', cursor: 'pointer', minWidth: 130 }}>
            <option value="הכל">הכל</option>
            {REQUESTERS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* סטטוס */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>סטטוס</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '0.5px solid #ddd', background: '#fafaf8', cursor: 'pointer', minWidth: 100 }}>
            <option value="הכל">הכל</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* תאריך מ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>מתאריך</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '0.5px solid #ddd', background: '#fafaf8', cursor: 'pointer' }} />
        </div>

        {/* תאריך עד */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>עד תאריך</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '0.5px solid #ddd', background: '#fafaf8', cursor: 'pointer' }} />
        </div>

        {/* נקה סינון */}
        {hasFilters && (
          <button onClick={clearFilters} style={{
            alignSelf: 'flex-end', fontSize: 11, padding: '5px 12px',
            borderRadius: 6, border: '0.5px solid #ddd', background: 'transparent',
            color: '#888', cursor: 'pointer', marginBottom: 1,
          }}>✕ נקה סינון</button>
        )}

        {/* Summary chips */}
        {hasFilters && (
          <div style={{ marginRight: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', alignSelf: 'flex-end', marginBottom: 1 }}>
            {STATUS_OPTIONS.filter(s => s.value !== '—').map(s => {
              const cnt = filtered.filter(r => (r.status || '—') === s.value).length
              if (cnt === 0) return null
              return (
                <span key={s.value} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.color, fontWeight: 600 }}>
                  {s.label}: {cnt}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>טוען...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 60, fontSize: 14 }}>
          {requests.length === 0 ? 'אין בקשות עדיין — לחץ על "פתיחת בקשה" להתחיל' : 'לא נמצאו בקשות התואמות את הסינון'}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f4f4f0' }}>
                {['מס׳ בקשה','תאריך פתיחה','מבקש','תוכן הבקשה','סטטוס'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', fontWeight: 600, fontSize: 11,
                    color: '#555', borderBottom: '0.5px solid #e0e0da',
                    textAlign: 'right', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafaf8', verticalAlign: 'top' }}>
                  {/* מס' בקשה */}
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid #f0f0ea', whiteSpace: 'nowrap' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                      background: '#E6F1FB', color: '#185FA5', padding: '2px 8px', borderRadius: 5,
                    }}>{r.request_id}</span>
                  </td>
                  {/* תאריך */}
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid #f0f0ea', whiteSpace: 'nowrap', color: '#555', fontSize: 11 }}>
                    {fmtDateTime(r.created_at)}
                  </td>
                  {/* מבקש */}
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid #f0f0ea', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {r.requester}
                  </td>
                  {/* תוכן */}
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid #f0f0ea', maxWidth: 500, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {r.body}
                  </td>
                  {/* סטטוס */}
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid #f0f0ea', whiteSpace: 'nowrap' }}>
                    <StatusSelect value={r.status || '—'} onChange={val => updateStatus(r.id, val)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <RequestModal onSave={handleSave} onClose={() => setShowModal(false)} nextId={nextId} />
      )}
    </div>
  )
}

// ── Status Select ─────────────────────────────────────────────────
function StatusSelect({ value, onChange }) {
  const st = STATUS_OPTIONS.find(s => s.value === value) || STATUS_OPTIONS[0]
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        fontSize: 11, fontWeight: 600, padding: '3px 8px',
        borderRadius: 6, border: `1px solid ${st.color}60`,
        background: st.bg, color: st.color, cursor: 'pointer', outline: 'none',
      }}>
      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  )
}

// ── Request Modal ─────────────────────────────────────────────────
function RequestModal({ onSave, onClose, nextId }) {
  const [requester,    setRequester]    = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [text,         setText]         = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const dropdownRef  = useRef(null)
  const textareaRef  = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleSave() {
    if (!requester) { setError('יש לבחור שם מבקש הבקשה לפני השמירה'); return }
    if (!text.trim()) { setError('יש להזין תוכן לבקשה'); return }
    setSaving(true)
    await onSave(requester, text.trim())
    setSaving(false)
  }

  function insertFormat(prefix, suffix) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart, end = el.selectionEnd
    const newVal = text.slice(0, start) + prefix + text.slice(start, end) + suffix + text.slice(end)
    setText(newVal)
    setTimeout(() => { el.focus(); el.setSelectionRange(start + prefix.length, end + prefix.length) }, 0)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 620, maxHeight: '90vh', overflow: 'auto', direction: 'rtl', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>פתיחת בקשה חדשה</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2, fontFamily: 'monospace' }}>{nextId}</div>
          </div>
          <button onClick={onClose} style={{ marginRight: 'auto', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        {/* Requester */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#185FA5', marginBottom: 8 }}>בחר שם מבקש הבקשה *</div>
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button onClick={() => setDropdownOpen(o => !o)} style={{
              width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 13,
              border: `1.5px solid ${requester ? '#378ADD' : error && !requester ? '#E24B4A' : '#ddd'}`,
              background: requester ? '#E6F1FB' : '#fafaf8',
              color: requester ? '#185FA5' : '#aaa', fontWeight: requester ? 600 : 400,
              cursor: 'pointer', textAlign: 'right',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{requester || 'בחר שם...'}</span>
              <span style={{ fontSize: 10, color: '#888' }}>{dropdownOpen ? '▲' : '▼'}</span>
            </button>
            {dropdownOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 10,
                background: '#fff', border: '1px solid #e0e0da', borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: 4,
              }}>
                {REQUESTERS.map(name => (
                  <button key={name}
                    onClick={() => { setRequester(name); setDropdownOpen(false); setError('') }}
                    style={{
                      width: '100%', padding: '10px 14px', border: 'none',
                      background: requester === name ? '#E6F1FB' : 'transparent',
                      color: requester === name ? '#185FA5' : '#1a1a1a',
                      fontWeight: requester === name ? 600 : 400,
                      fontSize: 13, cursor: 'pointer', textAlign: 'right',
                      borderBottom: '0.5px solid #f0f0ea',
                    }}>{name}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Text area */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#378ADD' }}>תוכן הבקשה *</span>
            <div style={{ display: 'flex', gap: 4, marginRight: 'auto' }}>
              {[
                { label:'B', title:'מודגש',     prefix:'**', suffix:'**', style:{ fontWeight:700 } },
                { label:'I', title:'נטוי',      prefix:'_',  suffix:'_',  style:{ fontStyle:'italic' } },
                { label:'U', title:'קו תחתי',   prefix:'__', suffix:'__', style:{ textDecoration:'underline' } },
              ].map(btn => (
                <button key={btn.label} title={btn.title} onClick={() => insertFormat(btn.prefix, btn.suffix)}
                  style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer', ...btn.style }}>
                  {btn.label}
                </button>
              ))}
              <button title='רשימה' onClick={() => { setText(t => t + (t && !t.endsWith('\n') ? '\n• ' : '• ')); setTimeout(() => textareaRef.current?.focus(), 0) }}
                style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer' }}>•</button>
              <button title='מספור' onClick={() => { setText(t => t + (t && !t.endsWith('\n') ? '\n1. ' : '1. ')); setTimeout(() => textareaRef.current?.focus(), 0) }}
                style={{ fontSize:12, width:24, height:24, border:'0.5px solid #ddd', borderRadius:4, background:'#f4f4f0', cursor:'pointer' }}>1.</button>
            </div>
          </div>
          <textarea ref={textareaRef} value={text} onChange={e => { setText(e.target.value); setError('') }}
            placeholder='כתוב את תוכן הבקשה כאן...'
            style={{
              width:'100%', height:180, fontSize:13, padding:'12px 14px',
              border:`1px solid ${error && !text.trim() ? '#E24B4A' : '#378ADD'}40`,
              borderRadius:8, resize:'vertical', background:'#fafaf8',
              color:'#1a1a1a', lineHeight:1.7, fontFamily:'inherit',
              direction:'rtl', textAlign:'right', outline:'none', boxSizing:'border-box',
            }} />
        </div>

        {error && (
          <div style={{ marginBottom:14, padding:'8px 12px', background:'#FCEBEB', border:'1px solid #F09595', borderRadius:7, fontSize:12, color:'#A32D2D', fontWeight:600 }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display:'flex', gap:8, justifyContent:'flex-start' }}>
          <button onClick={handleSave} disabled={saving} style={{
            fontSize:13, padding:'9px 22px', borderRadius:7, border:'none',
            background: saving ? '#aaa' : '#378ADD', color:'#fff', cursor: saving ? 'default' : 'pointer', fontWeight:600,
          }}>{saving ? 'שומר...' : '💾 שמור בקשה'}</button>
          <button onClick={onClose} style={{
            fontSize:13, padding:'9px 16px', borderRadius:7,
            border:'0.5px solid #ddd', background:'transparent', color:'#555', cursor:'pointer',
          }}>ביטול</button>
        </div>
      </div>
    </div>
  )
}
