import { useMemo } from 'react'
import { Badge, ExportButton, PageWrapper, LoadingState, EmptyState, fmtDate } from '../components/shared'

export default function Recommendations({ data, notes, loading }) {
  if (loading) return <LoadingState />
  if (!data || data.length === 0) return <EmptyState />

  const recs = useMemo(() => {
    const today = new Date()
    const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    const in14 = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)

    return data
      .filter(r => !r.isBO)
      .map(r => {
        const confirmed = r.confirmedShipDate ? new Date(r.confirmedShipDate) : null
        const receipt = r.confirmedReceiptDate ? new Date(r.confirmedReceiptDate) : null
        const daysToShip = confirmed ? Math.round((confirmed - today) / (24 * 60 * 60 * 1000)) : null
        const daysToReceipt = receipt ? Math.round((receipt - today) / (24 * 60 * 60 * 1000)) : null

        let rec = null
        let urgency = null
        let urgencyColor = null

        if (!r.hasPO && confirmed && confirmed <= in30) {
          rec = 'קדם רכש — אין הזמנה ואספקה תוך 30 יום'
          urgency = 'דחוף'
          urgencyColor = '#A32D2D'
        } else if (r.isLateReceipt) {
          rec = 'קדם קבלה — תאריך קבלה מאחר לתאריך אספקה'
          urgency = 'דחוף'
          urgencyColor = '#A32D2D'
        } else if (r.hasNoDate) {
          rec = 'בקש תאריך אישור מספק'
          urgency = 'בינוני'
          urgencyColor = '#854F0B'
        } else if (!r.hasPO && confirmed && confirmed <= in30 * 2) {
          rec = 'פתח הזמנת רכש — אין הזמנה'
          urgency = 'בינוני'
          urgencyColor = '#854F0B'
        } else if (receipt && confirmed && receipt <= confirmed) {
          rec = 'אפשרי לדחות — קבלה לפני מועד אספקה'
          urgency = 'נמוך'
          urgencyColor = '#3B6D11'
        }

        if (!rec) return null
        return { ...r, rec, urgency, urgencyColor, daysToShip, daysToReceipt }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const order = { 'דחוף': 0, 'בינוני': 1, 'נמוך': 2 }
        return order[a.urgency] - order[b.urgency]
      })
  }, [data])

  const urgent = recs.filter(r => r.urgency === 'דחוף')
  const medium = recs.filter(r => r.urgency === 'בינוני')
  const low = recs.filter(r => r.urgency === 'נמוך')

  return (
    <PageWrapper title='המלצות לטיפול' topActions={
      <ExportButton
        data={recs}
        columns={[
          { key: 'itemNumber', label: 'מק"ט' },
          { key: 'salesOrder', label: 'הזמנה' },
          { key: 'lineNumber', label: 'שורה' },
          { key: 'customerName', label: 'לקוח' },
          { key: 'urgency', label: 'דחיפות' },
          { key: 'rec', label: 'המלצה' },
          { key: 'confirmedShipDate', label: 'ת. אספקה' },
          { key: 'confirmedReceiptDate', label: 'צפי קבלה' },
          { key: 'daysToShip', label: 'ימים לאספקה' },
        ]}
        filename='המלצות.xlsx'
      />
    }>
      <RecSection title='🔴 דחוף' items={urgent} color='#A32D2D' bg='#FCEBEB' />
      <RecSection title='🟡 בינוני' items={medium} color='#854F0B' bg='#FAEEDA' />
      <RecSection title='🟢 לדחות / מנוהל' items={low} color='#3B6D11' bg='#EAF3DE' />
      {recs.length === 0 && <EmptyState message='אין המלצות כרגע' />}
    </PageWrapper>
  )
}

function RecSection({ title, items, color, bg }) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 8, padding: '6px 10px', background: bg, borderRadius: 6, display: 'inline-block' }}>
        {title} ({items.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((r, i) => (
          <div key={i} style={{ background: '#fff', border: `0.5px solid ${color}40`, borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{r.itemNumber}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{r.salesOrder} שורה {r.lineNumber}</span>
                <Badge status={r.stage} />
              </div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>{r.customerName}</div>
              <div style={{ fontSize: 12, color, fontWeight: 500 }}>{r.rec}</div>
            </div>
            <div style={{ textAlign: 'left', flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: '#888' }}>אספקה: {fmtDate(r.confirmedShipDate)}</div>
              <div style={{ fontSize: 10, color: '#888' }}>קבלה: {fmtDate(r.confirmedReceiptDate)}</div>
              {r.daysToShip !== null && (
                <div style={{ fontSize: 10, color: r.daysToShip < 0 ? '#A32D2D' : r.daysToShip < 14 ? '#854F0B' : '#3B6D11', fontWeight: 600, marginTop: 2 }}>
                  {r.daysToShip < 0 ? `${Math.abs(r.daysToShip)} ימים באיחור` : `${r.daysToShip} ימים לאספקה`}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
