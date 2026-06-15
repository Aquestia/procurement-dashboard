import { useState, useMemo } from 'react'
import { Badge, NoteCell, ExportButton, SortableTable, PageWrapper, LoadingState, EmptyState, fmtDate } from '../components/shared'

export default function ProcurementView({ data, notes, saveNote, loading }) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('הכל')
  const [filterStage, setFilterStage] = useState('הכל')

  if (loading) return <LoadingState />
  if (!data || data.length === 0) return <EmptyState />

  const filtered = useMemo(() => data.filter(r => {
    if (filterStatus !== 'הכל' && r.procurementStatus !== filterStatus) return false
    if (filterStage !== 'הכל' && !r.stage?.includes(filterStage)) return false
    if (search) {
      const s = search.toLowerCase()
      return r.itemNumber?.toLowerCase().includes(s) ||
        r.productName?.toLowerCase().includes(s) ||
        r.orders?.some(o => o.salesOrder?.toLowerCase().includes(s) || o.customerName?.toLowerCase().includes(s))
    }
    return true
  }), [data, search, filterStatus, filterStage])

  const COLUMNS = [
    { key: 'itemNumber', label: 'מק"ט' },
    { key: 'productName', label: 'תיאור מוצר' },
    { key: 'procurementStatus', label: 'סטטוס', render: v => <Badge status={v} /> },
    { key: 'stage', label: 'שלב', render: (v, row) => (
      <span style={{ fontSize: 10 }}>
        <Badge status={v.startsWith('רכש') ? 'רכש' : v} />
        {row.prd && <span style={{ color: '#888', marginRight: 4, fontSize: 9 }}>{row.prd}</span>}
      </span>
    )},
    { key: 'boOrdersCount', label: 'BO', render: v => v > 0 ? <span style={{ color:'#A32D2D', fontWeight:600 }}>{v}</span> : '0' },
    { key: 'affectedOrdersCount', label: 'הזמנות' },
    { key: 'totalQtyRequired', label: 'נדרש' },
    { key: 'totalQtyPicked', label: 'נאסף' },
    { key: 'totalOnOrder', label: 'בהזמנה' },
    { key: 'totalAvailable', label: 'זמין' },
    { key: 'shortage', label: 'חוסר נטו', render: v => <span style={{ color: v > 0 ? '#A32D2D' : '#3B6D11', fontWeight: 600 }}>{v}</span> },
    { key: 'hasPO', label: 'הז. רכש', render: (v, row) =>
      !v ? <span style={{ color:'#A32D2D', fontSize:11 }}>❌</span> :
      row.hasNoDate ? <span style={{ color:'#854F0B', fontSize:11 }}>⚠️</span> :
      <span style={{ color:'#3B6D11', fontSize:11 }}>✅</span>
    },
    { key: 'confirmedReceiptDate', label: 'צפי קבלה', render: v => fmtDate(v) },
    { key: 'vendors', label: 'ספק', render: v => v?.join(', ') || '—' },
    {
      key: 'note_procurement', label: 'הערת רכש', sortable: false,
      render: (_, row, notes, saveNote) =>
        <NoteCell value={notes[row.itemNumber]?.note_procurement || ''}
          onChange={v => saveNote(row.itemNumber, 'note_procurement', v)}
          placeholder='הערת רכש...' />
    },
    {
      key: 'note_tapi', label: 'הערת תפ"י', sortable: false,
      render: (_, row, notes, saveNote) =>
        <NoteCell value={notes[row.itemNumber]?.note_tapi || ''}
          onChange={v => saveNote(row.itemNumber, 'note_tapi', v)}
          placeholder='הערת תפ"י...' />
    },
  ]

  return (
    <PageWrapper title='מבט רכש — חוסרים לפי מק"ט' topActions={
      <ExportButton data={filtered.map(r => ({
        ...r,
        note_procurement: notes[r.itemNumber]?.note_procurement || '',
        note_tapi: notes[r.itemNumber]?.note_tapi || '',
        vendors: r.vendors?.join(', ') || '',
      }))} columns={COLUMNS.map(c => ({ key: c.key, label: c.label }))} filename='מבט_רכש.xlsx' />
    }>
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder='חיפוש מק"ט / תיאור / לקוח...'
          style={{ fontSize:12, padding:'5px 10px', border:'0.5px solid #ddd', borderRadius:6, width:220, background:'#fff', color:'#1a1a1a' }} />
        {['הכל','BO','בסכנה','תקין'].map(o => (
          <button key={o} onClick={() => setFilterStatus(o)} style={{
            fontSize:12, padding:'4px 10px', borderRadius:6, cursor:'pointer',
            border:'0.5px solid ' + (filterStatus === o ? '#378ADD' : '#ddd'),
            background: filterStatus === o ? '#378ADD' : 'transparent',
            color: filterStatus === o ? '#fff' : '#555'
          }}>{o}</button>
        ))}
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          style={{ fontSize:12, padding:'5px 8px', border:'0.5px solid #ddd', borderRadius:6, background:'#fff', color:'#1a1a1a' }}>
          {['הכל','PRD','DR4','DR5','רכש','לא ידוע'].map(o => <option key={o}>{o}</option>)}
        </select>
        <span style={{ fontSize:11, color:'#999', marginRight:'auto' }}>{filtered.length} מק"טים</span>
      </div>
      <div style={{ background:'#fff', border:'0.5px solid #e5e5e0', borderRadius:10, overflow:'hidden' }}>
        <SortableTable rows={filtered} columns={COLUMNS} notes={notes} saveNote={saveNote} />
      </div>
    </PageWrapper>
  )
}
