import React, { useEffect, useRef, useState } from 'react'
import { MousePointer2, Pentagon, Type, MapPin, Route, RotateCcw, RotateCw, Eraser, Circle, Download, Sun, Moon, Search, ChevronDown, Save, ArchiveRestore, X, FileText, Image as ImageIcon, Braces, Eye, Ruler, Square } from 'lucide-react'

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
  unitSelector: {
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
    border: '1px solid var(--border)',
    transition: 'all 0.15s',
  },
  unitOption: {
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    border: '1px solid transparent',
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
  modeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderRadius: '999px',
    border: '1px solid rgba(59,130,246,0.28)',
    background: 'rgba(59,130,246,0.1)',
    color: 'var(--accent)',
    fontSize: '12px',
    fontWeight: 700,
    marginRight: '8px',
  },
  exportWrap: {
    position: 'relative',
  },
  exportMenu: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    width: 'min(440px, calc(100vw - 32px))',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
    boxShadow: '0 20px 48px rgba(2, 6, 23, 0.28)',
    padding: '14px',
    zIndex: 60,
  },
  exportMenuHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
    padding: '2px 2px 8px',
  },
  exportMenuTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  exportCloseBtn: {
    width: '30px',
    height: '30px',
    borderRadius: '999px',
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text-dim)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  exportMenuBtn: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '42px 1fr',
    gap: '12px',
    alignItems: 'center',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '12px 14px',
    color: 'var(--text-primary)',
    textAlign: 'left',
    cursor: 'pointer',
    marginTop: '8px',
  },
  exportMenuIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
  },
  exportMenuText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  exportMenuLabel: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  exportMenuDesc: {
    fontSize: '12px',
    color: 'var(--text-dim)',
    lineHeight: 1.35,
  },
}

const TOOLS = [
  { id: 'polygon', icon: <Pentagon size={14} />, label: 'Draw Zone' },
  { id: 'rectangle', icon: <Square size={14} />, label: 'Rectangle' },
  { id: 'circle', icon: <Circle size={14} />, label: 'Circle' },
  { id: 'text', icon: <MapPin size={14} />, label: 'Pin' },
  { id: 'route', icon: <Route size={14} />, label: 'Route' },
  { id: 'measure', icon: <Ruler size={14} />, label: 'Measure' },
]

