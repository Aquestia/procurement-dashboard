import { useMemo, useState } from 'react'
import { Badge, PageWrapper, LoadingState, EmptyState, fmtDate } from '../components/shared'
import * as XLSX from 'xlsx'

function diffDays(dateA, dateB) {
  // dateA - dateB in calendar days
  if (!dateA || !dateB) return null
  const a = new Date(dateA), b = new Date(dateB)
  if (isNaN(a) || isNaN(b)) return null
  return Math.round((a - b) / (24 * 60 * 60 * 1000))
}

function exportXlsx(rows, filename, sheet) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheet || 'נתונים')
  XLSX.writeFile(wb, filename)
}

function buildExportRows(items) {
  const rows = []
  items.forEach(r => {
    const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
    const ords = r.orders?.length > 0 ? r.orders : [{}]
    pos.forEach(po => ords.forEach(o => {
      rows.push({
        'מק"ט':                r.itemNumber,
        'תיאור פריט':          r.productName || '',
        'סטטוס':               r.procurementStatus,
        'BO':                  r.isBO ? 'כן' : '',
        'פק"ע / הזמנה':        r.prd || '',
        'פק"ע':                r.prd || '',
        'הז. מכירה':           o.salesOrder || '',
        'שורת מכירה':          o.lineNumber || '',
        'לקוח':                o.customerName || '',
        'ת. אספקה מאושר':      fmtDate(o.confirmedShipDate) || '',
        'ת. אספקה מבוקש':      fmtDate(o.requestedShipDate) || '',
        'נדרש':                r.totalQtyRequired,
        'חוסר':                r.shortage,
        'הז. רכש':             po.purchaseOrder || '',
        'שורת רכש':            po.lineNumber || '',
        'מסלול':               po.voyage || '',
        'ספק':                 po.vendorName || '',
        'קב. רכש':             po.buyerGroup || '',
        'כמות הוזמנה':         po.quantity || '',
        'יתרה':                po.deliverRemainder || '',
        'ת. קבלה מאושר':       fmtDate(po.confirmedReceiptDate) || '',
        'ת. קבלה מבוקש':       fmtDate(po.requestedReceiptDate) || '',
        'הפרש ימים (קבלה→אספקה)': (() => {
          const diff = diffDays(o.confirmedShipDate, po.confirmedReceiptDate)
          return diff !== null ? diff : ''
        })(),
      })
    }))
  })
  return rows
}

