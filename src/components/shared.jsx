import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'

// Badge
export function Badge({ status }) {
  const map = {
    'BO': { bg: '#FCEBEB', color: '#A32D2D' },
    'בסכנה': { bg: '#FAEEDA', color: '#854F0B' },
    'תקין': { bg: '#EAF3DE', color: '#3B6D11' },
    'DR4': { bg: '#EEEDFE', color: '#3C3489' },
    'DR5': { bg: '#EEEDFE', color: '#3C3489' },
    'DR4→DR5': { bg: '#EEEDFE', color: '#3C3489' },
    'DR5→DR4': { bg: '#EEEDFE', color: '#3C3489' },
    'PRD': { bg: '#E6F1FB', color: '#185FA5' },
    'לא ידוע': { bg: '#F1EFE8', color: '#5F5E5A' },
  }
  const s = map[status] || { bg: '#F1EFE8', color: '#5F5E5A' }
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, padding: '2px 7px',
      borderRadius: 10, fontWeight: 600, background: s.bg, color: s.color,
      whiteSpace: 'nowrap',
    }}>{status}</span>
  )
}

// KPI Card with expandable list
export function KpiCard({ label, value, sub, color, items, columns }) {
  const [open, setOpen] = useState(false)
  const colorMap = {
    red: '#A32D2D', amber: '#854F0B', blue: '#185FA5', default: '#1a1a1a'
  }

  return (
    <div style={{ background: '#f4f4f0', borderRadius: 8, padding: '10px 12px', cursor: items ? 'pointer' : 'default' }}
      onClick={() => items && setOpen(o => !o)}>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: colorMap[color] || colorMap.default, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#999', marginTop: 3 }}>{sub}</div>}
      {items && <div style={{ fontSize: 10, color: '#378ADD', marginTop: 4 }}>{open ? '▲ סגור' : '▼ הצג רשימה'}</div>}

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
          fontSize: 11, padding: '4px 10px', border: '0.5px solid #378ADD',
          borderRadius: 6, background: '#378ADD', color: '#fff', cursor: 'pointer'
        }}>ייצוא Excel</button>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.key} style={{ background: '#f0f0ec', padding: '5px 7px', fontWeight: 600, fontSize: 10, color: '#555', borderBottom: '0.5px solid #e0e0da', whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 200).map((row, i) => (
              <tr key={i} style={{ background: row.isBO ? '#FCEBEB18' : i % 2 === 0 ? '#fff' : '#fafaf8' }}>
                {columns.map(c => (
                  <td key={c.key} style={{ padding: '4px 7px', borderBottom: '0.5px solid #f0f0ea', color: '#1a1a1a', whiteSpace: 'nowrap' }}>
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

// Note cell with auto-save
export function NoteCell({ value, onChange, placeholder }) {
  const [val, setVal] = useState(value || '')
  const timer = useRef(null)

  function handleChange(e) {
    setVal(e.target.value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(e.target.value), 800)
  }

  return (
    <input
      value={val}
      onChange={handleChange}
      placeholder={placeholder || 'הערה...'}
      style={{
        fontSize: 10, padding: '3px 6px', border: '0.5px solid #ddd',
        borderRadius: 4, width: 90, background: '#fff', color: '#1a1a1a',
        outline: 'none',
      }}
    />
  )
}

// Export to Excel button
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
      fontSize: 12, padding: '5px 12px', border: '0.5px solid #378ADD',
      borderRadius: 6, background: 'transparent', color: '#378ADD', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 4
    }}>
      ⬇ ייצוא Excel
    </button>
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
    const av = a[sortKey] ?? ''
    const bv = b[sortKey] ?? ''
    const cmp = String(av).localeCompare(String(bv), 'he')
    return sortDir === 'asc' ? cmp : -cmp
  }) : rows

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key}
                onClick={() => c.sortable !== false && handleSort(c.key)}
                style={{
                  background: '#f4f4f0', padding: '7px 8px', fontWeight: 600,
                  fontSize: 11, color: '#555', borderBottom: '0.5px solid #e0e0da',
                  whiteSpace: 'nowrap', textAlign: 'right', cursor: c.sortable !== false ? 'pointer' : 'default',
                  userSelect: 'none',
                }}>
                {c.label} {sortKey === c.key ? (sortDir === 'asc' ? '↑' : '↓') : c.sortable !== false ? '↕' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} style={rowStyle ? rowStyle(row, i) : { background: row.isBO ? '#FCEBEB18' : i % 2 === 0 ? '#fff' : '#fafaf8' }}>
              {columns.map(c => (
                <td key={c.key} style={{ padding: '6px 8px', borderBottom: '0.5px solid #f0f0ea', color: '#1a1a1a', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.render ? c.render(row[c.key], row, notes, saveNote) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 20, color: '#aaa', fontSize: 13 }}>אין נתונים</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// Page wrapper
export function PageWrapper({ title, children, topActions }) {
  return (
    <div style={{ padding: 20, minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', flex: 1 }}>{title}</h1>
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
      <div style={{ fontSize: 14, color: '#888' }}>טוען נתונים...</div>
    </div>
  )
}

// Empty state
export function EmptyState({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 40 }}>📭</div>
      <div style={{ fontSize: 14, color: '#888' }}>{message || 'אין נתונים להצגה'}</div>
      <div style={{ fontSize: 12, color: '#aaa' }}>העלה קובץ Excel כדי להתחיל</div>
    </div>
  )
}

// Format date helper
export function fmtDate(d) {
  if (!d) return '—'
  try {
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('he-IL')
  } catch { return '—' }
}
