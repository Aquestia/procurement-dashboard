import { useState, useMemo } from 'react'
import { Badge, NoteCell, ExportButton, SortableTable, PageWrapper, LoadingState, EmptyState, fmtDate } from '../components/shared'

export default function ProcurementView({ data, notes, saveNote, loading }) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('הכל')
  const [filterStage, setFilterStage] = useState('הכל')
  const [filterVendor, setFilterVendor] = useState('הכל')

  if (loading) return <LoadingState />
  if (!data || data.length === 0) return <EmptyState />

  const vendors = useMemo(() => {
    const s = new Set(data.map(r => r.vendorName).filter(Boolean))
    return ['הכל', ...s]
  }, [data])

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (filterStatus !== 'הכל' && r.procurementStatus !== filterStatus) return false
      if (filterStage !== 'הכל' && !r.stage?.includes(filterStage.replace('הכל', ''))) return false
      if (filterVendor !== 'הכל' && r.vendorName !== filterVendor) return false
      if (search) {
        const s = search.toLowerCase()
        return (r.itemNumber?.toLowerCase().includes(s) ||
          r.salesOrder?.toLowerCase().includes(s) ||
          r.customerName?.toLowerCase().includes(s))
      }
      return true
    })
  }, [data, search, filterStatus, filterStage, filterVendor])

  const COLUMNS = [
    { key: 'itemNumber', label: 'מק"ט' },
    { key: 'salesOrder', label: 'הזמנה' },
    { key: 'lineNumber', label: 'שורה' },
    { key: 'procurementStatus', label: 'סטטוס', render: v => <Badge status={v} /> },
    { key: 'customerName', label: 'לקוח' },
    { key: 'qtyRequired', label: 'נדרש' },
    { key: 'poQtyOrdered', label: 'הוזמן' },
    { key: 'stage', label: 'שלב', render: v => <Badge status={v} /> },
    { key: 'vendorName', label: 'ספק' },
    { key: 'confirmedReceiptDate', label: 'צפי קבלה', render: v => fmtDate(v) },
    {
      key: 'note_procurement', label: 'הערת רכש', sortable: false,
      render: (_, row, notes, saveNote) => {
        const key = `${row.itemNumber}__${row.salesOrder}__${row.lineNumber}`
        return <NoteCell
          value={notes[key]?.note_procurement || ''}
          onChange={v => saveNote(row.itemNumber, row.salesOrder, row.lineNumber, 'note_procurement', v)}
          placeholder='הערת רכש...'
        />
      }
    },
    {
      key: 'note_tapi', label: 'הערת תפ"י', sortable: false,
      render: (_, row, notes, saveNote) => {
        const key = `${row.itemNumber}__${row.salesOrder}__${row.lineNumber}`
        return <NoteCell
          value={notes[key]?.note_tapi || ''}
          onChange={v => saveNote(row.itemNumber, row.salesOrder, row.lineNumber, 'note_tapi', v)}
          placeholder='הערת תפ"י...'
        />
      }
    },
  ]

  return (
    <PageWrapper
      title='מבט רכש'
      topActions={
        <ExportButton
          data={filtered.map(r => {
            const key = `${r.itemNumber}__${r.salesOrder}__${r.lineNumber}`
            return { ...r, note_procurement: notes[key]?.note_procurement || '', note_tapi: notes[key]?.note_tapi || '' }
          })}
          columns={COLUMNS.map(c => ({ key: c.key, label: c.label }))}
          filename='מבט_רכש.xlsx'
        />
      }
    >
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder='חיפוש מק"ט / לקוח / הזמנה...'
          style={{ fontSize: 12, padding: '5px 10px', border: '0.5px solid #ddd', borderRadius: 6, width: 200, background: '#fff', color: '#1a1a1a' }}
        />
        <Select value={filterStatus} onChange={setFilterStatus} options={['הכל', 'BO', 'בסכנה', 'תקין']} />
        <Select value={filterStage} onChange={setFilterStage} options={['הכל', 'PRD', 'DR4', 'DR5']} />
        <Select value={filterVendor} onChange={setFilterVendor} options={vendors} />
        <span style={{ fontSize: 11, color: '#999', marginRight: 'auto' }}>{filtered.length} שורות</span>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, overflow: 'hidden' }}>
        <SortableTable rows={filtered} columns={COLUMNS} notes={notes} saveNote={saveNote} />
      </div>
    </PageWrapper>
  )
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ fontSize: 12, padding: '5px 8px', border: '0.5px solid #ddd', borderRadius: 6, background: '#fff', color: '#1a1a1a', cursor: 'pointer' }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