export default function Recommendations({ data, notes, loading }) {
  const [openCard, setOpenCard] = useState(null)

  const categories = useMemo(() => {
    if (!data || data.length === 0) return null

    // 1. ללא תאריך קבלה — יש PO אבל אין confirmed receipt date
    const noDate = data.filter(r =>
      r.hasPO && r.purchaseOrders?.some(po => !po.confirmedReceiptDate)
    )

    // 2. ללא הזמנת רכש — אין PO בכלל
    const noPO = data.filter(r => !r.hasPO)

    // 3. רכש מאחר — הפרש בין תאריך קבלה מאושר לתאריך אספקה מאושר < 7 ימים (לא BO)
    const latePO = data.filter(r => !r.isBO && r.purchaseOrders?.some(po => {
      if (!po.confirmedReceiptDate) return false
      return r.orders?.some(o => {
        if (!o.confirmedShipDate) return false
        const diff = diffDays(o.confirmedShipDate, po.confirmedReceiptDate)
        return diff !== null && diff < 7
      })
    }))

    // 4. רכש מאחר — BO
    const latePO_BO = data.filter(r => r.isBO && r.purchaseOrders?.some(po => {
      if (!po.confirmedReceiptDate) return false
      return r.orders?.some(o => {
        if (!o.confirmedShipDate) return false
        const diff = diffDays(o.confirmedShipDate, po.confirmedReceiptDate)
        return diff !== null && diff < 7
      })
    }))

    // 5. הזמנות בסיכון PRD — מק"ט עבור PRD בלבד (לא SOIL), הפרש ≤ 10 ימים (לא BO)
    const riskPRD = data.filter(r => !r.isBO && r.prd?.startsWith('PRD'))
      .filter(r => r.purchaseOrders?.some(po => {
        if (!po.confirmedReceiptDate) return false
        return r.orders?.some(o => {
          if (!o.confirmedShipDate) return false
          const diff = diffDays(o.confirmedShipDate, po.confirmedReceiptDate)
          return diff !== null && diff <= 10
        })
      }))

    // 6. הזמנות בסיכון PRD — BO, רק מק"טים שה-prd מתחיל ב-PRD
    const riskPRD_BO = data.filter(r => r.isBO && r.prd?.startsWith('PRD'))
      .filter(r => r.purchaseOrders?.some(po => {
        if (!po.confirmedReceiptDate) return false
        return r.orders?.some(o => {
          if (!o.confirmedShipDate) return false
          const diff = diffDays(o.confirmedShipDate, po.confirmedReceiptDate)
          return diff !== null && diff <= 10
        })
      }))

    return { noDate, noPO, latePO, latePO_BO, riskPRD, riskPRD_BO }
  }, [data])

  if (loading) return <LoadingState />
  if (!data || data.length === 0 || !categories) return <EmptyState />

  const cards = [
    {
      id: 'noDate',
      label: 'ללא תאריך קבלה',
      value: categories.noDate.length,
      sub: 'הזמנות פתוחות',
      color: '#854F0B',
      bg: '#FAEEDA',
      border: '#FFCA2C',
      items: categories.noDate,
      info: 'מק"טים שיש להם הזמנת רכש פתוחה אך הספק טרם אישר תאריך קבלה. יש לבקש אישור תאריך מהספק.',
    },
    {
      id: 'noPO',
      label: 'ללא הזמנת רכש',
      value: categories.noPO.length,
      sub: 'דורש טיפול',
      color: '#A32D2D',
      bg: '#FCEBEB',
      border: '#F09595',
      items: categories.noPO,
      info: 'מק"טים חסרים שלא יצאה עבורם הזמנת רכש. דורש טיפול מיידי — פתח הזמנת רכש.',
    },
    {
      id: 'latePO',
      label: 'רכש מאחר',
      value: categories.latePO.length,
      sub: 'הפרש < 7 ימים',
      color: '#A32D2D',
      bg: '#FCEBEB',
      border: '#F09595',
      items: categories.latePO,
      info: 'מק"טים שתאריך קבלה המאושר של הרכש הוא פחות מ-7 ימים לפני תאריך האספקה המאושר ללקוח — קיים סיכון לאיחור.',
    },
    {
      id: 'latePO_BO',
      label: 'רכש מאחר — BO',
      value: categories.latePO_BO.length,
      sub: 'הפרש < 7 ימים',
      color: '#A32D2D',
      bg: '#FCEBEB',
      border: '#F09595',
      items: categories.latePO_BO,
      info: 'מק"טים BO שתאריך קבלת הרכש המאושר הוא פחות מ-7 ימים לפני תאריך האספקה ללקוח. אלו הזמנות שכבר באיחור ועם רכש צמוד.',
    },
    {
      id: 'riskPRD',
      label: 'בסיכון — PRD',
      value: categories.riskPRD.length,
      sub: 'הפרש ≤ 10 ימים',
      color: '#854F0B',
      bg: '#FAEEDA',
      border: '#FFCA2C',
      items: categories.riskPRD,
      info: 'מק"טים הנדרשים לפקודת עבודה להרכבה (PRD). תאריך קבלת הרכש הוא ≤ 10 ימים לפני תאריך האספקה ללקוח — אין מספיק זמן לייצור.',
    },
    {
      id: 'riskPRD_BO',
      label: 'בסיכון PRD — BO',
      value: categories.riskPRD_BO.length,
      sub: 'הפרש ≤ 10 ימים',
      color: '#A32D2D',
      bg: '#FCEBEB',
      border: '#F09595',
      items: categories.riskPRD_BO,
      info: 'מק"טים BO הנדרשים ל-PRD, עם הפרש ≤ 10 ימים בין קבלת הרכש לאספקה. מצב קריטי — הרכבה בסיכון גבוה.',
    },
  ]

  return (
    <PageWrapper title='המלצות לטיפול'>
      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:20 }}>
        {cards.map(card => (
          <KpiCard
            key={card.id}
            {...card}
            isOpen={openCard === card.id}
            onClick={() => setOpenCard(openCard === card.id ? null : card.id)}
          />
        ))}
      </div>

      {/* Drill-down */}
      {openCard && (() => {
        const card = cards.find(c => c.id === openCard)
        if (!card) return null
        return (
          <DrillDown
            card={card}
            onClose={() => setOpenCard(null)}
          />
        )
      })()}
    </PageWrapper>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────
function KpiCard({ id, label, value, sub, color, bg, border, info, isOpen, onClick }) {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <div
      onClick={onClick}
      style={{
        background: isOpen ? bg : '#f4f4f0',
        borderRadius: 8, padding:'10px 12px', cursor:'pointer',
        border: isOpen ? `1.5px solid ${border}` : '1px solid transparent',
        position:'relative', transition:'all 0.15s',
      }}
    >
      {/* Info button */}
      <div style={{ position:'absolute', top:6, left:8 }}>
        <button
          onClick={e => { e.stopPropagation(); setShowInfo(s => !s) }}
          style={{ width:16, height:16, borderRadius:'50%', border:'1px solid #888', background:'transparent', color:'#888', fontSize:10, cursor:'pointer', fontWeight:600, padding:0, display:'flex', alignItems:'center', justifyContent:'center' }}
        >i</button>
        {showInfo && (
          <div
            onClick={e => e.stopPropagation()}
            style={{ position:'absolute', bottom:20, left:0, background:'#333', color:'#fff', fontSize:11, padding:'8px 10px', borderRadius:6, width:220, zIndex:100, lineHeight:1.6, textAlign:'right' }}
          >
            {info}
          </div>
        )}
      </div>

      <div style={{ fontSize:11, color:'#666', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:600, color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'#999', marginTop:3 }}>{sub}</div>}
      <div style={{ fontSize:10, color:'#378ADD', marginTop:4 }}>{isOpen ? '▲ סגור' : '▼ הצג רשימה'}</div>
    </div>
  )
}

