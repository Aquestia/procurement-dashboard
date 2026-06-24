import { useMemo, useState } from 'react'
import { Badge, fmtDate } from '../components/shared'
import * as XLSX from 'xlsx'


export default function AirShipment({ data, notes, loading }) {
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState('הכל') // הכל / רכש / תפ"י / שניהם

  // איסוף כל המק"טים שסומנו הטסה ברכש או בתפ"י
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
          'שורת מכירה': o.lineNumber || '',
          'לקוח': o.customerName || '',
          'ת. אספקה מאושר': fmtDate(o.confirmedShipDate),
          'נדרש': r.totalQtyRequired,
          'נאסף': r.totalQtyPicked,
          'בהזמנה': r.totalOnOrder,
          'זמין': r.totalAvailable,
          'חוסר': r.shortage,
          'הז. רכש': po.purchaseOrder || '',
          'שורת רכש': po.lineNumber || '',
          'ספק': po.vendorName || '',
          'מסלול': po.voyage || '',
          'צפי קבלה': fmtDate(po.confirmedReceiptDate),
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
    const itemList = filtered.map(r => `• ${r.itemNumber} — ${r.productName || ''}`).join('\n')
    return { today, itemList }
  }

  function handleExportAndOutlook() {
    buildExcel()
    const { today, itemList } = buildMessage()
    const subject = encodeURIComponent(`פריטים להטסה — ${today}`)
    const body = encodeURIComponent(`שלום,\n\nמצורף קובץ Excel עם רשימת הפריטים המסומנים להטסה נכון לתאריך ${today}.\n\n${itemList}\n\nסה"כ ${filtered.length} מק"טים.\n\nבברכה`)
    setTimeout(() => { window.location.href = `mailto:?subject=${subject}&body=${body}` }, 800)
  }

  function handleExportAndWhatsApp() {
    buildExcel()
    const { today, itemList } = buildMessage()
    const text = encodeURIComponent(`✈ *פריטים להטסה — ${today}*\n\n${itemList}\n\nסה"כ ${filtered.length} מק"טים\n_(קובץ Excel מצורף בנפרד)_`)
    setTimeout(() => { window.open(`https://web.whatsapp.com/send?text=${text}`, '_blank') }, 800)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>טוען...</div>

  return (
    <div style={{ padding: 24, direction: 'rtl' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
            ✈ פריטים להטסה
          </h1>
          <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
            {filtered.length !== airItems.length
              ? `${filtered.length} מתוך ${airItems.length} מק"טים`
              : `${airItems.length} מק"טים מסומנים להטסה`}
          </div>
        </div>
        <div style={{ marginRight: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={buildExcel} style={{
            fontSize: 12, padding: '7px 16px', borderRadius: 7,
            border: '0.5px solid #3B6D11', background: '#3B6D11', color: '#fff',
            cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}>⬇ ייצוא Excel</button>
          <button onClick={handleExportAndWhatsApp} style={{
            fontSize: 12, padding: '7px 16px', borderRadius: 7,
            border: '0.5px solid #25D366', background: '#25D366', color: '#fff',
            cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}>💬 ייצוא + WhatsApp</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder='חיפוש מק"ט / תיאור / לקוח...'
          style={{ flex: 1, fontSize: 12, padding: '6px 10px', border: '0.5px solid #ddd', borderRadius: 6, background: '#fafaf8', direction: 'rtl', outline: 'none' }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ fontSize: 11, padding: '4px 10px', border: '0.5px solid #ddd', borderRadius: 6, background: 'transparent', color: '#888', cursor: 'pointer' }}>✕ נקה</button>
        )}
      </div>

      {/* Empty */}
      {airItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✈</div>
          אין מק"טים מסומנים להטסה כרגע
          <div style={{ fontSize: 12, marginTop: 8 }}>סמן פריטים כ"הטסה" במבט רכש או מבט תפ"י</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>לא נמצאו תוצאות לחיפוש</div>
      ) : (
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
          <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#E6F1FB', position: 'sticky', top: 0, zIndex: 10 }}>
                {['מק"ט','תיאור מוצר','סטטוס','פק"ע / הזמנה','הז. מכירה','שורת מכירה','לקוח','ת. אספקה מאושר','נדרש','נאסף','בהזמנה','זמין','חוסר','הז. רכש','שורת רכש','ספק','מסלול','צפי קבלה','הערת רכש','הערת תפ"י'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', fontWeight: 600, fontSize: 10, color: '#185FA5', borderBottom: '1px solid #B5D4F4', textAlign: 'right', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#E6F1FB' }}>{h}</th>
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
                  <tr key={`${i}-${j}`} style={{ background: i % 2 === 0 ? '#fff' : '#f7fbff', verticalAlign: 'top' }}>
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'middle', color: '#185FA5' }}>{row.itemNumber}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{row.productName || '—'}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', verticalAlign: 'middle' }}><Badge status={row.procurementStatus} /></td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', fontSize: 10, color: '#555', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{row.prd || '—'}</td>}
                    <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', whiteSpace: 'nowrap', fontSize: 11 }}>{o.salesOrder || (row.prd?.startsWith('SOIL') ? row.prd : '—')}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', fontSize: 11 }}>{o.lineNumber || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customerName || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', whiteSpace: 'nowrap', color: o.confirmedShipDate ? '#1a1a1a' : '#aaa' }}>{fmtDate(o.confirmedShipDate) || '—'}</td>
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', fontWeight: 600, verticalAlign: 'middle' }}>{row.totalQtyRequired}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', verticalAlign: 'middle' }}>{row.totalQtyPicked}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', verticalAlign: 'middle' }}>{row.totalOnOrder}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', verticalAlign: 'middle' }}>{row.totalAvailable}</td>}
                    {j === 0 && <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', fontWeight: 600, color: row.shortage > 0 ? '#A32D2D' : '#3B6D11', verticalAlign: 'middle' }}>{row.shortage}</td>}
                    <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', whiteSpace: 'nowrap', fontSize: 11 }}>{po.purchaseOrder || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', fontSize: 11 }}>{po.lineNumber || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{po.vendorName || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', whiteSpace: 'nowrap' }}>{po.voyage || '—'}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', whiteSpace: 'nowrap', color: !po.confirmedReceiptDate ? '#A32D2D' : '#1a1a1a' }}>{fmtDate(po.confirmedReceiptDate) || '—'}</td>
                    {j === 0 && (
                      <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', maxWidth: 160, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, verticalAlign: 'top' }}>
                        {n.note_procurement ? (
                          <div style={{ background: '#E6F1FB', borderRadius: 4, padding: '3px 6px', marginBottom: 3 }}>
                            <span style={{ fontSize: 9, color: '#185FA5', fontWeight: 600 }}>רכש: </span>
                            <span style={{ color: '#1a1a1a' }}>{n.note_procurement}</span>
                          </div>
                        ) : '—'}
                      </td>
                    )}
                    {j === 0 && (
                      <td rowSpan={combos.length} style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', maxWidth: 160, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, verticalAlign: 'top' }}>
                        {n.note_tapi ? (
                          <div style={{ background: '#EAF3DE', borderRadius: 4, padding: '3px 6px' }}>
                            <span style={{ fontSize: 9, color: '#3B6D11', fontWeight: 600 }}>תפ"י: </span>
                            <span style={{ color: '#1a1a1a' }}>{n.note_tapi}</span>
                          </div>
                        ) : '—'}
                      </td>
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