export default function Toolbar({
  drawMode,
  onDrawMode,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExport,
  theme,
  onToggleTheme,
  locationQuery,
  onLocationQueryChange,
  onLocationSearch,
  measurementUnit,
  onMeasurementUnitChange,
  eventId,
  eventName,
  isArchived = false,
  isViewOnly = false,
  viewOnlyMinZoom,
  viewOnlyMaxZoom,
  onEnterViewOnly,
  onExitViewOnly,
  onSave,
  onUnarchive,
  onGoHome,
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

  const tools = TOOLS

  return (
    <div style={styles.toolbar}>
      <div
        style={{ ...styles.logo, cursor: onGoHome ? 'pointer' : 'default' }}
        onClick={() => onGoHome?.()}
        title={onGoHome ? 'Go to home' : undefined}
      >
        <div>
          <div style={styles.logoText}>EventWiz</div>
          <div style={styles.logoSub}>{eventName || (eventId ? `Event ID: ${eventId}` : 'Mapping Tool')}{isArchived ? ' • Archived' : ''}</div>
        </div>
      </div>

      {isViewOnly ? (
        <>
          <div style={styles.modeBadge} title="Shared view-only mode is active">
            <Eye size={14} /> View Only • Z{viewOnlyMinZoom}–{viewOnlyMaxZoom}
          </div>
          <button
            style={{ ...styles.themeBtn, marginRight: '8px' }}
            onClick={onExitViewOnly}
            title="Return to editable mode"
          >
            Exit View
          </button>
        </>
      ) : (
        <>
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
            style={{ ...styles.toolBtn, color: canUndo ? 'var(--text-secondary)' : 'var(--text-dim)', opacity: canUndo ? 1 : 0.4 }}
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            onMouseEnter={e => { if (canUndo) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <RotateCcw size={14} />
          </button>

          <button
            style={{ ...styles.toolBtn, color: canRedo ? 'var(--text-secondary)' : 'var(--text-dim)', opacity: canRedo ? 1 : 0.4 }}
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            onMouseEnter={e => { if (canRedo) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <RotateCw size={14} />
          </button>

          <button
            style={{ ...styles.toolBtn, color: drawMode === 'erase' ? 'var(--danger)' : 'var(--text-secondary)' }}
            onClick={() => onDrawMode('erase')}
            title="Erase item"
            onMouseEnter={e => e.currentTarget.style.background = drawMode === 'erase' ? '#fee2e2' : 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Eraser size={14} /> Erase
          </button>

          <div style={styles.divider} />
        </>
      )}

      <button
        style={styles.unitSelector}
        onClick={() => onMeasurementUnitChange?.(measurementUnit === 'meters' ? 'feet' : 'meters')}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--bg-hover)'
          e.currentTarget.style.borderColor = 'var(--border-light)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'var(--bg-secondary)'
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
        title="Toggle between Meters and Feet"
      >
        {measurementUnit === 'meters' ? 'Meters' : 'Feet'}
      </button>

      <div style={styles.rightSection}>
        {!isViewOnly && (
          <div style={styles.searchWrap}>
            <input
              style={styles.searchInput}
              value={locationQuery || ''}
              onChange={(event) => onLocationQueryChange?.(event.target.value)}
              placeholder="Search address or what3words"
              onKeyDown={(event) => {
                if (event.key === 'Enter') onLocationSearch?.()
              }}
            />
          </div>
        )}

        {!isViewOnly && (
          <button
            style={styles.themeBtn}
            onClick={onEnterViewOnly}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.borderColor = 'var(--border-light)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--bg-secondary)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
            title="Open the current map as a locked view-only share mode"
          >
            <Eye size={13} /> View Only
          </button>
        )}

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
        </button>

        {!isViewOnly && (isArchived ? (
          <button
            style={{
              ...styles.exportBtn,
              background: '#f59e0b',
              marginRight: '8px'
            }}
            onClick={onUnarchive}
            onMouseEnter={e => e.currentTarget.style.background = '#d97706'}
            onMouseLeave={e => e.currentTarget.style.background = '#f59e0b'}
            title="Unarchive this event"
          >
            <ArchiveRestore size={13} /> Unarchive
          </button>
        ) : (
          <button
            style={{
              ...styles.exportBtn,
              background: 'var(--success, #10b981)',
              marginRight: '8px'
            }}
            onClick={onSave}
            onMouseEnter={e => e.currentTarget.style.background = '#059669'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--success, #10b981)'}
            title="Save changes to database"
          >
            <Save size={13} /> Save
          </button>
        ))}

        <div style={styles.exportWrap} ref={exportMenuRef}>
          <button
            style={styles.exportBtn}
            onClick={() => setIsExportMenuOpen(open => !open)}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
          >
            <Download size={13} /> Export <ChevronDown size={12} />
          </button>
          {isExportMenuOpen && (
            <div style={styles.exportMenu} onClick={(event) => event.stopPropagation()}>
              <div style={styles.exportMenuHeader}>
                <div style={styles.exportMenuTitle}>
                  <Download size={16} /> Export Project
                </div>
                <button
                  type="button"
                  style={styles.exportCloseBtn}
                  onClick={() => setIsExportMenuOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>

              {[
                { id: 'pdf', label: 'Export as PDF', desc: 'Map + full event summary (zones, routes, assets)', icon: <FileText size={18} />, color: '#ef4444' },
                { id: 'png', label: 'Export as PNG', desc: 'High-resolution map image', icon: <ImageIcon size={18} />, color: '#f59e0b' },
                { id: 'json', label: 'Export as JSON', desc: 'Full project data', icon: <Braces size={18} />, color: '#3b82f6' },
              ].map(item => (
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
                    event.currentTarget.style.background = 'var(--bg-secondary)'
                    event.currentTarget.style.borderColor = 'var(--border)'
                  }}
                >
                  <span style={{ ...styles.exportMenuIcon, background: item.color }}>
                    {item.icon}
                  </span>
                  <span style={styles.exportMenuText}>
                    <span style={styles.exportMenuLabel}>{item.label}</span>
                    <span style={styles.exportMenuDesc}>{item.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
