import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Sidebar from './components/Sidebar'
import Overview from './pages/Overview'
import ProcurementView from './pages/ProcurementView'
import TapiView from './pages/TapiView'
import BackOrders from './pages/BackOrders'
import Recommendations from './pages/Recommendations'
import FileManager from './pages/FileManager'
import ImportNotes from './pages/ImportNotes'
import TapiRequests from './pages/TapiRequests'
import AirShipment from './pages/AirShipment'
import AdminPinGate, { ChangePinPanel } from './components/AdminPinGate'

export default function App() {
  const [activePage, setActivePage]     = useState(() => localStorage.getItem('activePage') || 'overview')
  const [data, setData]                 = useState(null)
  const [activeFile, setActiveFile]     = useState(null)
  const [loading, setLoading]           = useState(true)
  const [notes, setNotes]               = useState({})
  const [stageSummary, setStageSummary] = useState(null)
  const [financials, setFinancials]     = useState(null)
  const [adminUnlocked, setAdminUnlocked] = useState(() => sessionStorage.getItem('admin_unlocked') === '1')
  const [showChangePin, setShowChangePin] = useState(false)


  function handleSetActivePage(page) {
    localStorage.setItem('activePage', page)
    setActivePage(page)
  }

  useEffect(() => {
    // Remove any dark mode class that may have been set previously
    document.documentElement.classList.remove('dark')
    localStorage.removeItem('aq-theme')
  }, [])

  useEffect(() => { loadActiveFile(); loadNotes() }, [])

  async function loadActiveFile() {
    setLoading(true)
    try {
      const { data: files } = await supabase
        .from('procurement_files').select('*')
        .eq('is_active', true).order('uploaded_at', { ascending: false }).limit(1)

      if (files && files.length > 0) {
        setActiveFile(files[0])
        const { data: chunks } = await supabase
          .from('procurement_data').select('data').eq('file_id', files[0].id)
        if (chunks && chunks.length > 0) {
          const all = chunks.flatMap(c => c.data)
          const meta = all.find(r => r.__meta)
          const items = all.filter(r => !r.__meta)
          setStageSummary(meta?.stageSummary || null)
          setFinancials(meta?.financials || null)
          setData(items)
        }
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  async function loadNotes() {
    try {
      const { data: nd } = await supabase.from('procurement_notes').select('*')
      if (nd) {
        const map = {}
        nd.forEach(n => { map[n.item_number] = n })
        setNotes(map)
      }
    } catch (err) { console.error(err) }
  }

  async function saveNote(itemNumber, field, value) {
    if (!itemNumber) return
    const existing = notes[itemNumber] || {}
    const fields = field === 'both' ? value : { [field]: value }
    const toSave = {
      note_procurement:  existing.note_procurement  || '',
      note_tapi:         existing.note_tapi         || '',
      treatment_status:  existing.treatment_status  || '',
      air_status:        existing.air_status        || '',
      air_note:          existing.air_note          || '',
      ...fields,
    }
    const localUpdated = { ...existing, ...toSave, item_number: itemNumber, sales_order: '', line_number: '' }
    setNotes(prev => ({ ...prev, [itemNumber]: localUpdated }))
    try {
      if (existing.id) {
        await supabase.from('procurement_notes').update(toSave).eq('id', existing.id)
      } else {
        const { data: inserted } = await supabase.from('procurement_notes').insert({
          item_number: itemNumber, sales_order: '', line_number: '', ...toSave,
        }).select().single()
        if (inserted) setNotes(prev => ({ ...prev, [itemNumber]: inserted }))
      }
    } catch (err) { console.error('saveNote error:', err) }
  }

  const pages = {
    overview:        <Overview data={data} loading={loading} stageSummary={stageSummary} financials={financials} notes={notes} saveNote={saveNote} />,
    procurement:     <ProcurementView data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    tapi:            <TapiView data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    backorders:      <BackOrders data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    recommendations: <Recommendations data={data} notes={notes} loading={loading} />,
    air_shipment:    <AirShipment data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    tapi_requests:   <TapiRequests />,
    files:           adminUnlocked
      ? <FileManager activeFile={activeFile} onFileChange={loadActiveFile} />
      : <AdminPinGate onUnlock={() => setAdminUnlocked(true)} />,
    import:          adminUnlocked
      ? <ImportNotes onDone={loadNotes} />
      : <AdminPinGate onUnlock={() => setAdminUnlocked(true)} />,
  }

  return (
    <div style={{
      display: 'flex', height: '100vh', direction: 'rtl',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      background: 'var(--bg-page)', transition: 'background 0.3s',
    }}>
      <Sidebar
        activePage={activePage}
        setActivePage={handleSetActivePage}
        activeFile={activeFile}
        data={data}
        adminUnlocked={adminUnlocked}
        onLock={() => { setAdminUnlocked(false); sessionStorage.removeItem('admin_unlocked') }}
        onChangePinClick={() => setShowChangePin(s => !s)}
      />
      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-page)', transition: 'background 0.3s' }}>
        {showChangePin && adminUnlocked && (
          <div style={{ padding: '16px 24px 0' }}>
            <ChangePinPanel onClose={() => setShowChangePin(false)} />
          </div>
        )}
        {pages[activePage]}
      </main>
    </div>
  )
}
