import { useState, useMemo } from 'react'
import { Badge, NoteCell, ExportButton, PageWrapper, LoadingState, EmptyState, fmtDate } from '../components/shared'

export default function BackOrders({ data, notes, saveNote, loading }) {
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('הכל')
  const [filterPO, setFilterPO] = useState('הכל')
  const [expandedItem, setExpandedItem] = useState(null)

  if (loading) return <LoadingState />
  if (!data) return <EmptyState />

  const boData = useMemo(() => data.filter(r => r.isBO), [data])

  const filtered = useMemo(() => boData.filter(r => {
    if (filterStage !== 'הכל' && !r.stage?.includes(filterStage)) return false
    if (filterPO === 'ללא הזמנה' && r.hasPO) return false
    if (filterPO === 'ללא תאריך' && (!r.hasPO || r.confirmedReceiptDate)) return false
    if (search) {
      const s = search.toLowerCase()
      return r.itemNumber?.toLowerCase().includes(s) ||
        r.productName?.toLowerCase().includes(s) ||
        r.boOrders?.some(o => o.salesOrder?.toLowerCase().includes(s) || o.customerName?.toLowerCase().includes(s))
    }
    return true
  }), [boData, filterStage, filterPO, search])

  return (
    <PageWrapper title={`Back Orders — ${boData.length} מק"טים`} topActions={
      <ExportButton data={filtered.map(r => ({
        itemNumber: r.itemNumber, productName: r.productName,
        stage: r.stage, prd: r.prd,
        boOrdersCount: r.boOrdersCount,
        totalQtyRequired: r.totalQtyRequired,
        totalOnOrder: r.totalOnOrder,
        shortage: r.shortage,
        confirmedReceiptDate: fmtDate(r.confirmedReceiptDate),
        vendors: r.vendors?.join(', ') || '',
        note_procurement: notes[r.itemNumber]?.note_procurement || '',
        note_tapi: notes[r.itemNumber]?.note_tapi || '',
      }))} columns={[
        { key:'itemNumber', label:'מק"ט' },{ key:'productName', label:'תיאור' },
        { key:'stage', label:'שלב' },{ key:'prd', label:'פק"ע' },
        { key:'boOrdersCount', label:'BO' },{ key:'totalQtyRequired', label:'נדרש' },
        { key:'totalOnOrder', label:'בהזמנה' },{ key:'shortage', label:'חוסר נטו' },
        { key:'confirmedReceiptDate', label:'צפי קבלה' },{ key:'vendors', label:'ספק' },
        { key:'note_procurement', label:'הערת רכש' },{ key:'note_tapi', label:'הערת תפ"י' },
      ]} filename='back_orders.xlsx' />
    }>
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder='חיפוש מק"ט / לקוח...'
          style={{ fontSize:12, padding:'5px 10px', border:'0.5px solid #ddd', borderRadius:6, width:200, background:'#fff', color:'#1a1a1a' }} />
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          style={{ fontSize:12, padding:'5px 8px', border:'0.5px solid #ddd', borderRadius:6, background:'#fff', color:'#1a1a1a' }}>
          {['הכל','PRD','DR4','DR5','רכש','לא ידוע'].map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={filterPO} onChange={e => setFilterPO(e.target.value)}
          style={{ fontSize:12, padding:'5px 8px', border:'0.5px solid #ddd', borderRadius:6, background:'#fff', color:'#1a1a1a' }}>
          {['הכל','ללא הזמנה','ללא תאריך'].map(o => <option key={o}>{o}</option>)}
        </select>
        <span style={{ fontSize:11, color:'#999', marginRight:'auto' }}>{filtered.length} מק"טים</span>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.map((item, i) => (
          <div key={i} style={{ background:'#fff', border:'0.5px solid #F09595', borderRadius:10, overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#FCEBEB18', cursor:'pointer' }}
              onClick={() => setExpandedItem(expandedItem === item.itemNumber ? null : item.itemNumber)}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>{item.itemNumber}</span>
                  <Badge status='BO' />
                  <Badge status={item.stage.startsWith('רכש') ? 'רכש' : item.stage} />
                  {item.prd && <span style={{ fontSize:10, color:'#666', background:'#f0f0ea', padding:'1px 6px', borderRadius:4 }}>{item.prd}</span>}
                  {!item.hasPO && <span style={{ fontSize:10, background:'#FCEBEB', color:'#A32D2D', padding:'1px 6px', borderRadius:6 }}>ללא הז. רכש</span>}
                  {item.hasNoDate && <span style={{ fontSize:10, background:'#FAEEDA', color:'#854F0B', padding:'1px 6px', borderRadius:6 }}>ללא תאריך</span>}
                </div>
                <div style={{ fontSize:11, color:'#666' }}>{item.productName}</div>
              </div>
              <div style={{ display:'flex', gap:14, fontSize:11, color:'#555', flexShrink:0 }}>
                <div><span style={{ color:'#888' }}>BO: </span><strong style={{ color:'#A32D2D' }}>{item.boOrdersCount}</strong></div>
                <div><span style={{ color:'#888' }}>חוסר: </span><strong style={{ color:'#A32D2D' }}>{item.shortage}</strong></div>
                <div><span style={{ color:'#888' }}>בהזמנה: </span><strong>{item.totalOnOrder}</strong></div>
                <div><span style={{ color:'#888' }}>צפי: </span><strong>{fmtDate(item.confirmedReceiptDate) || '—'}</strong></div>
                <div><span style={{ color:'#888' }}>ספק: </span><strong>{item.vendors?.join(', ') || '—'}</strong></div>
              </div>
              <span style={{ fontSize:12, color:'#378ADD', flexShrink:0 }}>{expandedItem === item.itemNumber ? '▲' : '▼'}</span>
            </div>

            {expandedItem === item.itemNumber && (
              <div style={{ padding:'10px 14px', borderTop:'0.5px solid #f0e0e0' }}>
                <div style={{ fontSize:11, fontWeight:600, marginBottom:6, color:'#555' }}>הזמנות BO מושפעות ({item.boOrders.length}):</div>
                <div style={{ overflowX:'auto', marginBottom:10 }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                    <thead>
                      <tr>{['הזמנה','שורה','לקוח','ת. מאושר','ת. מבוקש','כמות','הז. רכש'].map(h => (
                        <th key={h} style={{ background:'#f4f4f0', padding:'5px 8px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {item.boOrders.map((o, j) => (
                        <tr key={j} style={{ background: j % 2 === 0 ? '#fff' : '#fafaf8' }}>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{o.salesOrder}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{o.lineNumber}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{o.customerName}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{fmtDate(o.confirmedShipDate)}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{fmtDate(o.requestedShipDate)}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{o.qtyRequired}</td>
                          <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{o.openPurchaseOrders || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display:'flex', gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:'#888', marginBottom:3 }}>הערת רכש:</div>
                    <NoteCell value={notes[item.itemNumber]?.note_procurement || ''}
                      onChange={v => saveNote(item.itemNumber, 'note_procurement', v)} placeholder='הערת רכש...' />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:'#888', marginBottom:3 }}>הערת תפ"י:</div>
                    <NoteCell value={notes[item.itemNumber]?.note_tapi || ''}
                      onChange={v => saveNote(item.itemNumber, 'note_tapi', v)} placeholder='הערת תפ"י...' />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <EmptyState message='אין Back Orders' />}
      </div>
    </PageWrapper>
  )
}
