import React, { useEffect, useRef, useState } from 'react'
import { MousePointer2, Pentagon, Minus, Type, Route, RotateCcw, Trash2, Download, Sun, Moon, Search, Copy, ChevronDown } from 'lucide-react'

const styles = {
  toolbar: {
    height: '52px',
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: '4px',
    flexShrink: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginRight: '16px',
    paddingRight: '16px',
    borderRight: '1px solid var(--border)',
  },
  logoText: {
    fontFamily: 'var(--font-mono)',
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--accent)',
    letterSpacing: '-0.02em',
  },
  logoSub: {
    fontSize: '10px',
    color: 'var(--text-dim)',
    fontWeight: '400',
  },
  divider: {
    width: '1px',
    height: '24px',
    background: 'var(--border)',
    margin: '0 6px',
  },
  toolBtn: {
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    transition: 'all 0.15s',
    cursor: 'pointer',
    border: '1px solid transparent',
  },
  activeToolBtn: {
    background: 'var(--accent-dim)',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
  },
  rightSection: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginRight: '8px',
  },
  searchInput: {
    width: '280px',
    height: '34px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    padding: '0 10px',
    outline: 'none',
  },
  themeBtn: {
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    border: '1px solid var(--border)',
    transition: 'all 0.15s',
  },
  exportBtn: {
    padding: '6px 14px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    cursor: 'pointer',
    border: 'none',
    transition: 'background 0.15s',
  },
  exportWrap: {
    position: 'relative',
  },
  exportMenu: {
    position: 'absolute',
    top: '40px',
    right: 0,
    minWidth: '138px',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    boxShadow: '0 14px 32px rgba(2, 6, 23, 0.24)',
    padding: '6px',
    zIndex: 30,
  },
  exportMenuBtn: {
    width: '100%',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '8px',
    padding: '7px 8px',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 600,
    textAlign: 'left',
    cursor: 'pointer',
  },
}

export default function Toolbar({
  drawMode,
  onDrawMode,
  onUndo,
  onDelete,
  onDuplicate,
  hasSelection,
  canDuplicate,
  onExport,
  theme,
  onToggleTheme,
  mapViewMode,
  onToggleMapViewMode,
  locationQuery,
  onLocationQueryChange,
  onLocationSearch,
}) {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const exportMenuRef = useRef(null)

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!exportMenuRef.current?.contains(event.target)) {
        setIsExportMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleOutsideClick)
    return () => window.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const tools = [
    { id: 'select', icon: <MousePointer2 size={14} />, label: 'Select' },
    { id: 'polygon', icon: <Pentagon size={14} />, label: 'Draw Zone' },
    { id: 'route', icon: <Route size={14} />, label: 'Route' },
    { id: 'line', icon: <Minus size={14} />, label: 'Line' },
    { id: 'text', icon: <Type size={14} />, label: 'Text' },
  ]

  return (
    <div style={styles.toolbar}>
      <div style={styles.logo}>
        <div>
          <div style={styles.logoText}>EventWiz</div>
          <div style={styles.logoSub}>Mapping Tool</div>
        </div>
      </div>

      {tools.map(t => (
        <button
          key={t.id}
          style={{ ...styles.toolBtn, ...(drawMode === t.id ? styles.activeToolBtn : {}) }}
          onClick={() => onDrawMode(t.id)}
          onMouseEnter={e => { if (drawMode !== t.id) e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => { if (drawMode !== t.id) e.currentTarget.style.background = 'transparent' }}
        >
          {t.icon} {t.label}
        </button>
      ))}

      <div style={styles.divider} />

      <button
        style={{ ...styles.toolBtn, color: 'var(--text-dim)' }}
        onClick={onUndo}
        title="Undo"
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <RotateCcw size={14} />
      </button>

      {hasSelection && (
        <>
          {canDuplicate && (
            <button
              style={{ ...styles.toolBtn, color: 'var(--accent)' }}
              onClick={onDuplicate}
              title="Duplicate selected asset"
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-dim)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Copy size={14} /> Duplicate
            </button>
          )}
        <button
          style={{ ...styles.toolBtn, color: 'var(--danger)' }}
          onClick={onDelete}
          title="Delete selected"
          onMouseEnter={e => e.currentTarget.style.background = '#f8717118'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Trash2 size={14} /> Delete
        </button>
        </>
      )}

      <div style={styles.rightSection}>
        <div style={styles.searchWrap}>
          <input
            style={styles.searchInput}
            value={locationQuery || ''}
            onChange={(event) => onLocationQueryChange?.(event.target.value)}
            placeholder="Search address or what3words (filled.count.soap)"
            onKeyDown={(event) => {
              if (event.key === 'Enter') onLocationSearch?.()
            }}
          />
          <button
            style={styles.themeBtn}
            onClick={onLocationSearch}
            title="Focus map to searched location"
          >
            <Search size={13} /> Go
          </button>
        </div>
        <button
          style={{
            ...styles.themeBtn,
            background: mapViewMode === '3d' ? 'var(--accent-dim)' : 'var(--bg-secondary)',
            color: mapViewMode === '3d' ? 'var(--accent)' : 'var(--text-secondary)',
            borderColor: mapViewMode === '3d' ? 'var(--accent)' : 'var(--border)',
          }}
          onClick={onToggleMapViewMode}
          title={mapViewMode === '3d' ? 'Switch to 2D view' : 'Switch to 3D view'}
        >
          {mapViewMode === '3d' ? '3D' : '2D'}
        </button>
        <button
          style={styles.themeBtn}
          onClick={onToggleTheme}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.borderColor = 'var(--border-light)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--bg-secondary)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <div style={styles.exportWrap} ref={exportMenuRef}>
          <button
            style={styles.exportBtn}
            onClick={() => setIsExportMenuOpen(prev => !prev)}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
          >
            <Download size={13} /> Export <ChevronDown size={12} />
          </button>
          {isExportMenuOpen && (
            <div style={styles.exportMenu}>
              {[{ id: 'png', label: 'Export PNG' }, { id: 'pdf', label: 'Export PDF' }, { id: 'json', label: 'Export JSON' }].map(item => (
                <button
                  key={item.id}
                  style={styles.exportMenuBtn}
                  onClick={() => {
                    onExport?.(item.id)
                    setIsExportMenuOpen(false)
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = 'var(--bg-hover)'
                    event.currentTarget.style.borderColor = 'var(--border-light)'
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = 'transparent'
                    event.currentTarget.style.borderColor = 'transparent'
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
