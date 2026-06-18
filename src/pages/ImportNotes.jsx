import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

export default function ImportNotes({ onDone }) {
  const [status, setStatus] = useState('idle') // idle | processing | done | error
  const [log, setLog] = useState([])
  const [stats, setStats] = useState(null)
  const fileRef = useRef()

  function addLog(msg) {
    setLog(prev => [...prev, msg])
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setStatus('processing')
    setLog([])
    setStats(null)

    try {
      // קרא את האקסל
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      addLog(`✅ נטען הקובץ: ${file.name}`)
      addLog(`📋 סה"כ שורות: ${rows.length - 1}`)

      // קבץ לפי מק"ט
      const procMap = {}
      const tapiMap = {}

      for (let i = 1; i < rows.length; i++) {
        const [item, noteProc, noteTapi] = rows[i]
        if (!item || String(item).trim() === '') continue
        const key = String(item).trim()

        const cleanProc = String(noteProc || '').trim().replace(/\u00a0/g, '')
        const cleanTapi = String(noteTapi || '').trim().replace(/\u00a0/g, '')

        if (cleanProc) {
          if (!procMap[key]) procMap[key] = []
          procMap[key].push(cleanProc)
        }
        if (cleanTapi) {
          if (!tapiMap[key]) tapiMap[key] = []
          tapiMap[key].push(cleanTapi)
        }
      }

      const allItems = [...new Set([...Object.keys(procMap), ...Object.keys(tapiMap)])]
      addLog(`🔢 מק"טים ייחודיים: ${allItems.length}`)

      // טען הערות קיימות מ-DB
      addLog('🔄 טוען נתונים קיימים מה-DB...')
      const { data: existing } = await supabase
        .from('procurement_notes')
        .select('id, item_number')
        .in('item_number', allItems)

      const existingMap = {}
      if (existing) existing.forEach(r => { existingMap[r.item_number] = r.id })

      let updated = 0, inserted = 0, errors = 0

      // עדכן / הכנס
      for (const item of allItems) {
        const procList = procMap[item] || []
        const tapiList = tapiMap[item] || []

        const mergedProc = procList.map((n, i) => procList.length === 1 ? n : `הערה ${i + 1}: ${n}`).join('\n')
        const mergedTapi = tapiList.map((n, i) => tapiList.length === 1 ? n : `הערה ${i + 1}: ${n}`).join('\n')

        const payload = {}
        if (mergedProc) payload.note_procurement = mergedProc
        if (mergedTapi) payload.note_tapi = mergedTapi

        if (Object.keys(payload).length === 0) continue

        if (existingMap[item]) {
          // UPDATE
          const { error } = await supabase
            .from('procurement_notes')
            .update(payload)
            .eq('id', existingMap[item])
          if (error) { errors++; addLog(`❌ שגיאה: ${item}`) }
          else updated++
        } else {
          // INSERT
          const { error } = await supabase
            .from('procurement_notes')
            .insert({
              item_number: item,
              sales_order: '',
              line_number: '',
              treatment_status: '',
              ...payload
            })
          if (error) { errors++; addLog(`❌ שגיאה: ${item}`) }
          else inserted++
        }
      }

      setStats({ updated, inserted, errors, total: allItems.length })
      addLog(`✅ עודכנו: ${updated}`)
      addLog(`✅ נוספו חדשים: ${inserted}`)
      if (errors > 0) addLog(`❌ שגיאות: ${errors}`)
      addLog('🎉 הסתיים!')
      setStatus('done')
      if (onDone) onDone()

    } catch (err) {
      addLog(`❌ שגיאה: ${err.message}`)
      setStatus('error')
    }

    // אפס את ה-input
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: '0 auto', direction: 'rtl', fontFamily: 'sans-serif' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: '#1a1a1a' }}>📥 ייבוא הערות מאקסל</h2>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>
        העלה קובץ Excel עם עמודות: <strong>Item number</strong>, <strong>הערת רכש</strong>, <strong>הערת תפ"י</strong>.<br />
        אם מק"ט מופיע כמה פעמים — ההערות ישורשרו אוטומטית.
      </p>

      <label style={{
        display: 'inline-block', padding: '10px 20px',
        background: status === 'processing' ? '#ccc' : '#378ADD',
        color: '#fff', borderRadius: 8, cursor: status === 'processing' ? 'not-allowed' : 'pointer',
        fontSize: 14, fontWeight: 600, marginBottom: 24
      }}>
        {status === 'processing' ? '⏳ מעבד...' : '📂 בחר קובץ Excel'}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          disabled={status === 'processing'}
          onChange={handleFile}
        />
      </label>

      {log.length > 0 && (
        <div style={{
          background: '#f8f8f6', border: '1px solid #e5e5e0', borderRadius: 8,
          padding: 16, fontSize: 13, lineHeight: 1.8, marginBottom: 16
        }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {stats && (
        <div style={{
          display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap'
        }}>
          <div style={{ background: '#EAF4FF', borderRadius: 8, padding: '12px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#185FA5' }}>{stats.updated}</div>
            <div style={{ fontSize: 12, color: '#555' }}>עודכנו</div>
          </div>
          <div style={{ background: '#EAFAF1', borderRadius: 8, padding: '12px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1A7A4A' }}>{stats.inserted}</div>
            <div style={{ fontSize: 12, color: '#555' }}>נוספו חדשים</div>
          </div>
          {stats.errors > 0 && (
            <div style={{ background: '#FCEBEB', borderRadius: 8, padding: '12px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#A32D2D' }}>{stats.errors}</div>
              <div style={{ fontSize: 12, color: '#555' }}>שגיאות</div>
            </div>
          )}
        </div>
      )}

      {status === 'done' && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => { setStatus('idle'); setLog([]); setStats(null) }}
            style={{
              padding: '8px 16px', background: '#f0f0ec', border: '1px solid #ddd',
              borderRadius: 6, cursor: 'pointer', fontSize: 13
            }}
          >
            ייבוא נוסף
          </button>
        </div>
      )}
    </div>
  )
}
