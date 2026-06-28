const NAV_ITEMS = [
  { id: 'overview',        icon: '📊', label: 'סקירה כללית' },
  { id: 'procurement',     icon: '🛒', label: 'מבט רכש' },
  { id: 'tapi',            icon: '🔧', label: 'מבט תפ"י' },
  { id: 'backorders',      icon: '⚠️', label: 'Back Orders' },
  { id: 'recommendations', icon: '💡', label: 'המלצות' },
  { id: 'air_shipment',    icon: '✈️', label: 'פריטים להטסה' },
  { id: 'tapi_requests',   icon: '📋', label: 'בקשות רכש תפ"י' },
]

export default function Sidebar({ activePage, setActivePage, activeFile, data, adminUnlocked, onLock, onChangePinClick, darkMode, toggleDarkMode }) {
  const boCount = data?.filter(r => r.isBO)?.length || 0

  const navBtn = (id, icon, label, badge) => {
    const isActive = activePage === id
    return (
      <button
        key={id}
        onClick={() => setActivePage(id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '8px 14px',
          background: isActive ? 'var(--blue-bg)' : 'transparent',
          border: 'none',
          borderRight: isActive ? '3px solid var(--blue-dark)' : '3px solid transparent',
          color: isActive ? 'var(--blue-dark)' : 'var(--text-sub)',
          fontWeight: isActive ? 600 : 400,
          fontSize: 13, cursor: 'pointer', textAlign: 'right',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {badge}
      </button>
    )
  }

  return (
    <aside style={{
      width: 215,
      background: 'var(--bg-sidebar)',
      borderLeft: '1px solid var(--border-card)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      {/* Logo */}
      <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid var(--border-card)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>ניהול חוסרים</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Aquestia Group</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, color: 'var(--text-hint)', padding: '6px 14px 4px', textTransform: 'uppercase', letterSpacing: '.5px' }}>
          תפריט ראשי
        </div>
        {NAV_ITEMS.map(item =>
          navBtn(
            item.id, item.icon, item.label,
            item.id === 'backorders' && boCount > 0
              ? <span style={{ fontSize: 10, background: 'var(--red-bg)', color: 'var(--red-dark)', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>{boCount}</span>
              : null
          )
        )}

        <div style={{ fontSize: 10, color: 'var(--text-hint)', padding: '10px 14px 4px', textTransform: 'uppercase', letterSpacing: '.5px', borderTop: '1px solid var(--border-card)', marginTop: 8 }}>
          ניהול
        </div>
        {navBtn('files',  '📁', 'ניהול קבצים')}
        {navBtn('import', '📥', 'ייבוא הערות')}
      </nav>

      {/* Active file */}
      {activeFile && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-card)', background: 'var(--bg-row)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>קובץ פעיל:</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-main)', marginTop: 2, wordBreak: 'break-all' }}>{activeFile.filename}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {new Date(activeFile.uploaded_at).toLocaleDateString('he-IL')}
          </div>
        </div>
      )}

      {/* Admin buttons */}
      {adminUnlocked && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-card)', display: 'flex', gap: 6 }}>
          <button onClick={onChangePinClick} style={{
            flex: 1, fontSize: 11, padding: '5px', border: '1px solid var(--border-light)',
            borderRadius: 6, background: 'transparent', color: 'var(--text-sub)', cursor: 'pointer',
          }}>🔑 שנה PIN</button>
          <button onClick={() => { sessionStorage.removeItem('admin_unlocked'); onLock() }} style={{
            fontSize: 11, padding: '5px 8px', border: '1px solid var(--border-light)',
            borderRadius: 6, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
          }}>🔒</button>
        </div>
      )}

      {/* Dark mode toggle */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-card)' }}>
        <button onClick={toggleDarkMode} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8,
          border: '2px solid var(--blue-dark)',
          background: 'var(--blue-dark)', color: '#fff',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          justifyContent: 'center', transition: 'all 0.2s',
        }}>
          <span style={{ fontSize: 14 }}>{darkMode ? '☀️' : '🌙'}</span>
          <span>{darkMode ? 'מצב יום' : 'מצב לילה'}</span>
        </button>
      </div>
    </aside>
  )
}
