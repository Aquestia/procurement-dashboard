import React, { useState, useMemo } from 'react'
import { Badge, NoteCell, ExportButton, PageWrapper, LoadingState, EmptyState, fmtDate } from '../components/shared'

export default function ProcurementView({ data, notes, saveNote, loading }) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('הכל')
  const [filterStage, setFilterStage] = useState('הכל')
  const [expandedItem, setExpandedItem] = useState(null)

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

  return (
    <PageWrapper title='מבט רכש — חוסרים לפי מק"ט' topActions={
      <ExportButton
        data={filtered.map(r => ({
          'מק"ט': r.itemNumber,
          'תיאור': r.productName,
          'סטטוס': r.procurementStatus,
          'שלב': r.stage,
          'פק"ע': r.prd,
          'BO': r.boOrdersCount,
          'הזמנות': r.affectedOrdersCount,
          'נדרש': r.totalQtyRequired,
          'נאסף': r.totalQtyPicked,
          'בהזמנת רכש': r.totalOnOrder,
          'זמין': r.totalAvailable,
          'חוסר נטו': r.shortage,
          'הז. רכש': r.hasPO ? 'כן' : 'לא',
          'ספק': r.vendors?.join(', ') || '',
          'צפי קבלה': fmtDate(r.confirmedReceiptDate),
          'הערת רכש': notes[r.itemNumber]?.note_procurement || '',
          'הערת תפ"י': notes[r.itemNumber]?.note_tapi || '',
        }))}
        filename='מבט_רכש.xlsx'
      />
    }>
      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder='חיפוש מק"ט / תיאור / לקוח...'
          style={{ fontSize:12, padding:'5px 10px', border:'0.5px solid #ddd', borderRadius:6, width:220, background:'#fff', color:'#1a1a1a' }} />
        {['הכל','BO','בסכנה','תקין'].map(o => (
          <button key={o} onClick={() => setFilterStatus(o)} style={{
            fontSize:12, padding:'4px 10px', borderRadius:6, cursor:'pointer',
            border:'0.5px solid ' + (filterStatus===o ? '#378ADD' : '#ddd'),
            background: filterStatus===o ? '#378ADD' : 'transparent',
            color: filterStatus===o ? '#fff' : '#555',
          }}>{o}</button>
        ))}
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          style={{ fontSize:12, padding:'5px 8px', border:'0.5px solid #ddd', borderRadius:6, background:'#fff', color:'#1a1a1a' }}>
          {['הכל','PRD','DR4','DR5','רכש','לא ידוע'].map(o => <option key={o}>{o}</option>)}
        </select>
        <span style={{ fontSize:11, color:'#999', marginRight:'auto' }}>{filtered.length} מק"טים</span>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', border:'0.5px solid #e5e5e0', borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#f4f4f0' }}>
              {['','מק"ט','תיאור מוצר','סטטוס','שלב','BO','הזמנות','נדרש','נאסף','בהזמנה','זמין','חוסר נטו','הז. רכש','צפי קבלה','ספק','הערת רכש','הערת תפ"י'].map(h => (
                <th key={h} style={{ padding:'7px 8px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <React.Fragment key={i}>
                <tr
                  style={{ background: row.isBO ? '#FCEBEB18' : i%2===0 ? '#fff' : '#fafaf8', cursor:'pointer' }}
                  onClick={() => setExpandedItem(expandedItem === row.itemNumber ? null : row.itemNumber)}>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', color:'#378ADD', fontSize:11 }}>
                    {expandedItem === row.itemNumber ? '▲' : '▼'}
                  </td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{row.itemNumber}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.productName || '—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}><Badge status={row.procurementStatus} /></td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>
                    <Badge status={row.stage?.startsWith('רכש') ? 'רכש' : row.stage} />
                    {row.prd && <div style={{ fontSize:9, color:'#888', marginTop:2 }}>{row.prd}</div>}
                  </td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', color: row.boOrdersCount>0 ? '#A32D2D' : '#1a1a1a', fontWeight: row.boOrdersCount>0 ? 600 : 400 }}>{row.boOrdersCount}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{row.affectedOrdersCount}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{row.totalQtyRequired}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{row.totalQtyPicked}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{row.totalOnOrder}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{row.totalAvailable}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', color: row.shortage>0 ? '#A32D2D' : '#3B6D11', fontWeight:600 }}>{row.shortage}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }}>
                    {!row.hasPO ? <span style={{ color:'#A32D2D' }}>❌</span> :
                     row.hasNoDate ? <span style={{ color:'#854F0B' }}>⚠️</span> :
                     <span style={{ color:'#3B6D11' }}>✅</span>}
                  </td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(row.confirmedReceiptDate) || '—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.vendors?.join(', ') || '—'}</td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }} onClick={e => e.stopPropagation()}>
                    <NoteCell value={notes[row.itemNumber]?.note_procurement || ''}
                      onChange={v => saveNote(row.itemNumber, 'note_procurement', v)} placeholder='הערת רכש...' />
                  </td>
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f0f0ea' }} onClick={e => e.stopPropagation()}>
                    <NoteCell value={notes[row.itemNumber]?.note_tapi || ''}
                      onChange={v => saveNote(row.itemNumber, 'note_tapi', v)} placeholder='הערת תפ"י...' />
                  </td>
                </tr>

                {/* Expanded panel */}
                {expandedItem === row.itemNumber && (
                  <tr key={`${i}-exp`}>
                    <td colSpan={17} style={{ background:'#fafaf8', borderBottom:'0.5px solid #e5e5e0', padding:'12px 16px' }}>
                      <ExpandedPanel item={row} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding:30, textAlign:'center', color:'#aaa', fontSize:13 }}>אין נתונים</div>
        )}
      </div>
    </PageWrapper>
  )
}

function ExpandedPanel({ item }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
      {/* Orders */}
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:'#555', marginBottom:6 }}>
          הזמנות מכירה מושפעות ({item.orders.length})
        </div>
        <div style={{ overflowX:'auto', maxHeight:200, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr>{['הזמנה','שורה','לקוח','ת. מאושר','ת. מבוקש','פק"ע'].map(h => (
                <th key={h} style={{ background:'#f0f0ec', padding:'4px 7px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {item.orders.map((o, j) => (
                <tr key={j} style={{ background: o.isBO ? '#FCEBEB18' : j%2===0 ? '#fff' : '#f9f9f7' }}>
                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{o.salesOrder || '—'}</td>
                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{o.lineNumber || '—'}</td>
                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.customerName || '—'}</td>
                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(o.confirmedShipDate) || '—'}</td>
                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(o.requestedShipDate) || '—'}</td>
                  <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', fontSize:10, color:'#666' }}>{o.prd || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Purchase Orders */}
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:'#555', marginBottom:6 }}>
          הזמנות רכש פתוחות ({item.purchaseOrders?.length || 0})
        </div>
        {!item.hasPO ? (
          <div style={{ fontSize:12, color:'#A32D2D', padding:'8px 0' }}>❌ אין הזמנות רכש פתוחות לפריט זה</div>
        ) : (
          <div style={{ overflowX:'auto', maxHeight:200, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr>{['הז. רכש','שורה','ספק','קב. רכש','כמות','יתרה','ת. משלוח מאושר'].map(h => (
                  <th key={h} style={{ background:'#f0f0ec', padding:'4px 7px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {item.purchaseOrders?.map((po, j) => (
                  <tr key={j} style={{ background: j%2===0 ? '#fff' : '#f9f9f7' }}>
                    <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', fontWeight:500 }}>{po.purchaseOrder}</td>
                    <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{po.lineNumber}</td>
                    <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{po.vendorName}</td>
                    <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', fontSize:10, color:'#666' }}>{po.buyerGroup}</td>
                    <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea' }}>{po.quantity}</td>
                    <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{po.deliverRemainder}</td>
                    <td style={{ padding:'4px 7px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', color: !po.confirmedReceiptDate ? '#A32D2D' : '#1a1a1a' }}>
                      {po.confirmedReceiptDate ? fmtDate(po.confirmedReceiptDate) : '⚠️ חסר תאריך'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Qty summary */}
        <div style={{ display:'flex', gap:16, marginTop:10, padding:'8px 10px', background:'#f4f4f0', borderRadius:6, fontSize:11 }}>
          <div><span style={{ color:'#888' }}>נדרש: </span><strong>{item.totalQtyRequired}</strong></div>
          <div><span style={{ color:'#888' }}>נאסף: </span><strong>{item.totalQtyPicked}</strong></div>
          <div><span style={{ color:'#888' }}>זמין: </span><strong>{item.totalAvailable}</strong></div>
          <div><span style={{ color:'#888' }}>בהזמנה: </span><strong>{item.totalOnOrder}</strong></div>
          <div><span style={{ color:'#888' }}>חוסר נטו: </span><strong style={{ color: item.shortage>0 ? '#A32D2D' : '#3B6D11' }}>{item.shortage}</strong></div>
        </div>
      </div>
    </div>
  )
}