// ── Drill-down table ──────────────────────────────────────────────
function DrillDown({ card, onClose }) {
  function handleExport() {
    const rows = buildExportRows(card.items)
    exportXlsx(rows, `${card.label}.xlsx`, card.label)
  }

  return (
    <div style={{ background:'#fff', border:`1.5px solid ${card.border}`, borderRadius:10, padding:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', marginBottom:12, gap:10 }}>
        <div style={{ flex:1 }}>
          <span style={{ fontSize:14, fontWeight:600, color: card.color }}>{card.label}</span>
          <span style={{ fontSize:12, color:'#888', marginRight:8 }}>— {card.items.length} מק"טים</span>
        </div>
        <button onClick={handleExport} style={{ fontSize:11, padding:'4px 12px', border:`0.5px solid ${card.color}`, borderRadius:6, background:'transparent', color:card.color, cursor:'pointer' }}>⬇ ייצוא Excel</button>
        <button onClick={onClose} style={{ fontSize:12, padding:'3px 10px', border:'0.5px solid #ddd', borderRadius:6, background:'transparent', color:'#888', cursor:'pointer' }}>✕ סגור</button>
      </div>

      {/* Table */}
      <div style={{ overflowX:'auto', maxHeight:480, overflowY:'auto', border:'0.5px solid #e5e5e0', borderRadius:8 }}>
        <table style={{ width:'max-content', minWidth:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead>
            <tr style={{ background:'#f4f4f0', position:'sticky', top:0, zIndex:5 }}>
              {['BO','מק"ט','תיאור','פק"ע','סטטוס','הז. מכירה','שורה','לקוח','ת. אספקה מאושר','ת. אספקה מבוקש','נדרש','חוסר','הז. רכש','שורת רכש','מסלול','ספק','קב. רכש','יתרה','ת. קבלה מאושר','ת. קבלה מבוקש','הפרש ימים'].map(h => (
                <th key={h} style={{ padding:'6px 8px', fontWeight:600, fontSize:10, color:'#555', borderBottom:'0.5px solid #e0e0da', textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.items.flatMap((r, i) => {
              const pos = r.purchaseOrders?.length > 0 ? r.purchaseOrders : [{}]
              const ords = r.orders?.length > 0 ? r.orders : [{}]
              const combos = []
              pos.forEach(po => ords.forEach(o => combos.push({ po, o })))
              return combos.map(({ po, o }, j) => {
                const diff = diffDays(o.confirmedShipDate, po.confirmedReceiptDate)
                const diffColor = diff === null ? '#888' : diff < 0 ? '#A32D2D' : diff <= 7 ? '#854F0B' : '#3B6D11'
                return (
                  <tr key={`${i}-${j}`} style={{ background: r.isBO ? '#FCEBEB10' : i%2===0?'#fff':'#fafaf8' }}>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', textAlign:'center' }}>
                      {r.isBO && <span style={{ fontSize:10, fontWeight:700, color:'#A32D2D' }}>BO</span>}
                    </td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, whiteSpace:'nowrap' }}>{r.itemNumber}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.productName||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{r.prd||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}><Badge status={r.procurementStatus} /></td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{o.salesOrder||r.prd||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{o.lineNumber||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.customerName||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(o.confirmedShipDate)||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(o.requestedShipDate)||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{r.totalQtyRequired}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', color:r.shortage>0?'#A32D2D':'#3B6D11', fontWeight:600 }}>{r.shortage}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{po.purchaseOrder||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{po.lineNumber||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{po.voyage||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{po.vendorName||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea' }}>{po.buyerGroup||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600 }}>{po.deliverRemainder||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap', color:!po.confirmedReceiptDate?'#A32D2D':'#1a1a1a' }}>{fmtDate(po.confirmedReceiptDate)||'⚠️ חסר'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', whiteSpace:'nowrap' }}>{fmtDate(po.requestedReceiptDate)||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'0.5px solid #f0f0ea', fontWeight:600, color:diffColor, whiteSpace:'nowrap' }}>
                      {diff === null ? '—' : diff < 0 ? `${Math.abs(diff)}- ימים` : `${diff} ימים`}
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
        {card.items.length === 0 && <div style={{ padding:30, textAlign:'center', color:'#aaa' }}>אין נתונים</div>}
      </div>
    </div>
  )
}
