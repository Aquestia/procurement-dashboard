import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'

// Badge
export function Badge({ status }) {
  const map = {
    'BO':       { bg: 'var(--red-bg)',    color: 'var(--red-dark)' },
    'בסכנה':    { bg: 'var(--amber-bg)',  color: 'var(--amber-dark)' },
    'תקין':     { bg: 'var(--green-bg)', color: 'var(--green-dark)' },
    'DR4':      { bg: 'var(--purple-bg)', color: 'var(--purple-dark)' },
    'DR5':      { bg: 'var(--purple-bg)', color: 'var(--purple-dark)' },
    'DR4→DR5':  { bg: 'var(--purple-bg)', color: 'var(--purple-dark)' },
    'DR5→DR4':  { bg: 'var(--purple-bg)', color: 'var(--purple-dark)' },
    'PRD':      { bg: 'var(--blue-bg)',   color: 'var(--blue-dark)' },
    'לא ידוע':  { bg: 'var(--bg-neutral)', color: 'var(--text-muted)' },
  }
  const s = map[status] || { bg: 'var(--bg-neutral)', color: 'var(--text-muted)' }
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, padding: '2px 7px',
      borderRadius: 10, fontWeight: 600, background: s.bg, color: s.color,
      whiteSpace: 'nowrap',
    }}>{status}</span>
  )
}

// KPI Card
export function KpiCard({ label, value, sub, color, items, columns }) {
  const [open, setOpen] = useState(false)
  const colorMap = {
    red: 'var(--red-dark)', amber: 'var(--amber-dark)',
    blue: 'var(--blue-dark)', default: 'var(--text-main)'
  }
  return (
    <div style={{
      background: 'var(--bg-neutral)', borderRadius: 8, padding: '10px 12px',
      cursor: items ? 'pointer' : 'default', border: '1px solid var(--border-card)',
      transition: 'background 0.3s',
    }} onClick={() => items && setOpen(o => !o)}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: colorMap[color] || colorMap.default, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 3 }}>{sub}</div>}
      {items && <div style={{ fontSize: 10, color: 'var(--blue)', marginTop: 4 }}>{open ? '▲ סגור' : '▼ הצג רשימה'}</div>}
      {open && items && (
        <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
          <ExpandedTable items={items} columns={columns} label={label} />
        </div>
      )}
    </div>
  )
}

function ExpandedTable({ items, columns, label }) {
  function exportToExcel() {
    const ws = XLSX.utils.json_to_sheet(items.map(row => {
      const obj = {}
      columns.forEach(c => { obj[c.label] = row[c.key] ?? '' })
      return obj
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'נתונים')
    XLSX.writeFile(wb, `${label}.xlsx`)
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button onClick={exportToExcel} style={{
          fontSize: 11, padding: '4px 10px', border: '1px solid var(--blue)',
          borderRadius: 6, background: 'var(--blue)', color: '#fff', cursor: 'pointer',
        }}>ייצוא Excel</button>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.key} style={{
                  background: 'var(--bg-neutral)', padding: '5px 7px', fontWeight: 600,
                  fontSize: 10, color: 'var(--text-sub)', borderBottom: '1px solid var(--border-tbl)',
                  whiteSpace: 'nowrap', textAlign: 'right',
                }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 200).map((row, i) => (
              <tr key={i} style={{ background: row.isBO ? 'var(--red-bg)' : i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-row)' }}>
                {columns.map(c => (
                  <td key={c.key} style={{
                    padding: '4px 7px', borderBottom: '1px solid var(--border-tbl)',
                    color: 'var(--text-main)', whiteSpace: 'nowrap',
                  }}>
                    {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Note cell
export function NoteCell({ value, onChange, placeholder }) {
  const [val, setVal] = useState(value || '')
  const timer = useRef(null)
  function handleChange(e) {
    setVal(e.target.value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(e.target.value), 800)
  }
  return (
    <input value={val} onChange={handleChange} placeholder={placeholder || 'הערה...'}
      style={{
        fontSize: 10, padding: '3px 6px', border: '1px solid var(--border-light)',
        borderRadius: 4, width: 90, background: 'var(--bg-card)', color: 'var(--text-main)',
        outline: 'none', transition: 'background 0.3s',
      }}
    />
  )
}

// Export button
export function ExportButton({ data, columns, filename }) {
  function handleExport() {
    const ws = XLSX.utils.json_to_sheet(data.map(row => {
      const obj = {}
      columns.forEach(c => { obj[c.label] = row[c.key] ?? '' })
      return obj
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'נתונים')
    XLSX.writeFile(wb, filename || 'export.xlsx')
  }
  return (
    <button onClick={handleExport} style={{
      fontSize: 12, padding: '5px 12px', border: '1px solid var(--blue)',
      borderRadius: 6, background: 'transparent', color: 'var(--blue)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 4,
    }}>⬇ ייצוא Excel</button>
  )
}

// Sortable Table
export function SortableTable({ rows, columns, notes, saveNote, rowStyle }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = sortKey ? [...rows].sort((a, b) => {
    const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), 'he')
    return sortDir === 'asc' ? cmp : -cmp
  }) : rows

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} onClick={() => c.sortable !== false && handleSort(c.key)}
                style={{
                  background: 'var(--bg-neutral)', padding: '7px 8px', fontWeight: 600,
                  fontSize: 11, color: 'var(--text-sub)', borderBottom: '1px solid var(--border-tbl)',
                  whiteSpace: 'nowrap', textAlign: 'right',
                  cursor: c.sortable !== false ? 'pointer' : 'default', userSelect: 'none',
                }}>
                {c.label} {sortKey === c.key ? (sortDir === 'asc' ? '↑' : '↓') : c.sortable !== false ? '↕' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} style={rowStyle ? rowStyle(row, i) : {
              background: row.isBO ? 'var(--red-bg)' : i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-row)',
              transition: 'background 0.3s',
            }}>
              {columns.map(c => (
                <td key={c.key} style={{
                  padding: '6px 8px', borderBottom: '1px solid var(--border-tbl)',
                  color: 'var(--text-main)', whiteSpace: 'nowrap',
                  maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {c.render ? c.render(row[c.key], row, notes, saveNote) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 20, color: 'var(--text-hint)', fontSize: 13 }}>אין נתונים</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// Page wrapper
export function PageWrapper({ title, children, topActions }) {
  return (
    <div style={{ padding: 20, minHeight: '100vh', background: 'var(--bg-page)', transition: 'background 0.3s' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-main)', flex: 1 }}>{title}</h1>
        {topActions}
      </div>
      {children}
    </div>
  )
}

// Loading spinner
export function LoadingState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 32 }}>⏳</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>טוען נתונים...</div>
    </div>
  )
}

// Empty state
export function EmptyState({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 40 }}>📭</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{message || 'אין נתונים להצגה'}</div>
      <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>העלה קובץ Excel כדי להתחיל</div>
    </div>
  )
}

// Format date helper
export function fmtDate(d) {
  if (!d) return '—'
  try {
    const s = String(d)
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, y, m, day] = match
      return `${day}/${m}/${y}`
    }
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) return '—'
    return `${String(date.getUTCDate()).padStart(2,'0')}/${String(date.getUTCMonth()+1).padStart(2,'0')}/${date.getUTCFullYear()}`
  } catch { return '—' }
}
