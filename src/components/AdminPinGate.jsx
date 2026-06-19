import { useState } from 'react'
import { supabase } from '../lib/supabase'

const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxY3Fsa3Bqa2V0Ym9ndXNndG5zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTA4MzA3OSwiZXhwIjoyMDk2NjU5MDc5fQ.-FoHBox7Z7fZhlXZqEK2FqZDu-LwWZLG_e4MWgb4pSc"
const SUPABASE_URL = "https://iqcqlkpjketbogusgtns.supabase.co"

async function hashPin(pin) {
  const enc = new TextEncoder().encode(pin)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}

async function sbService(path, method='GET', body=null) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  return r
}

async function sendResetEmail(email, token) {
  // שלח מייל דרך Supabase Auth (magic link) עם token מובנה בקישור
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'GET',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  })
  // שלח invite/magic link
  const res = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      data: { reset_token: token }
    })
  })
  return res.ok
}

export default function AdminPinGate({ onUnlock, children }) {
  const [mode, setMode] = useState('pin') // pin | forgot | reset | change
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [inputToken, setInputToken] = useState('')
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handlePinSubmit() {
    if (pin.length < 4) return setErr('PIN חייב להיות לפחות 4 ספרות')
    setLoading(true); setErr(null)
    const hash = await hashPin(pin)
    const r = await sbService(`admin_pin?pin_hash=eq.${hash}&select=id`)
    const data = await r.json()
    setLoading(false)
    if (data?.length > 0) {
      sessionStorage.setItem('admin_unlocked', '1')
      onUnlock()
    } else {
      setErr('PIN שגוי')
      setPin('')
    }
  }

  async function handleForgot() {
    setLoading(true); setErr(null)
    const token = Math.random().toString(36).slice(2,10).toUpperCase()
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    // שמור token ב-DB
    const r = await sbService(`admin_pin?id=gt.0`, 'PATCH', {
      reset_token: token,
      reset_token_expires_at: expires
    })
    // שלח מייל
    const mailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ token, email: 'shai.shamai10@gmail.com' })
    })
    setLoading(false)
    setMsg('נשלח קוד לאימייל שלך — בדוק את תיבת הדואר (כולל spam)')
    setMode('reset')
  }

  async function handleReset() {
    if (!inputToken) return setErr('הכנס את הקוד שקיבלת במייל')
    if (newPin.length < 4) return setErr('PIN חייב להיות לפחות 4 ספרות')
    if (newPin !== confirmPin) return setErr('הPINים אינם תואמים')
    setLoading(true); setErr(null)
    // בדוק token
    const r = await sbService(`admin_pin?reset_token=eq.${inputToken}&select=id,reset_token_expires_at`)
    const data = await r.json()
    if (!data?.length) { setLoading(false); return setErr('קוד שגוי או פג תוקף') }
    const expires = new Date(data[0].reset_token_expires_at)
    if (expires < new Date()) { setLoading(false); return setErr('הקוד פג תוקף — בקש קוד חדש') }
    const hash = await hashPin(newPin)
    await sbService(`admin_pin?id=eq.${data[0].id}`, 'PATCH', {
      pin_hash: hash, reset_token: null, reset_token_expires_at: null
    })
    setLoading(false)
    setMsg('✅ PIN עודכן בהצלחה!')
    setMode('pin')
    setNewPin(''); setConfirmPin(''); setInputToken('')
  }

  async function handleChange() {
    if (newPin.length < 4) return setErr('PIN חייב להיות לפחות 4 ספרות')
    if (newPin !== confirmPin) return setErr('הPINים אינם תואמים')
    setLoading(true); setErr(null)
    const hash = await hashPin(newPin)
    await sbService(`admin_pin?id=gt.0`, 'PATCH', { pin_hash: hash })
    setLoading(false)
    setMsg('✅ PIN עודכן בהצלחה!')
    setMode('pin')
    setNewPin(''); setConfirmPin('')
    sessionStorage.removeItem('admin_unlocked')
  }

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'60vh' }}>
      <div style={{ background:'#fff', border:'1px solid #e5e5e0', borderRadius:12, padding:'32px 36px', width:320, boxShadow:'0 4px 20px #0001', textAlign:'center', direction:'rtl' }}>
        <div style={{ fontSize:28, marginBottom:8 }}>🔒</div>
        <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>
          {mode==='pin' ? 'אזור מוגן' : mode==='forgot' ? 'שחזור PIN' : mode==='reset' ? 'הזן קוד ואפס PIN' : 'שנה PIN'}
        </div>
        <div style={{ fontSize:12, color:'#888', marginBottom:20 }}>
          {mode==='pin' ? 'הכנס PIN כדי להמשיך' : mode==='forgot' ? 'קוד שחזור יישלח למייל' : mode==='reset' ? 'הזן את הקוד שקיבלת במייל' : 'הזן PIN חדש'}
        </div>

        {msg && <div style={{ fontSize:12, color:'#3B6D11', background:'#EAFAF1', borderRadius:6, padding:'6px 10px', marginBottom:12 }}>{msg}</div>}
        {err && <div style={{ fontSize:12, color:'#A32D2D', background:'#FCEBEB', borderRadius:6, padding:'6px 10px', marginBottom:12 }}>{err}</div>}

        {mode==='pin' && (<>
          <input type="password" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handlePinSubmit()}
            placeholder="הכנס PIN" maxLength={8}
            style={{ width:'100%', padding:'10px 12px', border:'1px solid #ddd', borderRadius:8, fontSize:18, textAlign:'center', letterSpacing:6, marginBottom:12, boxSizing:'border-box' }} />
          <button onClick={handlePinSubmit} disabled={loading}
            style={{ width:'100%', padding:'10px', background:'#378ADD', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:8 }}>
            {loading ? 'בודק...' : 'כניסה'}
          </button>
          <button onClick={()=>{setMode('forgot');setErr(null);setMsg(null)}}
            style={{ fontSize:11, color:'#378ADD', background:'none', border:'none', cursor:'pointer' }}>שכחתי PIN</button>
        </>)}

        {mode==='forgot' && (<>
          <div style={{ fontSize:12, color:'#555', marginBottom:16 }}>קוד שחזור ישלח אל:<br/><strong>shai.shamai10@gmail.com</strong></div>
          <button onClick={handleForgot} disabled={loading}
            style={{ width:'100%', padding:'10px', background:'#378ADD', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:8 }}>
            {loading ? 'שולח...' : 'שלח קוד לאימייל'}
          </button>
          <button onClick={()=>{setMode('pin');setErr(null);setMsg(null)}}
            style={{ fontSize:11, color:'#888', background:'none', border:'none', cursor:'pointer' }}>חזרה</button>
        </>)}

        {mode==='reset' && (<>
          <input value={inputToken} onChange={e=>setInputToken(e.target.value.toUpperCase())}
            placeholder="קוד מהמייל" maxLength={8}
            style={{ width:'100%', padding:'8px 12px', border:'1px solid #ddd', borderRadius:8, fontSize:14, textAlign:'center', letterSpacing:4, marginBottom:8, boxSizing:'border-box' }} />
          <input type="password" value={newPin} onChange={e=>setNewPin(e.target.value)} placeholder="PIN חדש" maxLength={8}
            style={{ width:'100%', padding:'8px 12px', border:'1px solid #ddd', borderRadius:8, fontSize:14, textAlign:'center', letterSpacing:4, marginBottom:8, boxSizing:'border-box' }} />
          <input type="password" value={confirmPin} onChange={e=>setConfirmPin(e.target.value)} placeholder="אמת PIN" maxLength={8}
            style={{ width:'100%', padding:'8px 12px', border:'1px solid #ddd', borderRadius:8, fontSize:14, textAlign:'center', letterSpacing:4, marginBottom:12, boxSizing:'border-box' }} />
          <button onClick={handleReset} disabled={loading}
            style={{ width:'100%', padding:'10px', background:'#378ADD', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:8 }}>
            {loading ? 'מאפס...' : 'אפס PIN'}
          </button>
          <button onClick={()=>{setMode('pin');setErr(null);setMsg(null)}}
            style={{ fontSize:11, color:'#888', background:'none', border:'none', cursor:'pointer' }}>חזרה</button>
        </>)}
      </div>
    </div>
  )
}

