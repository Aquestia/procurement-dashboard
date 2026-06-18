const NAV_ITEMS = [
  { id: 'overview', icon: '📊', label: 'סקירה כללית' },
  { id: 'procurement', icon: '🛒', label: 'מבט רכש' },
  { id: 'tapi', icon: '🔧', label: 'מבט תפ"י' },
  { id: 'backorders', icon: '⚠️', label: 'Back Orders' },
  { id: 'recommendations', icon: '💡', label: 'המלצות' },
  { id: 'summaries', icon: '📈', label: 'סיכומים' },
]

export default function Sidebar({ activePage, setActivePage, activeFile, data }) {
  const boCount = data?.filter(r => r.isBO)?.length || 0

  return (
    <aside style={{
      width: 210,
      background: '#fff',
      borderLeft: '0.5px solid #e5e5e0',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div style={{ padding: '18px 14px 12px', borderBottom: '0.5px solid #e5e5e0' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>ניהול חוסרים</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Aquestia Group</div>
      </div>

      <nav style={{ flex: 1, padding: '8px 0' }}>
        <div style={{ fontSize: 10, color: '#aaa', padding: '6px 14px 4px', textTransform: 'uppercase', letterSpacing: '.5px' }}>תפריט ראשי</div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setActivePage(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 14px',
              background: activePage === item.id ? '#f0f6ff' : 'transparent',
              border: 'none',
              borderRight: activePage === item.id ? '3px solid #378ADD' : '3px solid transparent',
              color: activePage === item.id ? '#185FA5' : '#555',
              fontWeight: activePage === item.id ? 600 : 400,
              fontSize: 13, cursor: 'pointer', textAlign: 'right',
            }}
          >
            <span style={{ fontSize: 15 }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.id === 'backorders' && boCount > 0 && (
              <span style={{ fontSize: 10, background: '#FCEBEB', color: '#A32D2D', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>
                {boCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div style={{ borderTop: '0.5px solid #e5e5e0', padding: '8px 0' }}>
        <div style={{ fontSize: 10, color: '#aaa', padding: '6px 14px 4px', textTransform: 'uppercase', letterSpacing: '.5px' }}>ניהול</div>
        <button
          onClick={() => setActivePage('files')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '8px 14px',
            background: activePage === 'files' ? '#f0f6ff' : 'transparent',
            border: 'none',
            borderRight: activePage === 'files' ? '3px solid #378ADD' : '3px solid transparent',
            color: activePage === 'files' ? '#185FA5' : '#555',
            fontWeight: activePage === 'files' ? 600 : 400,
            fontSize: 13, cursor: 'pointer', textAlign: 'right',
          }}
        >
          <span style={{ fontSize: 15 }}>📁</span>
          <span>ניהול קבצים</span>
        </button>
        <button
          onClick={() => setActivePage('import')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '8px 14px',
            background: activePage === 'import' ? '#f0f6ff' : 'transparent',
            border: 'none',
            borderRight: activePage === 'import' ? '3px solid #378ADD' : '3px solid transparent',
            color: activePage === 'import' ? '#185FA5' : '#555',
            fontWeight: activePage === 'import' ? 600 : 400,
            fontSize: 13, cursor: 'pointer', textAlign: 'right',
          }}
        >
          <span style={{ fontSize: 15 }}>📥</span>
          <span>ייבוא הערות</span>
        </button>
      </div>

      {activeFile && (
        <div style={{ padding: '10px 14px', borderTop: '0.5px solid #e5e5e0', background: '#fafaf8' }}>
          <div style={{ fontSize: 10, color: '#aaa' }}>קובץ פעיל:</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#1a1a1a', marginTop: 2, wordBreak: 'break-all' }}>{activeFile.filename}</div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
            {new Date(activeFile.uploaded_at).toLocaleDateString('he-IL')}
          </div>
        </div>
      )}
    </aside>
  )
}
