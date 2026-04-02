import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Layers, Package, ChevronDown, ChevronRight, ChevronLeft, Eye, EyeOff, Lock, Unlock, Folder } from 'lucide-react'
import AssetGlyph from './AssetGlyph'
import { ALL_ASSETS, ASSET_CATEGORIES, ASSET_LIBRARY_FILTERS } from '../data/assets'

const RECENT_ASSET_STORAGE_KEY = 'eventwiz-recent-assets-v1'

function groupItemsByParent(items) {
  return items.reduce((groups, item) => {
    const parentKey = item.parentId || '__root__'
    if (!groups[parentKey]) groups[parentKey] = []
    groups[parentKey].push(item)
    return groups
  }, {})
}

const styles = {
  sidebar: {
    width: '280px',
    minWidth: '280px',
    background: 'var(--bg-panel)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  sidebarCollapsed: {
    width: '40px',
    minWidth: '40px',
    background: 'var(--bg-panel)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '10px',
  },
  collapsedStack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  collapsedDivider: {
    width: '22px',
    height: '1px',
    background: 'var(--border)',
    margin: '2px 0',
  },
  collapsedIconBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  },
  collapseBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
    padding: '8px 8px 0',
    gap: '4px',
  },
  tab: {
    flex: 1,
    padding: '8px 4px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: '500',
    borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    transition: 'all 0.15s',
    cursor: 'pointer',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderWidth: '0px 0px 2px 0px',
  },
  activeTab: {
    background: 'var(--bg-hover)',
    color: 'var(--accent)',
    borderBottomColor: 'var(--accent)',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 0',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  assetGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '8px',
    marginBottom: '12px',
  },
  assetCard: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '10px 12px',
    cursor: 'grab',
    transition: 'all 0.15s',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  assetIcon: {
    width: '34px',
    height: '34px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-panel)',
    fontSize: '20px',
    lineHeight: 1,
    flexShrink: 0,
  },
  assetName: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    lineHeight: 1.3,
  },
  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '10px',
  },
  filterChip: {
    padding: '6px 10px',
    borderRadius: '999px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  recentGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginBottom: '12px',
  },
  miniAssetCard: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  zoneItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px',
    borderRadius: '12px',
    marginBottom: '10px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
  },
  styleBox: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '12px',
  },
  styleGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginTop: '10px',
  },
  styleLabel: {
    display: 'block',
    fontSize: '10px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '5px',
    fontWeight: 700,
  },
  styleInput: {
    width: '100%',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    padding: '8px',
    fontSize: '12px',
  },
  previewChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 8px',
    borderRadius: '999px',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  colorDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  iconBtn: {
    background: 'var(--bg-panel)',
    color: 'var(--text-dim)',
    width: '30px',
    height: '30px',
    padding: '0',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s',
    cursor: 'pointer',
    border: '1px solid var(--border)',
  },
  floorCard: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px',
    marginBottom: '12px',
  },
  floorInput: {
    width: '100%',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    padding: '8px',
    fontSize: '11px',
    marginTop: '8px',
  },
  floorBtn: {
    width: '100%',
    marginTop: '8px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
    border: 'none',
  },
  floorMeta: {
    fontSize: '11px',
    color: 'var(--text-dim)',
    lineHeight: 1.5,
  },
  treeWrap: {
    marginTop: '6px',
  },
  treeHeader: {
    fontSize: '10px',
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '8px',
    fontWeight: 700,
  },
  folderNode: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '10px',
    marginBottom: '6px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
  },
  folderLabelWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  folderLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: '12px',
    color: 'var(--text-primary)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  folderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  treeNode: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 8px',
    borderRadius: '10px',
    cursor: 'pointer',
    marginBottom: '4px',
  },
  treeChildren: {
    marginLeft: '16px',
    paddingLeft: '10px',
    borderLeft: '1px dashed var(--border)',
    marginBottom: '8px',
  },
  treeLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: '12px',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  treeMeta: {
    fontSize: '10px',
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
}

