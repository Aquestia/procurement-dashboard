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

export default function App() {
  const [activePage, setActivePage] = useState('overview')
  const [data, setData] = useState(null)
  const [activeFile, setActiveFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState({})
  const [stageSummary, setStageSummary] = useState(null)

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
        nd.forEach(n => {
          // Key by item_number only (sales_order and line_number are empty)
          map[n.item_number] = n
        })
        setNotes(map)
      }
    } catch (err) { console.error(err) }
  }

  async function saveNote(itemNumber, field, value) {
    const existing = notes[itemNumber] || {}
    const updated = {
      ...existing,
      item_number: itemNumber,
      sales_order: '',
      line_number: '',
      [field]: value,
      updated_at: new Date().toISOString(),
    }
    // Remove id field before upsert to avoid conflict
    const { id, ...upsertData } = updated
    const { error } = await supabase.from('procurement_notes')
      .upsert(upsertData, { onConflict: 'item_number,sales_order,line_number' })
    if (error) console.error('saveNote error:', error)
    // Update local state immediately regardless of DB result
    setNotes(prev => ({ ...prev, [itemNumber]: { ...updated } }))
  }

  const pages = {
    overview:       <Overview data={data} loading={loading} stageSummary={stageSummary} />,
    procurement:    <ProcurementView data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    tapi:           <TapiView data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    backorders:     <BackOrders data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    recommendations:<Recommendations data={data} notes={notes} loading={loading} />,
    summaries:      <Summaries data={data} loading={loading} />,
    files:          <FileManager activeFile={activeFile} onFileChange={loadActiveFile} />,
  }

  return (
    <div style={{ display:'flex', height:'100vh', direction:'rtl', fontFamily:'Segoe UI, Arial, sans-serif', background:'#f8f8f6' }}>
      <Sidebar activePage={activePage} setActivePage={setActivePage} activeFile={activeFile} data={data} />
      <main style={{ flex:1, overflow:'auto' }}>{pages[activePage]}</main>
    </div>
  )
}