export function ChangePinPanel({ onClose }) {
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleChange() {
    if (newPin.length < 4) return setErr('PIN חייב להיות לפחות 4 ספרות')
    if (newPin !== confirmPin) return setErr('הPINים אינם תואמים')
    setLoading(true); setErr(null)
    const enc = new TextEncoder().encode(newPin)
    const buf = await crypto.subtle.digest('SHA-256', enc)
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
    await fetch(`${SUPABASE_URL}/rest/v1/admin_pin?id=gt.0`, {
      method: 'PATCH',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_hash: hash })
    })
    setLoading(false)
    setMsg('✅ PIN עודכן!')
    setNewPin(''); setConfirmPin('')
    setTimeout(() => { if (onClose) onClose() }, 1500)
  }

  return (
    <div style={{ background:'#f8f8f6', border:'1px solid #e5e5e0', borderRadius:10, padding:16, maxWidth:280, direction:'rtl' }}>
      <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>🔑 שנה PIN</div>
      {msg && <div style={{ fontSize:12, color:'#3B6D11', marginBottom:8 }}>{msg}</div>}
      {err && <div style={{ fontSize:12, color:'#A32D2D', marginBottom:8 }}>{err}</div>}
      <input type="password" value={newPin} onChange={e=>setNewPin(e.target.value)} placeholder="PIN חדש" maxLength={8}
        style={{ width:'100%', padding:'7px 10px', border:'1px solid #ddd', borderRadius:6, fontSize:13, marginBottom:6, boxSizing:'border-box' }} />
      <input type="password" value={confirmPin} onChange={e=>setConfirmPin(e.target.value)} placeholder="אמת PIN חדש" maxLength={8}
        style={{ width:'100%', padding:'7px 10px', border:'1px solid #ddd', borderRadius:6, fontSize:13, marginBottom:10, boxSizing:'border-box' }} />
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={handleChange} disabled={loading}
          style={{ flex:1, padding:'7px', background:'#378ADD', color:'#fff', border:'none', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer' }}>
          {loading ? 'שומר...' : 'שמור'}
        </button>
        {onClose && <button onClick={onClose}
          style={{ padding:'7px 12px', background:'transparent', border:'1px solid #ddd', borderRadius:6, fontSize:12, cursor:'pointer', color:'#888' }}>ביטול</button>}
      </div>
    </div>
  )
}
