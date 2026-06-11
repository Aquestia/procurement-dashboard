import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { processExcelFile } from '../lib/processExcel'
import { PageWrapper } from '../components/shared'

export default function FileManager({ activeFile, onFileChange }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef()

  useEffect(() => { loadFiles() }, [])

  async function loadFiles() {
    const { data } = await supabase.from('procurement_files').select('*').order('uploaded_at', { ascending: false })
    setFiles(data || [])
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setError('')
    setProgress('קורא קובץ...')

    try {
      const buffer = await file.arrayBuffer()
      setProgress('מעבד נתונים...')
      const processed = processExcelFile(buffer)

      setProgress('שומר בסופאבייס...')
      // Deactivate all existing files
      await supabase.from('procurement_files').update({ is_active: false }).neq('id', 0)

      // Insert new file record
      const { data: fileRecord, error: fileErr } = await supabase
        .from('procurement_files')
        .insert({
          filename: file.name,
          uploaded_at: new Date().toISOString(),
          is_active: true,
          row_count: processed.enriched.length,
        })
        .select()
        .single()

      if (fileErr) throw fileErr

      // Save processed data
      const { error: dataErr } = await supabase
        .from('procurement_data')
        .insert({ file_id: fileRecord.id, data: processed.enriched })

      if (dataErr) throw dataErr

      setProgress('הושלם בהצלחה!')
      await loadFiles()
      onFileChange()
    } catch (err) {
      setError(`שגיאה: ${err.message}`)
      console.error(err)
    }

    setUploading(false)
    setTimeout(() => setProgress(''), 3000)
  }

  async function setActive(id) {
    await supabase.from('procurement_files').update({ is_active: false }).neq('id', id)
    await supabase.from('procurement_files').update({ is_active: true }).eq('id', id)
    await loadFiles()
    onFileChange()
  }

  async function deleteFile(id) {
    if (!confirm('למחוק קובץ זה?')) return
    await supabase.from('procurement_data').delete().eq('file_id', id)
    await supabase.from('procurement_files').delete().eq('id', id)
    await loadFiles()
    onFileChange()
  }

  return (
    <PageWrapper title='ניהול קבצים'>
      {/* Upload area */}
      <div style={{
        background: '#fff', border: '2px dashed #ddd', borderRadius: 10,
        padding: 30, textAlign: 'center', marginBottom: 20, cursor: 'pointer',
      }} onClick={() => !uploading && fileRef.current.click()}>
        <input ref={fileRef} type='file' accept='.xlsx,.xls' style={{ display: 'none' }} onChange={handleUpload} />
        <div style={{ fontSize: 32, marginBottom: 8 }}>📤</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
          {uploading ? progress : 'לחץ להעלאת קובץ Excel'}
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>קבצי XLSX בלבד — הקובץ יהפוך לפעיל אוטומטית</div>
        {error && <div style={{ fontSize: 12, color: '#A32D2D', marginTop: 8 }}>{error}</div>}
        {uploading && (
          <div style={{ marginTop: 12, height: 4, background: '#f0f0ea', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#378ADD', animation: 'progress 2s infinite', width: '60%' }} />
          </div>
        )}
      </div>

      {/* Files list */}
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #e5e5e0', fontSize: 13, fontWeight: 600 }}>
          קבצים שהועלו ({files.length})
        </div>
        {files.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: '#aaa', fontSize: 13 }}>אין קבצים עדיין</div>
        )}
        {files.map(f => (
          <div key={f.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            borderBottom: '0.5px solid #f0f0ea',
            background: f.is_active ? '#f0f6ff' : '#fff',
          }}>
            <div style={{ fontSize: 20 }}>📄</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{f.filename}</div>
              <div style={{ fontSize: 11, color: '#888' }}>
                {new Date(f.uploaded_at).toLocaleString('he-IL')} · {f.row_count?.toLocaleString()} שורות
              </div>
            </div>
            {f.is_active && (
              <span style={{ fontSize: 11, background: '#EAF3DE', color: '#3B6D11', padding: '3px 10px', borderRadius: 10, fontWeight: 600 }}>
                פעיל
              </span>
            )}
            {!f.is_active && (
              <button onClick={() => setActive(f.id)} style={{
                fontSize: 12, padding: '4px 10px', border: '0.5px solid #378ADD',
                borderRadius: 6, background: 'transparent', color: '#378ADD', cursor: 'pointer'
              }}>הפעל</button>
            )}
            <button onClick={() => deleteFile(f.id)} style={{
              fontSize: 12, padding: '4px 10px', border: '0.5px solid #ddd',
              borderRadius: 6, background: 'transparent', color: '#A32D2D', cursor: 'pointer'
            }}>מחק</button>
          </div>
        ))}
      </div>
    </PageWrapper>
  )
}
