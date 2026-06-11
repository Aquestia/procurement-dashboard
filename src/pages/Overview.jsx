import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { KpiCard, Badge, fmtDate, LoadingState, EmptyState } from '../components/shared'
import { MONTHS_HE } from '../lib/constants'

const COLORS_CHART = ['#378ADD', '#7F77DD', '#EF9F27', '#B5D4F4', '#639922']

export default function Overview({ data, loading }) {
  if (loading) return <LoadingState />
  if (!data || data.length === 0) return <EmptyState />

  const stats = useMemo(() => {
    const bo = data.filter(r => r.isBO)
    const danger = data.filter(r => r.procurementStatus === 'בסכנה')
    const noPO = data.filter(r => !r.hasPO)
    const noDate = data.filter(r => r.hasPO && r.hasNoDate)

    // By confirmed month
    const byMonth = {}
    data.forEach(r => {
      if (r.confirmedShipDate) {
        const d = new Date(r.confirmedShipDate)
        if (!isNaN(d)) {
          const key = `${d.getMonth() + 1}-${d.getFullYear()}`
          const label = `${MONTHS_HE[d.getMonth() + 1]} ${d.getFullYear().toString().slice(2)}`
          byMonth[key] = { label, count: (byMonth[key]?.count || 0) + 1, month: d.getMonth() + 1, year: d.getFullYear() }
        }
      }
    })
    const monthData = Object.values(byMonth)
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
      .slice(0, 7)

    // BO by customer
    const byCustomer = {}
    bo.forEach(r => {
      const c = r.customerName || 'לא ידוע'
      byCustomer[c] = (byCustomer[c] || 0) + 1
    })
    const customerData = Object.entries(byCustomer)
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 16) + '…' : name, count }))

    // By stage
    const byStage = { 'PRD': 0, 'DR4': 0, 'DR5': 0, 'DR4→DR5': 0, 'DR5→DR4': 0, 'לא ידוע': 0 }
    data.forEach(r => { byStage[r.stage] = (byStage[r.stage] || 0) + 1 })
    const stageData = [
      { name: 'הרכבה PRD', value: byStage['PRD'] },
      { name: 'עיבוד DR4', value: byStage['DR4'] + byStage['DR4→DR5'] },
      { name: 'צבע DR5', value: byStage['DR5'] + byStage['DR5→DR4'] },
      { name: 'לא ידוע', value: byStage['לא ידוע'] },
    ].filter(s => s.value > 0)

    // Bottlenecks - items affecting multiple orders
    const itemOrders = {}
    data.forEach(r => {
      if (!itemOrders[r.itemNumber]) itemOrders[r.itemNumber] = new Set()
      itemOrders[r.itemNumber].add(r.salesOrder)
    })
    const bottlenecks = Object.entries(itemOrders)
      .filter(([, orders]) => orders.size > 1)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 5)
      .map(([item, orders]) => ({
        item,
        count: orders.size,
        isBO: bo.some(r => r.itemNumber === item),
        level: orders.size >= 6 ? 'קריטי' : orders.size >= 3 ? 'בינוני' : 'נמוך',
        levelColor: orders.size >= 6 ? '#A32D2D' : orders.size >= 3 ? '#854F0B' : '#3B6D11',
        levelBg: orders.size >= 6 ? '#FCEBEB' : orders.size >= 3 ? '#FAEEDA' : '#EAF3DE',
      }))

    // PO status
    const poStatus = [
      { name: 'הוזמן', value: data.filter(r => r.hasPO && !r.hasNoDate).length, color: '#639922' },
      { name: 'ללא הזמנה', value: noPO.length, color: '#E24B4A' },
      { name: 'ללא תאריך', value: noDate.length, color: '#EF9F27' },
      { name: 'מאחר', value: data.filter(r => r.isLateReceipt).length, color: '#E24B4A' },
    ]

    const totalUSD = bo.reduce((s, r) => s + (parseFloat(r.salesAmountUSD) || 0), 0)

    return { bo, danger, noPO, noDate, monthData, customerData, stageData, bottlenecks, poStatus, totalUSD }
  }, [data])

  const KPI_COLS = [
    { key: 'itemNumber', label: 'מק"ט' },
    { key: 'salesOrder', label: 'הזמנה' },
    { key: 'lineNumber', label: 'שורה' },
    { key: 'customerName', label: 'לקוח' },
    { key: 'confirmedShipDate', label: 'ת. מאושר', render: v => fmtDate(v) },
    { key: 'procurementStatus', label: 'סטטוס', render: v => <Badge status={v} /> },
  ]

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', flex: 1 }}>סקירה כללית</h1>
        <span style={{ fontSize: 11, color: '#999' }}>לחץ על כרטיס כדי לפתוח רשימה מפורטת</span>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 16 }}>
        <KpiCard label='סה"כ חוסרים' value={data.length} sub='מק"טים פעילים' color='blue'
          items={data} columns={KPI_COLS} />
        <KpiCard label='Back Orders' value={stats.bo.length}
          sub={`$${Math.round(stats.totalUSD).toLocaleString()}`} color='red'
          items={stats.bo} columns={KPI_COLS} />
        <KpiCard label='בסכנת BO' value={stats.danger.length} sub='עד 30 יום' color='amber'
          items={stats.danger} columns={KPI_COLS} />
        <KpiCard label='ללא הזמנת רכש' value={stats.noPO.length} sub='דורש טיפול' color='red'
          items={stats.noPO} columns={KPI_COLS} />
        <KpiCard label='ללא תאריך קבלה' value={stats.noDate.length} sub='הזמנות פתוחות' color='amber'
          items={stats.noDate} columns={KPI_COLS} />
      </div>

      {/* Charts row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <ChartCard title='חוסרים לפי חודש מאושר'>
          <ResponsiveContainer width='100%' height={180}>
            <BarChart data={stats.monthData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
              <XAxis dataKey='label' tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [v, 'חוסרים']} />
              <Bar dataKey='count' radius={[3, 3, 0, 0]}>
                {stats.monthData.map((_, i) => <Cell key={i} fill={COLORS_CHART[i % COLORS_CHART.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title='Back Orders לפי לקוח — TOP 6'>
          <ResponsiveContainer width='100%' height={180}>
            <BarChart data={stats.customerData} layout='vertical' margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <XAxis type='number' tick={{ fontSize: 10 }} />
              <YAxis type='category' dataKey='name' tick={{ fontSize: 10 }} width={100} />
              <Tooltip formatter={(v) => [v, 'BO']} />
              <Bar dataKey='count' fill='#E24B4A' radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.9fr', gap: 12 }}>
        <ChartCard title='צווארי בקבוק — מק"טים קריטיים'>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {stats.bottlenecks.map((bn, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                borderRadius: 6, border: `0.5px solid ${bn.isBO ? '#F09595' : '#e0e0da'}`,
                background: bn.isBO ? '#FCEBEB18' : '#fff',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bn.item}</span>
                <span style={{ fontSize: 10, color: '#888' }}>משפיע על {bn.count} הזמנות</span>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 600, background: bn.levelBg, color: bn.levelColor }}>{bn.level}</span>
              </div>
            ))}
            {stats.bottlenecks.length === 0 && <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: 16 }}>אין צווארי בקבוק</div>}
          </div>
        </ChartCard>

        <ChartCard title='התפלגות לפי שלב ייצור'>
          <ResponsiveContainer width='100%' height={160}>
            <PieChart>
              <Pie data={stats.stageData} cx='50%' cy='50%' innerRadius={40} outerRadius={65}
                dataKey='value' nameKey='name'>
                {stats.stageData.map((_, i) => <Cell key={i} fill={COLORS_CHART[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
            {stats.stageData.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS_CHART[i], flexShrink: 0 }} />
                <span style={{ flex: 1, color: '#555' }}>{s.name}</span>
                <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{s.value}</span>
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
                    <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{s.value}</span>
                  </div>
                  <div style={{ height: 8, background: '#f0f0ea', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${max ? (s.value / max) * 100 : 0}%`, background: s.color, borderRadius: 4, transition: 'width .3s' }} />
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
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}
