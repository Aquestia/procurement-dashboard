import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Sidebar from './components/Sidebar'
import Overview from './pages/Overview'
import ProcurementView from './pages/ProcurementView'
import TapiView from './pages/TapiView'
import BackOrders from './pages/BackOrders'
import Recommendations from './pages/Recommendations'
import Summaries from './pages/Summaries'
import FileManager from './pages/FileManager'
import ImportNotes from './pages/ImportNotes'

export default function App() {
  const [activePage, setActivePage] = useState(() => localStorage.getItem('activePage') || 'overview')
  const [data, setData] = useState(null)
  const [activeFile, setActiveFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState({})
  const [stageSummary, setStageSummary] = useState(null)
  const [financials, setFinancials] = useState(null)

  function handleSetActivePage(page) {
    localStorage.setItem('activePage', page)
    setActivePage(page)
  }

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
    // Build fields to save
    const fields = field === 'both' ? value : { [field]: value }
    const toSave = {
      note_procurement: existing.note_procurement || '',
      note_tapi: existing.note_tapi || '',
      treatment_status: existing.treatment_status || '',
      ...fields,
    }

    // Update local state immediately
    const localUpdated = { ...existing, ...toSave, item_number: itemNumber, sales_order: '', line_number: '' }
    setNotes(prev => ({ ...prev, [itemNumber]: localUpdated }))

    try {
      if (existing.id) {
        // Update existing record
        await supabase.from('procurement_notes').update(toSave).eq('id', existing.id)
      } else {
        // Insert new record
        const { data: inserted } = await supabase.from('procurement_notes').insert({
          item_number: itemNumber,
          sales_order: '',
          line_number: '',
          ...toSave,
        }).select().single()
        if (inserted) setNotes(prev => ({ ...prev, [itemNumber]: inserted }))
      }
    } catch (err) {
      console.error('saveNote error:', err)
    }
  }

  const pages = {
    overview:        <Overview data={data} loading={loading} stageSummary={stageSummary} financials={financials} />,
    procurement:     <ProcurementView data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    tapi:            <TapiView data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    backorders:      <BackOrders data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    recommendations: <Recommendations data={data} notes={notes} loading={loading} />,
    summaries:       <Summaries data={data} loading={loading} />,
    files:           <FileManager activeFile={activeFile} onFileChange={loadActiveFile} />,
    import:          <ImportNotes onDone={loadNotes} />,
  }

  return (
    <div style={{ display:'flex', height:'100vh', direction:'rtl', fontFamily:'Segoe UI, Arial, sans-serif', background:'#f8f8f6' }}>
      <Sidebar activePage={activePage} setActivePage={handleSetActivePage} activeFile={activeFile} data={data} />
      <main style={{ flex:1, overflow:'auto' }}>{pages[activePage]}</main>
    </div>
  )
}
