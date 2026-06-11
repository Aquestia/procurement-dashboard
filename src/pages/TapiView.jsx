import { useState, useMemo } from 'react'
import { Badge, NoteCell, ExportButton, SortableTable, PageWrapper, LoadingState, EmptyState, fmtDate } from '../components/shared'
import { MONTHS_HE } from '../lib/constants'

export default function TapiView({ data, notes, saveNote, loading }) {
  const [confirmedMonth, setConfirmedMonth] = useState(null)
  const [requestedMonth, setRequestedMonth] = useState(null)
  const [boFilter, setBoFilter] = useState('הכל')
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('הכל')
  const [confirmedFrom, setConfirmedFrom] = useState('')
  const [confirmedTo, setConfirmedTo] = useState('')
  const [requestedFrom, setRequestedFrom] = useState('')
  const [requestedTo, setRequestedTo] = useState('')
  const [confirmedRangeActive, setConfirmedRangeActive] = useState(false)
  const [requestedRangeActive, setRequestedRangeActive] = useState(false)

  if (loading) return <LoadingState />
  if (!data || data.length === 0) return <EmptyState />

  // Get available months
  const confirmedMonths = useMemo(() => {
    const s = new Set()
    data.forEach(r => {
      if (r.confirmedShipDate) {
        const d = new Date(r.confirmedShipDate)
        if (!isNaN(d)) s.add(`${d.getMonth() + 1}-${d.getFullYear()}`)
      }
    })
    return [...s].map(k => {
      const [m, y] = k.split('-')
      return { key: k, label: `${MONTHS_HE[+m]} ${y.slice(2)}`, month: +m, year: +y }
    }).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
  }, [data])

  const requestedMonths = useMemo(() => {
    const s = new Set()
    data.forEach(r => {
      if (r.requestedShipDate) {
        const d = new Date(r.requestedShipDate)
        if (!isNaN(d)) s.add(`${d.getMonth() + 1}-${d.getFullYear()}`)
      }
    })
    return [...s].map(k => {
      const [m, y] = k.split('-')
      return { key: k, label: `${MONTHS_HE[+m]} ${y.slice(2)}`, month: +m, year: +y }
    }).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
  }, [data])

  const filtered = useMemo(() => {
    return data.filter(r => {
      // BO filter
      if (boFilter === 'BO בלבד' && !r.isBO) return false
      if (boFilter === 'לא BO' && r.isBO) return false

      // Stage filter
      if (filterStage !== 'הכל' && !r.stage?.includes(filterStage)) return false

      // Confirmed month button
      if (confirmedMonth && !confirmedRangeActive) {
        const [m, y] = confirmedMonth.split('-')
        if (r.confirmedShipDate) {
          const d = new Date(r.confirmedShipDate)
          if (d.getMonth() + 1 !== +m || d.getFullYear() !== +y) return false
        } else return false
      }

      // Requested month button
      if (requestedMonth && !requestedRangeActive) {
        const [m, y] = requestedMonth.split('-')
        if (r.requestedShipDate) {
          const d = new Date(r.requestedShipDate)
          if (d.getMonth() + 1 !== +m || d.getFullYear() !== +y) return false
        } else return false
      }

      // Confirmed date range
      if (confirmedRangeActive && confirmedFrom && confirmedTo) {
        if (!r.confirmedShipDate) return false
        const d = new Date(r.confirmedShipDate)
        if (d < new Date(confirmedFrom) || d > new Date(confirmedTo)) return false
      }

      // Requested date range
      if (requestedRangeActive && requestedFrom && requestedTo) {
        if (!r.requestedShipDate) return false
        const d = new Date(r.requestedShipDate)
        if (d < new Date(requestedFrom) || d > new Date(requestedTo)) return false
      }

      // Search
      if (search) {
        const s = search.toLowerCase()
        return r.itemNumber?.toLowerCase().includes(s) ||
          r.salesOrder?.toLowerCase().includes(s) ||
          r.customerName?.toLowerCase().includes(s)
      }
      return true
    })
  }, [data, boFilter, filterStage, confirmedMonth, requestedMonth, confirmedRangeActive, requestedRangeActive, confirmedFrom, confirmedTo, requestedFrom, requestedTo, search])

  const COLUMNS = [
    { key: 'itemNumber', label: 'מק"ט' },
    { key: 'salesOrder', label: 'הזמנה' },
    { key: 'lineNumber', label: 'שורה' },
    { key: 'procurementStatus', label: 'סטטוס', render: v => <Badge status={v} /> },
    { key: 'customerName', label: 'לקוח' },
    { key: 'confirmedShipDate', label: 'ת. מאושר', render: v => fmtDate(v) },
    { key: 'requestedShipDate', label: 'ת. מבוקש', render: v => fmtDate(v) },
    { key: 'stage', label: 'שלב', render: v => <Badge status={v} /> },
    { key: 'qtyRequired', label: 'נדרש' },
    { key: 'poQtyOrdered', label: 'הוזמן' },
    { key: 'confirmedReceiptDate', label: 'צפי קבלה', render: v => fmtDate(v) },
    {
      key: 'note_procurement', label: 'הערת רכש', sortable: false,
      render: (_, row, notes, saveNote) => {
        const key = `${row.itemNumber}__${row.salesOrder}__${row.lineNumber}`
        return <NoteCell value={notes[key]?.note_procurement || ''} onChange={v => saveNote(row.itemNumber, row.salesOrder, row.lineNumber, 'note_procurement', v)} placeholder='הערת רכש...' />
      }
    },
    {
      key: 'note_tapi', label: 'הערת תפ"י', sortable: false,
      render: (_, row, notes, saveNote) => {
        const key = `${row.itemNumber}__${row.salesOrder}__${row.lineNumber}`
        return <NoteCell value={notes[key]?.note_tapi || ''} onChange={v => saveNote(row.itemNumber, row.salesOrder, row.lineNumber, 'note_tapi', v)} placeholder='הערת תפ"י...' />
      }
    },
  ]

  return (
    <PageWrapper title='מבט תפ"י' topActions={
      <ExportButton data={filtered} columns={COLUMNS.map(c => ({ key: c.key, label: c.label }))} filename='מבט_תפי.xlsx' />
    }>
      {/* Confirmed month row */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
          📅 תאריך מאושר — בחירת חודש
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {confirmedMonths.map(m => (
            <MonthBtn key={m.key} label={m.label} active={confirmedMonth === m.key && !confirmedRangeActive}
              onClick={() => { setConfirmedMonth(confirmedMonth === m.key ? null : m.key); setConfirmedRangeActive(false) }} />
          ))}
        </div>
      </div>

      {/* Requested month row */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
          📆 תאריך מבוקש — בחירת חודש
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {requestedMonths.map(m => (
            <MonthBtn key={m.key} label={m.label} active={requestedMonth === m.key && !requestedRangeActive}
              onClick={() => { setRequestedMonth(requestedMonth === m.key ? null : m.key); setRequestedRangeActive(false) }} />
          ))}
        </div>
      </div>

      {/* Date ranges */}
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
        <DateRange
          label='📅 מאושר מ:'
          from={confirmedFrom} to={confirmedTo}
          onFrom={setConfirmedFrom} onTo={setConfirmedTo}
          onApply={() => { setConfirmedRangeActive(true); setConfirmedMonth(null) }}
          onClear={() => { setConfirmedRangeActive(false); setConfirmedFrom(''); setConfirmedTo('') }}
          active={confirmedRangeActive}
        />
        <div style={{ height: 8 }} />
        <DateRange
          label='📆 מבוקש מ:'
          from={requestedFrom} to={requestedTo}
          onFrom={setRequestedFrom} onTo={setRequestedTo}
          onApply={() => { setRequestedRangeActive(true); setRequestedMonth(null) }}
          onClear={() => { setRequestedRangeActive(false); setRequestedFrom(''); setRequestedTo('') }}
          active={requestedRangeActive}
        />
      </div>

      {/* BO toggle + filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', border: '0.5px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
          {['הכל', 'לא BO', 'BO בלבד'].map(opt => (
            <button key={opt} onClick={() => setBoFilter(opt)} style={{
              fontSize: 12, padding: '5px 12px', border: 'none', cursor: 'pointer',
              background: boFilter === opt ? (opt === 'BO בלבד' ? '#E24B4A' : '#378ADD') : 'transparent',
              color: boFilter === opt ? '#fff' : '#555',
            }}>{opt}</button>
          ))}
        </div>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          style={{ fontSize: 12, padding: '5px 8px', border: '0.5px solid #ddd', borderRadius: 6, background: '#fff', color: '#1a1a1a' }}>
          {['הכל', 'PRD', 'DR4', 'DR5'].map(o => <option key={o}>{o}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder='חיפוש מק"ט / לקוח...'
          style={{ fontSize: 12, padding: '5px 10px', border: '0.5px solid #ddd', borderRadius: 6, width: 180, background: '#fff', color: '#1a1a1a' }} />
        <span style={{ fontSize: 11, color: '#999', marginRight: 'auto' }}>{filtered.length} שורות</span>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, overflow: 'hidden' }}>
        <SortableTable rows={filtered} columns={COLUMNS} notes={notes} saveNote={saveNote} />
      </div>
    </PageWrapper>
  )
}

function MonthBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, padding: '4px 11px', border: `0.5px solid ${active ? '#378ADD' : '#ddd'}`,
      borderRadius: 14, background: active ? '#378ADD' : 'transparent',
      color: active ? '#fff' : '#555', cursor: 'pointer',
    }}>{label}</button>
  )
}

function DateRange({ label, from, to, onFrom, onTo, onApply, onClear, active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>{label}</span>
      <input type='date' value={from} onChange={e => onFrom(e.target.value)}
        style={{ fontSize: 11, padding: '3px 6px', border: '0.5px solid #ddd', borderRadius: 5, background: '#fff', color: '#1a1a1a' }} />
      <span style={{ fontSize: 11, color: '#888' }}>עד:</span>
      <input type='date' value={to} onChange={e => onTo(e.target.value)}
        style={{ fontSize: 11, padding: '3px 6px', border: '0.5px solid #ddd', borderRadius: 5, background: '#fff', color: '#1a1a1a' }} />
      <button onClick={onApply} style={{
        fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '0.5px solid #378ADD',
        background: active ? '#378ADD' : 'transparent', color: active ? '#fff' : '#378ADD', cursor: 'pointer'
      }}>החל</button>
      {active && <button onClick={onClear} style={{
        fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '0.5px solid #ddd',
        background: 'transparent', color: '#888', cursor: 'pointer'
      }}>נקה</button>}
    </div>
  )
}
