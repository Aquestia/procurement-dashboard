import { useMemo } from 'react'
import { PageWrapper, LoadingState, EmptyState, ExportButton, fmtDate } from '../components/shared'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { MONTHS_HE } from '../lib/constants'

export default function Summaries({ data, loading }) {
  if (loading) return <LoadingState />
  if (!data || data.length === 0) return <EmptyState />

  const stats = useMemo(() => {
    const bo = data.filter(r => r.isBO)
    const nonBo = data.filter(r => !r.isBO)

    // By item - BO count and affected orders
    const itemMap = {}
    data.forEach(r => {
      if (!itemMap[r.itemNumber]) itemMap[r.itemNumber] = { itemNumber: r.itemNumber, boOrders: 0, totalOrders: 0, boUSD: 0, totalUSD: 0 }
      itemMap[r.itemNumber].totalOrders++
      itemMap[r.itemNumber].totalUSD += parseFloat(r.salesAmountUSD) || 0
      if (r.isBO) {
        itemMap[r.itemNumber].boOrders++
        itemMap[r.itemNumber].boUSD += parseFloat(r.salesAmountUSD) || 0
      }
    })
    const itemSummary = Object.values(itemMap).sort((a, b) => b.boOrders - a.boOrders)

    // By month
    const monthMap = {}
    data.forEach(r => {
      if (r.confirmedShipDate) {
        const d = new Date(r.confirmedShipDate)
        if (!isNaN(d)) {
          const key = `${d.getMonth() + 1}-${d.getFullYear()}`
          const label = `${MONTHS_HE[d.getMonth() + 1]}`
          if (!monthMap[key]) monthMap[key] = { label, total: 0, bo: 0, totalUSD: 0, boUSD: 0, month: d.getMonth() + 1, year: d.getFullYear() }
          monthMap[key].total++
          monthMap[key].totalUSD += parseFloat(r.salesAmountUSD) || 0
          if (r.isBO) { monthMap[key].bo++; monthMap[key].boUSD += parseFloat(r.salesAmountUSD) || 0 }
        }
      }
    })
    const monthSummary = Object.values(monthMap).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

    const totalUSD = data.reduce((s, r) => s + (parseFloat(r.salesAmountUSD) || 0), 0)
    const boUSD = bo.reduce((s, r) => s + (parseFloat(r.salesAmountUSD) || 0), 0)

    return { bo, nonBo, itemSummary, monthSummary, totalUSD, boUSD }
  }, [data])

  return (
    <PageWrapper title='סיכומים'>
      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'סה"כ שורות', val: data.length },
          { label: 'שורות BO', val: stats.bo.length, color: '#A32D2D' },
          { label: 'שורות לא BO', val: stats.nonBo.length, color: '#3B6D11' },
          { label: 'סכום BO $', val: `$${Math.round(stats.boUSD).toLocaleString()}`, color: '#A32D2D' },
        ].map((k, i) => (
          <div key={i} style={{ background: '#f4f4f0', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: k.color || '#1a1a1a' }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Monthly chart */}
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>השפעה חודשית — שורות ו-BO</div>
        <ResponsiveContainer width='100%' height={200}>
          <BarChart data={stats.monthSummary} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
            <XAxis dataKey='label' tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey='total' name='סה"כ' fill='#B5D4F4' radius={[3, 3, 0, 0]} />
            <Bar dataKey='bo' name='BO' fill='#E24B4A' radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Item summary table */}
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #e5e5e0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>סיכום לפי מק"ט</span>
          <span style={{ marginRight: 'auto' }}>
            <ExportButton data={stats.itemSummary}
              columns={[
                { key: 'itemNumber', label: 'מק"ט' },
                { key: 'totalOrders', label: 'סה"כ הזמנות' },
                { key: 'boOrders', label: 'הזמנות BO' },
                { key: 'totalUSD', label: 'סה"כ $' },
                { key: 'boUSD', label: 'BO $' },
              ]}
              filename='סיכום_מקטים.xlsx'
            />
          </span>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['מק"ט', 'סה"כ הזמנות', 'הזמנות BO', '% BO', 'סה"כ $', 'BO $'].map(h => (
                  <th key={h} style={{ background: '#f4f4f0', padding: '7px 10px', fontWeight: 600, fontSize: 11, color: '#555', borderBottom: '0.5px solid #e0e0da', textAlign: 'right', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.itemSummary.slice(0, 100).map((row, i) => (
                <tr key={i} style={{ background: row.boOrders > 0 ? '#FCEBEB18' : i % 2 === 0 ? '#fff' : '#fafaf8' }}>
                  <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', fontWeight: 500 }}>{row.itemNumber}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea' }}>{row.totalOrders}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', color: row.boOrders > 0 ? '#A32D2D' : '#1a1a1a', fontWeight: row.boOrders > 0 ? 600 : 400 }}>{row.boOrders}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea' }}>
                    {row.totalOrders > 0 ? `${Math.round(row.boOrders / row.totalOrders * 100)}%` : '0%'}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea' }}>${Math.round(row.totalUSD).toLocaleString()}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '0.5px solid #f0f0ea', color: row.boUSD > 0 ? '#A32D2D' : '#1a1a1a' }}>${Math.round(row.boUSD).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageWrapper>
  )
}