export default function Sidebar({
  collapsed = false,
  onToggleCollapse,
  drawMode,
  onDrawMode,
  onAssetDragStart,
  onAssetDragEnd,
  pendingAssetDef,
  onAssetClickPlace,
  zones = [],
  assets = [],
  lines = [],
  annotations = [],
  selectedId,
  onSelectItem,
  floorPlan,
  placingFloor,
  onFloorPlanUpload,
  onStartFloorPlacement,
  onFloorOpacityChange,
  layers,
  onToggleLayer,
  onToggleLock,
  selectedZoneType,
  onZoneTypeChange,
  lineStyle,
  onLineStyleChange,
  textStyle,
  onTextStyleChange,
  annotationDraftText,
  onAnnotationDraftTextChange,
}) {
  const [activeTab, setActiveTab] = useState('assets')
  const [expandedCats, setExpandedCats] = useState({ 'Performance': true, 'Access & Security': true })
  const [assetSearch, setAssetSearch] = useState('')
  const [assetFilter, setAssetFilter] = useState('all')
  const [assetColorOverride, setAssetColorOverride] = useState('')
  const [recentAssetIds, setRecentAssetIds] = useState(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_ASSET_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [expandedZones, setExpandedZones] = useState({})
  const isDraggingAssetRef = useRef(false)
  const [expandedFolders, setExpandedFolders] = useState({
    zones: true,
    assets: true,
    annotations: true,
    floor: true,
    lines: true,
  })

  const toggleCat = (cat) => setExpandedCats(p => ({ ...p, [cat]: !p[cat] }))
  const toggleZone = (zoneId) => setExpandedZones(prev => ({ ...prev, [zoneId]: !prev[zoneId] }))
  const toggleFolder = (folderId) => setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }))

  useEffect(() => {
    try {
      window.localStorage.setItem(RECENT_ASSET_STORAGE_KEY, JSON.stringify(recentAssetIds.slice(0, 8)))
    } catch {
      // ignore storage failures
    }
  }, [recentAssetIds])

  const assetLookup = useMemo(() => {
    const lookup = new Map()
    ALL_ASSETS.forEach(asset => {
      lookup.set(asset.id, asset)
    })
    return lookup
  }, [])

  const recentAssets = useMemo(() => (
    recentAssetIds
      .map(assetId => assetLookup.get(assetId))
      .filter(Boolean)
  ), [assetLookup, recentAssetIds])

  const assetsByParent = useMemo(() => groupItemsByParent(assets), [assets])
  const linesByParent = useMemo(() => groupItemsByParent(lines), [lines])
  const annotationsByParent = useMemo(() => groupItemsByParent(annotations), [annotations])

  const rootZones = useMemo(() => zones.filter(zone => !zone.parentId), [zones])
  const unassignedAssets = assetsByParent.__root__ || []
  const unassignedAnnotations = annotationsByParent.__root__ || []
  const unassignedLines = linesByParent.__root__ || []

  const rememberAsset = (assetId) => {
    setRecentAssetIds(prev => [assetId, ...prev.filter(id => id !== assetId)].slice(0, 8))
  }

  const buildAssetVariant = (asset) => {
    if (!assetColorOverride) return asset
    return {
      ...asset,
      color: assetColorOverride,
      iconColor: assetColorOverride,
    }
  }

  const matchesAssetFilter = (asset) => (
    assetFilter === 'all'
    || asset.libraryTags?.includes(assetFilter)
    || asset.category?.toLowerCase().includes(assetFilter)
  )

  const matchesAssetSearch = (asset, categoryLabel) => {
    const query = assetSearch.trim().toLowerCase()
    if (!query) return true
    const haystack = [
      asset.name,
      asset.id,
      asset.icon,
      categoryLabel,
      ...(asset.keywords || []),
      ...(asset.libraryTags || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  }

  const filteredAssetCategories = useMemo(() => (
    Object.entries(ASSET_CATEGORIES).reduce((entries, [categoryLabel, categoryAssets]) => {
      const filteredAssets = categoryAssets.filter(asset => (
        matchesAssetFilter(asset) && matchesAssetSearch(asset, categoryLabel)
      ))

      if (filteredAssets.length) {
        entries.push([categoryLabel, filteredAssets])
      }

      return entries
    }, [])
  ), [assetFilter, assetSearch])

  const startAssetPlacement = (asset) => {
    const prepared = buildAssetVariant(asset)
    rememberAsset(asset.id)
    onAssetClickPlace?.(prepared)
  }

  const startAssetDrag = (event, asset) => {
    const prepared = buildAssetVariant(asset)
    rememberAsset(asset.id)
    isDraggingAssetRef.current = true
    onAssetDragStart(event, prepared)
  }

  const renderAssetCard = (asset, compact = false) => (
    <div
      key={`${compact ? 'recent' : 'asset'}-${asset.id}`}
      style={{
        ...(compact ? styles.miniAssetCard : styles.assetCard),
        borderColor: pendingAssetDef?.id === asset.id ? (pendingAssetDef.color || asset.color) : `${asset.color}44`,
        background: pendingAssetDef?.id === asset.id ? `${pendingAssetDef.color || asset.color}18` : 'var(--bg-secondary)',
      }}
      draggable={!compact}
      onDragStart={compact ? undefined : (event) => startAssetDrag(event, asset)}
      onDragEnd={compact ? undefined : (event) => {
        onAssetDragEnd?.(event)
        window.setTimeout(() => {
          isDraggingAssetRef.current = false
        }, 0)
      }}
      onClick={() => {
        if (isDraggingAssetRef.current) return
        startAssetPlacement(asset)
      }}
      onMouseEnter={event => {
        event.currentTarget.style.borderColor = assetColorOverride || asset.color
        event.currentTarget.style.background = `${assetColorOverride || asset.color}18`
      }}
      onMouseLeave={event => {
        event.currentTarget.style.borderColor = pendingAssetDef?.id === asset.id ? (pendingAssetDef.color || asset.color) : `${asset.color}44`
        event.currentTarget.style.background = pendingAssetDef?.id === asset.id ? `${pendingAssetDef.color || asset.color}18` : 'var(--bg-secondary)'
      }}
      title={asset.name}
    >
      <div style={{ ...styles.assetIcon, border: `1px solid ${(assetColorOverride || asset.color)}33`, color: assetColorOverride || asset.color }}>
        <AssetGlyph asset={{ ...asset, color: assetColorOverride || asset.color, iconColor: assetColorOverride || asset.color }} size={compact ? 18 : 20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...styles.assetName, color: 'var(--text-primary)' }}>{asset.name}</div>
        {!compact && (
          <div style={{ fontSize: '10px', color: assetColorOverride || asset.color, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {pendingAssetDef?.id === asset.id ? 'Click Map To Place' : 'Click / Drag To Place'}
          </div>
        )}
      </div>
    </div>
  )

  const renderZoneNode = (zone) => {
    const childAssets = assetsByParent[zone.id] || []
    const childLines = linesByParent[zone.id] || []
    const childAnnotations = annotationsByParent[zone.id] || []
    const hasChildren = childAssets.length || childLines.length || childAnnotations.length
    const expanded = expandedZones[zone.id] ?? true

    return (
      <div key={zone.id}>
        <div
          style={{
            ...styles.treeNode,
            background: selectedId === zone.id ? `${zone.zoneType?.color || '#3d8ef8'}18` : 'transparent',
            border: selectedId === zone.id ? `1px solid ${zone.zoneType?.color || '#3d8ef8'}` : '1px solid transparent',
          }}
          onClick={() => onSelectItem?.(zone)}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleZone(zone.id)
              }}
              style={{ ...styles.iconBtn, width: '22px', height: '22px', border: 'none', background: 'transparent' }}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <div style={{ width: '22px' }} />
          )}
          <div style={{ ...styles.colorDot, background: zone.zoneType?.color || '#3d8ef8' }} />
          <span style={styles.treeLabel}>{zone.label || zone.zoneType?.name || 'Zone'}</span>
          <span style={styles.treeMeta}>Zone</span>
        </div>

        {hasChildren && expanded && (
          <div style={styles.treeChildren}>
            {childAssets.map(asset => (
              <div
                key={asset.id}
                style={{
                  ...styles.treeNode,
                  background: selectedId === asset.id ? 'var(--bg-hover)' : 'transparent',
                }}
                onClick={() => onSelectItem?.(asset)}
              >
                <div style={{ width: '22px' }} />
                <AssetGlyph asset={asset.assetDef} size={14} color={asset.assetDef?.iconColor || asset.assetDef?.color} />
                <span style={styles.treeLabel}>{asset.label || asset.assetDef?.name || 'Asset'}</span>
                <span style={styles.treeMeta}>Asset</span>
              </div>
            ))}
            {childLines.map(line => (
              <div
                key={line.id}
                style={{
                  ...styles.treeNode,
                  background: selectedId === line.id ? 'var(--bg-hover)' : 'transparent',
                }}
                onClick={() => onSelectItem?.(line)}
              >
                <div style={{ width: '22px' }} />
                <span style={{ fontSize: '14px', color: '#f59e0b' }}>-</span>
                <span style={styles.treeLabel}>{line.label || 'Line'}</span>
                <span style={styles.treeMeta}>Line</span>
              </div>
            ))}
            {childAnnotations.map(annotation => (
              <div
                key={annotation.id}
                style={{
                  ...styles.treeNode,
                  background: selectedId === annotation.id ? 'var(--bg-hover)' : 'transparent',
                }}
                onClick={() => onSelectItem?.(annotation)}
              >
                <div style={{ width: '22px' }} />
                <span style={{ fontSize: '14px', color: '#2563eb' }}>T</span>
                <span style={styles.treeLabel}>{annotation.label || annotation.text || 'Annotation'}</span>
                <span style={styles.treeMeta}>Note</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (collapsed) {
    return (
      <div style={styles.sidebarCollapsed}>
        <div style={styles.collapsedStack}>
          <button type="button" style={styles.collapseBtn} onClick={onToggleCollapse} title="Expand sidebar">
            <ChevronRight size={14} />
          </button>
          <div style={styles.collapsedDivider} />
          <button
            type="button"
            style={{
              ...styles.collapsedIconBtn,
              color: activeTab === 'assets' ? 'var(--accent)' : 'var(--text-secondary)',
              borderColor: activeTab === 'assets' ? 'var(--accent)' : 'var(--border)',
              background: activeTab === 'assets' ? 'var(--accent-dim)' : 'var(--bg-secondary)',
            }}
            title="Assets"
            onClick={() => {
              setActiveTab('assets')
              onToggleCollapse?.()
            }}
          >
            <Package size={14} />
          </button>
          <button
            type="button"
            style={{
              ...styles.collapsedIconBtn,
              color: activeTab === 'layers' ? 'var(--accent)' : 'var(--text-secondary)',
              borderColor: activeTab === 'layers' ? 'var(--accent)' : 'var(--border)',
              background: activeTab === 'layers' ? 'var(--accent-dim)' : 'var(--bg-secondary)',
            }}
            title="Layers"
            onClick={() => {
              setActiveTab('layers')
              onToggleCollapse?.()
            }}
          >
            <Layers size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.sidebar}>
      <div style={styles.tabs}>
        <button type="button" style={styles.collapseBtn} onClick={onToggleCollapse} title="Collapse sidebar">
          <ChevronLeft size={14} />
        </button>
        {[
          { id: 'assets', icon: <Package size={13} />, label: 'Assets' },
          { id: 'layers', icon: <Layers size={13} />, label: 'Layers' },
        ].map(t => (
          <button
            key={t.id}
            style={{ ...styles.tab, ...(activeTab === t.id ? styles.activeTab : {}) }}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {activeTab === 'assets' && (
          <>
            <div style={styles.floorCard}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>Floor Plan Overlay</div>
              <div style={{ ...styles.floorMeta, marginTop: '4px' }}>
                Upload a floor plan image and place it with two clicks on the map.
              </div>
              <input
                type="file"
                accept="image/*"
                style={styles.floorInput}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    if (typeof reader.result !== 'string') return
                    onFloorPlanUpload(reader.result)
                  }
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }}
              />
              <button
                style={{ ...styles.floorBtn, opacity: floorPlan?.imageUrl ? 1 : 0.5, cursor: floorPlan?.imageUrl ? 'pointer' : 'not-allowed' }}
                onClick={onStartFloorPlacement}
                disabled={!floorPlan?.imageUrl}
              >
                {placingFloor ? 'Click Two Corners On Map' : 'Place Floor Plan'}
              </button>
              {floorPlan?.imageUrl && (
                <>
                  <div style={{ ...styles.floorMeta, marginTop: '8px' }}>
                    {floorPlan.bounds ? 'Floor plan overlay is placed on the map.' : 'Image loaded. Choose top-left and bottom-right points on the map.'}
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Opacity</label>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.1"
                      value={floorPlan.opacity ?? 0.7}
                      onChange={(e) => onFloorOpacityChange(Number(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>
                </>
              )}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '10px' }}>
              Click or drag assets onto the map to place them
            </p>
            {drawMode === 'text' && (
              <div style={{ ...styles.floorCard, marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>Annotation Text</div>
                <textarea
                  style={{ ...styles.floorInput, minHeight: '64px', resize: 'vertical' }}
                  value={annotationDraftText || ''}
                  onChange={(event) => onAnnotationDraftTextChange?.(event.target.value)}
                  placeholder="Type annotation text, then click map..."
                />
                <div style={{ ...styles.floorMeta, marginTop: '6px' }}>
                  Text tool selected: click map to place this annotation.
                </div>
              </div>
            )}
            <input
              type="text"
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder="Search assets..."
              style={{ ...styles.floorInput, marginTop: 0, marginBottom: '10px' }}
            />
            <div style={styles.filterRow}>
              {ASSET_LIBRARY_FILTERS.map(filter => (
                <button
                  key={filter.id}
                  type="button"
                  style={{
                    ...styles.filterChip,
                    background: assetFilter === filter.id ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: assetFilter === filter.id ? '#ffffff' : 'var(--text-secondary)',
                    borderColor: assetFilter === filter.id ? 'var(--accent)' : 'var(--border)',
                  }}
                  onClick={() => setAssetFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div style={{ ...styles.floorCard, marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Asset Style</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={assetColorOverride || '#3b82f6'}
                  onChange={(event) => setAssetColorOverride(event.target.value)}
                  style={{ ...styles.styleInput, height: '38px', padding: '4px' }}
                />
                <button
                  type="button"
                  onClick={() => setAssetColorOverride('')}
                  style={{ ...styles.filterChip, whiteSpace: 'nowrap' }}
                >
                  Use Default
                </button>
              </div>
              <div style={{ ...styles.floorMeta, marginTop: '8px' }}>
                Pick a custom asset color before placing, or reset to each asset&apos;s default palette.
              </div>
            </div>
            {recentAssets.length > 0 && (
              <>
                <div style={styles.sectionHeader}>Recent Icons</div>
                <div style={styles.recentGrid}>
                  {recentAssets.map(asset => renderAssetCard(asset, true))}
                </div>
              </>
            )}
            {filteredAssetCategories.map(([cat, filteredAssets]) => {
              return (
              <div key={cat}>
                <div style={styles.sectionHeader} onClick={() => toggleCat(cat)}>
                  {expandedCats[cat] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {cat}
                </div>
                {expandedCats[cat] && (
                  <div style={styles.assetGrid}>
                    {filteredAssets.map(asset => renderAssetCard(asset))}
                  </div>
                )}
              </div>
              )
            })}
            {(assetSearch.trim() || assetFilter !== 'all') && filteredAssetCategories.length === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                No assets found for "{assetSearch || ASSET_LIBRARY_FILTERS.find(filter => filter.id === assetFilter)?.label}".
              </div>
            )}
          </>
        )}

        {activeTab === 'layers' && (
          <>
            <div style={styles.treeWrap}>
              <div style={styles.treeHeader}>Layers</div>

              {[
                { id: 'zones', name: 'Zones', items: rootZones.length, visibleKey: 'zones' },
                { id: 'assets', name: 'Unassigned Assets', items: unassignedAssets.length, visibleKey: 'assets' },
                { id: 'annotations', name: 'Unassigned Annotations', items: unassignedAnnotations.length, visibleKey: 'annotations' },
                { id: 'lines', name: 'Unassigned Lines', items: unassignedLines.length, visibleKey: 'zones' },
                { id: 'floor', name: 'Floor Plan', items: floorPlan ? 1 : 0, visibleKey: 'floor' },
              ].filter(folder => folder.items > 0).map(folder => {
                const lstate = layers[folder.visibleKey] || { visible: true, locked: false }
                const expanded = expandedFolders[folder.id] ?? true

                return (
                  <div key={folder.id}>
                    <div style={styles.folderNode}>
                      <div style={styles.folderLabelWrap}>
                        <button
                          type="button"
                          onClick={() => toggleFolder(folder.id)}
                          style={{ ...styles.iconBtn, width: '22px', height: '22px', border: 'none', background: 'transparent' }}
                        >
                          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                        <Folder size={14} color="var(--accent)" />
                        <span style={styles.folderLabel}>{folder.name}</span>
                        <span style={styles.treeMeta}>{folder.items}</span>
                      </div>
                      <div style={styles.folderActions}>
                        <button
                          style={{ ...styles.iconBtn, color: lstate.visible ? 'var(--accent)' : 'var(--text-dim)' }}
                          onClick={() => onToggleLayer(folder.visibleKey)}
                          title={lstate.visible ? 'Hide' : 'Show'}
                        >
                          {lstate.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                          style={{ ...styles.iconBtn, color: lstate.locked ? 'var(--warning)' : 'var(--text-dim)' }}
                          onClick={() => onToggleLock(folder.visibleKey)}
                          title={lstate.locked ? 'Unlock' : 'Lock'}
                        >
                          {lstate.locked ? <Lock size={14} /> : <Unlock size={14} />}
                        </button>
                      </div>
                    </div>

                    {expanded && folder.id === 'zones' && (
                      <div style={styles.treeChildren}>
                        {rootZones.length === 0 ? (
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                            Draw a zone first. Assets and annotations placed inside it will appear inside that zone folder.
                          </div>
                        ) : (
                          rootZones.map(renderZoneNode)
                        )}
                      </div>
                    )}

                    {expanded && folder.id === 'assets' && unassignedAssets.length > 0 && (
                      <div style={styles.treeChildren}>
                        {unassignedAssets.map(asset => (
                          <div key={asset.id} style={{ ...styles.treeNode, background: selectedId === asset.id ? 'var(--bg-hover)' : 'transparent' }} onClick={() => onSelectItem?.(asset)}>
                            <AssetGlyph asset={asset.assetDef} size={14} color={asset.assetDef?.iconColor || asset.assetDef?.color} />
                            <span style={styles.treeLabel}>{asset.label || asset.assetDef?.name || 'Asset'}</span>
                            <span style={styles.treeMeta}>Asset</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {expanded && folder.id === 'annotations' && unassignedAnnotations.length > 0 && (
                      <div style={styles.treeChildren}>
                        {unassignedAnnotations.map(annotation => (
                          <div key={annotation.id} style={{ ...styles.treeNode, background: selectedId === annotation.id ? 'var(--bg-hover)' : 'transparent' }} onClick={() => onSelectItem?.(annotation)}>
                            <span style={{ fontSize: '14px', color: '#2563eb' }}>T</span>
                            <span style={styles.treeLabel}>{annotation.label || annotation.text || 'Annotation'}</span>
                            <span style={styles.treeMeta}>Note</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {expanded && folder.id === 'lines' && unassignedLines.length > 0 && (
                      <div style={styles.treeChildren}>
                        {unassignedLines.map(line => (
                          <div key={line.id} style={{ ...styles.treeNode, background: selectedId === line.id ? 'var(--bg-hover)' : 'transparent' }} onClick={() => onSelectItem?.(line)}>
                            <span style={{ fontSize: '14px', color: '#f59e0b' }}>-</span>
                            <span style={styles.treeLabel}>{line.label || 'Line'}</span>
                            <span style={styles.treeMeta}>Line</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {expanded && folder.id === 'floor' && floorPlan && (
                      <div style={styles.treeChildren}>
                        <div style={{ ...styles.treeNode, background: selectedId === 'floor-plan' ? 'var(--bg-hover)' : 'transparent' }} onClick={() => onSelectItem?.({ id: 'floor-plan', type: 'floor', ...floorPlan })}>
                          <span style={{ fontSize: '14px' }}>#</span>
                          <span style={styles.treeLabel}>Floor Plan Overlay</span>
                          <span style={styles.treeMeta}>Floor</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {rootZones.length === 0 && !unassignedAssets.length && !unassignedAnnotations.length && !unassignedLines.length && !floorPlan && (
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6, padding: '8px 2px' }}>
                  Layers will appear here after you place zones, assets, lines, annotations, or floor plan.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
