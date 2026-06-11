import { useState, useMemo } from 'react'
import { Badge, NoteCell, ExportButton, SortableTable, PageWrapper, LoadingState, EmptyState, fmtDate } from '../components/shared'

export default function BackOrders({ data, notes, saveNote, loading }) {
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('הכל')
  const [filterPO, setFilterPO] = useState('הכל')

  if (loading) return <LoadingState />
  if (!data) return <EmptyState />

  const boData = useMemo(() => data.filter(r => r.isBO), [data])

  const filtered = useMemo(() => {
    return boData.filter(r => {
      if (filterStage !== 'הכל' && !r.stage?.includes(filterStage)) return false
      if (filterPO === 'ללא הזמנה' && r.hasPO) return false
      if (filterPO === 'ללא תאריך' && (!r.hasPO || r.confirmedReceiptDate)) return false
      if (filterPO === 'מאחר' && !r.isLateReceipt) return false
      if (search) {
        const s = search.toLowerCase()
        return r.itemNumber?.toLowerCase().includes(s) || r.salesOrder?.toLowerCase().includes(s) || r.customerName?.toLowerCase().includes(s)
      }
      return true
    })
  }, [boData, filterStage, filterPO, search])

  const COLUMNS = [
    { key: 'itemNumber', label: 'מק"ט' },
    { key: 'salesOrder', label: 'הזמנה' },
    { key: 'lineNumber', label: 'שורה' },
    { key: 'customerName', label: 'לקוח' },
    { key: 'requestedShipDate', label: 'ת. מבוקש', render: v => fmtDate(v) },
    { key: 'confirmedShipDate', label: 'ת. מאושר', render: v => fmtDate(v) },
    { key: 'stage', label: 'שלב ייצור', render: v => <Badge status={v} /> },
    { key: 'qtyRequired', label: 'נדרש' },
    { key: 'poQtyOrdered', label: 'הוזמן' },
    {
      key: 'hasPO', label: 'סטטוס רכש', render: (v, row) => {
        if (!v) return <Badge status='BO' />
        if (row.hasNoDate) return <span style={{ fontSize: 10, color: '#854F0B' }}>ללא תאריך</span>
        if (row.isLateReceipt) return <span style={{ fontSize: 10, color: '#A32D2D' }}>מאחר</span>
        return <span style={{ fontSize: 10, color: '#3B6D11' }}>הוזמן</span>
      }
    },
    { key: 'confirmedReceiptDate', label: 'צפי קבלה', render: v => fmtDate(v) },
    { key: 'vendorName', label: 'ספק' },
    {
      key: 'note_procurement', label: 'הערת רכש', sortable: false,
      render: (_, row, notes, saveNote) => {
        const key = `${row.itemNumber}__${row.salesOrder}__${row.lineNumber}`
        return <NoteCell value={notes[key]?.note_procurement || ''} onChange={v => saveNote(row.itemNumber, row.salesOrder, row.lineNumber, 'note_procurement', v)} />
      }
    },
    {
      key: 'note_tapi', label: 'הערת תפ"י', sortable: false,
      render: (_, row, notes, saveNote) => {
        const key = `${row.itemNumber}__${row.salesOrder}__${row.lineNumber}`
        return <NoteCell value={notes[key]?.note_tapi || ''} onChange={v => saveNote(row.itemNumber, row.salesOrder, row.lineNumber, 'note_tapi', v)} />
      }
    },
  ]

  return (
    <PageWrapper title={`Back Orders (${boData.length})`} topActions={
      <ExportButton data={filtered} columns={COLUMNS.map(c => ({ key: c.key, label: c.label }))} filename='back_orders.xlsx' />
    }>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder='חיפוש...'
          style={{ fontSize: 12, padding: '5px 10px', border: '0.5px solid #ddd', borderRadius: 6, width: 180, background: '#fff', color: '#1a1a1a' }} />
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          style={{ fontSize: 12, padding: '5px 8px', border: '0.5px solid #ddd', borderRadius: 6, background: '#fff', color: '#1a1a1a' }}>
          {['הכל', 'PRD', 'DR4', 'DR5'].map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={filterPO} onChange={e => setFilterPO(e.target.value)}
          style={{ fontSize: 12, padding: '5px 8px', border: '0.5px solid #ddd', borderRadius: 6, background: '#fff', color: '#1a1a1a' }}>
          {['הכל', 'ללא הזמנה', 'ללא תאריך', 'מאחר'].map(o => <option key={o}>{o}</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#999', marginRight: 'auto' }}>{filtered.length} שורות</span>
      </div>
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, overflow: 'hidden' }}>
        <SortableTable rows={filtered} columns={COLUMNS} notes={notes} saveNote={saveNote}
          rowStyle={(row, i) => ({ background: '#FCEBEB18' })} />
      </div>
    </PageWrapper>
  )
}
