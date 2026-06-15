import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { KpiCard, Badge, fmtDate, LoadingState, EmptyState } from '../components/shared'

const COLORS = ['#378ADD', '#7F77DD', '#EF9F27', '#E24B4A', '#639922']

export default function Overview({ data, loading }) {
  if (loading) return <LoadingState />
  if (!data || data.length === 0) return <EmptyState />

  const stats = useMemo(() => {
    const bo = data.filter(r => r.isBO)
    const danger = data.filter(r => r.procurementStatus === 'בסכנה')
    const noPO = data.filter(r => !r.hasPO)
    const noDate = data.filter(r => r.hasPO && r.hasNoDate)
    const lateReceipt = data.filter(r => {
      if (!r.confirmedReceiptDate) return false
      const boOrder = r.boOrders?.[0]
      if (!boOrder?.confirmedShipDate) return false
      return new Date(r.confirmedReceiptDate) > new Date(boOrder.confirmedShipDate)
    })

    // By confirmed month
    const byMonth = {}
    data.forEach(r => {
      r.orders?.forEach(o => {
        if (o.confirmedShipDate) {
          const d = new Date(o.confirmedShipDate)
          if (!isNaN(d)) {
            const label = d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' })
            byMonth[label] = (byMonth[label] || 0) + 1
          }
        }
      })
    })
    const monthData = Object.entries(byMonth).slice(0, 7).map(([label, count]) => ({ label, count }))

    // BO by customer
    const byCustomer = {}
    bo.forEach(r => {
      r.boOrders?.forEach(o => {
        const c = o.customerName || 'לא ידוע'
        byCustomer[c] = (byCustomer[c] || 0) + 1
      })
    })
    const customerData = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 16) + '…' : name, count }))

    // By stage
    const byStage = {}
    data.forEach(r => { byStage[r.stage] = (byStage[r.stage] || 0) + 1 })
    const stageData = Object.entries(byStage).map(([name, value]) => ({ name, value }))

    // Bottlenecks - items affecting most orders
    const bottlenecks = [...data]
      .sort((a, b) => b.affectedOrdersCount - a.affectedOrdersCount)
      .slice(0, 5)
      .map(r => ({
        item: r.itemNumber,
        count: r.affectedOrdersCount,
        isBO: r.isBO,
        level: r.affectedOrdersCount >= 5 ? 'קריטי' : r.affectedOrdersCount >= 3 ? 'בינוני' : 'נמוך',
        levelColor: r.affectedOrdersCount >= 5 ? '#A32D2D' : r.affectedOrdersCount >= 3 ? '#854F0B' : '#3B6D11',
        levelBg: r.affectedOrdersCount >= 5 ? '#FCEBEB' : r.affectedOrdersCount >= 3 ? '#FAEEDA' : '#EAF3DE',
      }))

    const poStatus = [
      { name: 'הוזמן', value: data.filter(r => r.hasPO && !r.hasNoDate).length, color: '#639922' },
      { name: 'ללא הזמנה', value: noPO.length, color: '#E24B4A' },
      { name: 'ללא תאריך', value: noDate.length, color: '#EF9F27' },
      { name: 'מאחר', value: lateReceipt.length, color: '#E24B4A' },
    ]

    const totalUSD = bo.reduce((s, r) => s + (r.totalRemainingAmount || 0), 0)

    return { bo, danger, noPO, noDate, monthData, customerData, stageData, bottlenecks, poStatus, totalUSD }
  }, [data])

  const KPI_COLS = [
    { key: 'itemNumber', label: 'מק"ט' },
    { key: 'productName', label: 'תיאור' },
    { key: 'procurementStatus', label: 'סטטוס', render: v => <Badge status={v} /> },
    { key: 'stage', label: 'שלב', render: v => <Badge status={v} /> },
    { key: 'affectedOrdersCount', label: 'הזמנות מושפעות' },
    { key: 'hasPO', label: 'הוזמן', render: v => v ? '✅' : '❌' },
    { key: 'confirmedReceiptDate', label: 'צפי קבלה', render: v => fmtDate(v) },
  ]

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', flex: 1 }}>סקירה כללית</h1>
        <span style={{ fontSize: 11, color: '#999' }}>לחץ על כרטיס לפתיחת רשימה</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 16 }}>
        <KpiCard label='סה"כ מק"טים חסרים' value={data.length} sub='ייחודיים' color='blue' items={data} columns={KPI_COLS} />
        <KpiCard label='מק"טים BO' value={stats.bo.length} sub={`$${Math.round(stats.totalUSD).toLocaleString()}`} color='red' items={stats.bo} columns={KPI_COLS} />
        <KpiCard label='בסכנת BO' value={stats.danger.length} sub='ללא רכש' color='amber' items={stats.danger} columns={KPI_COLS} />
        <KpiCard label='ללא הזמנת רכש' value={stats.noPO.length} sub='דורש טיפול' color='red' items={stats.noPO} columns={KPI_COLS} />
        <KpiCard label='ללא תאריך קבלה' value={stats.noDate.length} sub='הזמנות פתוחות' color='amber' items={stats.noDate} columns={KPI_COLS} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <ChartCard title='חוסרים לפי חודש אספקה מאושר'>
          <ResponsiveContainer width='100%' height={180}>
            <BarChart data={stats.monthData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
              <XAxis dataKey='label' tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => [v, 'מק"טים']} />
              <Bar dataKey='count' radius={[3,3,0,0]}>
                {stats.monthData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title='BO לפי לקוח — TOP 6'>
          <ResponsiveContainer width='100%' height={180}>
            <BarChart data={stats.customerData} layout='vertical' margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <XAxis type='number' tick={{ fontSize: 10 }} />
              <YAxis type='category' dataKey='name' tick={{ fontSize: 10 }} width={110} />
              <Tooltip formatter={v => [v, 'BO']} />
              <Bar dataKey='count' fill='#E24B4A' radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.9fr', gap: 12 }}>
        <ChartCard title='צווארי בקבוק — מק"טים קריטיים'>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {stats.bottlenecks.map((bn, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, border: `0.5px solid ${bn.isBO ? '#F09595' : '#e0e0da'}`, background: bn.isBO ? '#FCEBEB18' : '#fff' }}>
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{bn.item}</span>
                <span style={{ fontSize: 10, color: '#888' }}>{bn.count} הזמנות</span>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 600, background: bn.levelBg, color: bn.levelColor }}>{bn.level}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title='התפלגות לפי שלב ייצור'>
          <ResponsiveContainer width='100%' height={140}>
            <PieChart>
              <Pie data={stats.stageData} cx='50%' cy='50%' innerRadius={35} outerRadius={60} dataKey='value' nameKey='name'>
                {stats.stageData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {stats.stageData.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i], flexShrink: 0 }} />
                <span style={{ flex: 1, color: '#555' }}>{s.name}</span>
                <span style={{ fontWeight: 600 }}>{s.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title='סטטוס רכש'>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {stats.poStatus.map((s, i) => {
              const max = Math.max(...stats.poStatus.map(x => x.value))
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                    <span style={{ color: '#555' }}>{s.name}</span>
                    <span style={{ fontWeight: 600 }}>{s.value}</span>
                  </div>
                  <div style={{ height: 8, background: '#f0f0ea', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${max ? (s.value / max) * 100 : 0}%`, background: s.color, borderRadius: 4 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}
