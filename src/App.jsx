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

  useEffect(() => {
    loadActiveFile()
    loadNotes()
  }, [])

  async function loadActiveFile() {
    setLoading(true)
    try {
      const { data: files } = await supabase
        .from('procurement_files')
        .select('*')
        .eq('is_active', true)
        .order('uploaded_at', { ascending: false })
        .limit(1)

      if (files && files.length > 0) {
        setActiveFile(files[0])
        // Load all chunks for this file
        const { data: chunks } = await supabase
          .from('procurement_data')
          .select('data')
          .eq('file_id', files[0].id)

        if (chunks && chunks.length > 0) {
          // Merge all chunks
          const merged = chunks.flatMap(c => c.data)
          setData(merged)
        }
      }
    } catch (err) {
      console.error('Error loading file:', err)
    }
    setLoading(false)
  }

  async function loadNotes() {
    try {
      const { data: notesData } = await supabase.from('procurement_notes').select('*')
      if (notesData) {
        const notesMap = {}
        notesData.forEach(n => {
          const key = `${n.item_number}__${n.sales_order}__${n.line_number}`
          notesMap[key] = n
        })
        setNotes(notesMap)
      }
    } catch (err) {
      console.error('Error loading notes:', err)
    }
  }

  async function saveNote(itemNumber, salesOrder, lineNumber, field, value) {
    const key = `${itemNumber}__${salesOrder}__${lineNumber}`
    const existing = notes[key] || {}
    const updated = {
      ...existing,
      item_number: itemNumber,
      sales_order: salesOrder || '',
      line_number: lineNumber || '',
      [field]: value,
      updated_at: new Date().toISOString(),
    }
    await supabase
      .from('procurement_notes')
      .upsert(updated, { onConflict: 'item_number,sales_order,line_number' })
    setNotes(prev => ({ ...prev, [key]: updated }))
  }

  const pages = {
    overview: <Overview data={data} loading={loading} />,
    procurement: <ProcurementView data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    tapi: <TapiView data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    backorders: <BackOrders data={data} notes={notes} saveNote={saveNote} loading={loading} />,
    recommendations: <Recommendations data={data} notes={notes} loading={loading} />,
    summaries: <Summaries data={data} loading={loading} />,
    files: <FileManager activeFile={activeFile} onFileChange={loadActiveFile} />,
  }

  return (
    <div style={{ display: 'flex', height: '100vh', direction: 'rtl', fontFamily: 'Segoe UI, Arial, sans-serif', background: '#f8f8f6' }}>
      <Sidebar activePage={activePage} setActivePage={setActivePage} activeFile={activeFile} data={data} />
      <main style={{ flex: 1, overflow: 'auto' }}>
        {pages[activePage]}
      </main>
    </div>
  )
}
