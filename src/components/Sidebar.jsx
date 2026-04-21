import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Layers, Package, ChevronDown, ChevronRight, ChevronLeft, Eye, EyeOff, Lock, Unlock, Folder, Upload, Trash2 } from 'lucide-react'
import AssetGlyph from './AssetGlyph'


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
    borderWidth: '1px',
    borderStyle: 'solid',
    borderTopColor: 'var(--border)',
    borderRightColor: 'var(--border)',
    borderBottomColor: 'var(--border)',
    borderLeftColor: 'var(--border)',
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
    borderWidth: '1px',
    borderStyle: 'solid',
    borderTopColor: 'var(--border)',
    borderRightColor: 'var(--border)',
    borderBottomColor: 'var(--border)',
    borderLeftColor: 'var(--border)',
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
    borderTopColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
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
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '12px',
  },
  assetCard: {
    background: 'var(--bg-secondary)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderTopColor: 'var(--border)',
    borderRightColor: 'var(--border)',
    borderBottomColor: 'var(--border)',
    borderLeftColor: 'var(--border)',
    borderRadius: '12px',
    padding: '12px 10px',
    cursor: 'grab',
    transition: 'all 0.15s',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  assetIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-panel)',
    fontSize: '24px',
    lineHeight: 1,
    flexShrink: 0,
  },
  assetName: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    lineHeight: 1.3,
    textAlign: 'center',
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
    borderWidth: '1px',
    borderStyle: 'solid',
    borderTopColor: 'var(--border)',
    borderRightColor: 'var(--border)',
    borderBottomColor: 'var(--border)',
    borderLeftColor: 'var(--border)',
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
  zoneTemplates = [],
  pendingZoneTemplate,
  onZoneTemplateClickPlace,
  onDeleteZoneTemplate,
  onDeleteCustomAsset,
  onImportAssets,
  onImportProject,
  onDownloadAssetList,
  zones = [],
  assets = [],
  lines = [],
  annotations = [],
  selectedId,
  onSelectItem,
  onUpdateAsset,
  floorPlans = [],
  onFloorPlanUpload,
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
  assetCategories = {},
  zoneTypes = [],
}) {
  const [activeTab, setActiveTab] = useState('assets')
  const [expandedCats, setExpandedCats] = useState({ 'Performance': true, 'Access & Security': true, 'Custom Assets': true })
  const [assetSearch, setAssetSearch] = useState('')
  const [customAssetSearch, setCustomAssetSearch] = useState('')
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
  const assetImportInputRef = useRef(null)
  const mapImportInputRef = useRef(null)
  const [customAssetName, setCustomAssetName] = useState('')
  const [customAssetCategory, setCustomAssetCategory] = useState('Custom Assets')
  const [customAssetType, setCustomAssetType] = useState('icon')
  const [customAssetColor, setCustomAssetColor] = useState('#3d8ef8')
  const [customImportExpanded, setCustomImportExpanded] = useState(false)
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
    Object.values(assetCategories).flat().forEach(asset => {
      lookup.set(asset.id, asset)
    })
    return lookup
  }, [assetCategories])

  const mergedAssetCategories = useMemo(() => {
    const merged = Object.entries(assetCategories || {}).reduce((acc, [categoryLabel, categoryAssets]) => ({
      ...acc,
      [categoryLabel]: Array.isArray(categoryAssets) ? [...categoryAssets] : [],
    }), {})

    if (zoneTemplates.length) {
      const templateAssets = zoneTemplates.map(template => ({
        ...template,
        itemKind: 'zone-template',
        category: 'Custom Assets',
        assetType: 'Area Template',
        color: template.strokeColor || template.fillColor || template.zoneType?.color || '#3d8ef8',
        iconColor: template.strokeColor || template.fillColor || template.zoneType?.color || '#3d8ef8',
        keywords: [
          template.name,
          template.zoneType?.name,
          'area',
          'template',
          'custom',
        ].filter(Boolean),
        libraryTags: ['custom', 'zone-template'],
      }))

      merged['Custom Assets'] = [
        ...templateAssets,
        ...(Array.isArray(merged['Custom Assets']) ? merged['Custom Assets'] : []),
      ]
    }

    return merged
  }, [assetCategories, zoneTemplates])

  const recentAssets = useMemo(() => (
    recentAssetIds
      .map(assetId => assetLookup.get(assetId))
      .filter(Boolean)
  ), [assetLookup, recentAssetIds])

  const assetsByParent = useMemo(() => groupItemsByParent(assets), [assets])
  const linesByParent = useMemo(() => groupItemsByParent(lines), [lines])
  const annotationsByParent = useMemo(() => groupItemsByParent(annotations), [annotations])

  const validZones = useMemo(() => zones.filter(zone => zone && zone.id), [zones])
  const zoneIdSet = useMemo(() => new Set(validZones.map(zone => zone.id)), [validZones])
  const rootZones = useMemo(() => (
    validZones.filter(zone => !zone.parentId || zone.parentId === zone.id || !zoneIdSet.has(zone.parentId))
  ), [validZones, zoneIdSet])
  const zoneTreeRoots = useMemo(() => (rootZones.length ? rootZones : validZones), [rootZones, validZones])
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
    const globalQuery = assetSearch.trim().toLowerCase()
    const customQuery = categoryLabel === 'Custom Assets'
      ? customAssetSearch.trim().toLowerCase()
      : ''

    if (!globalQuery && !customQuery) return true

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

    const matchesGlobalQuery = !globalQuery || haystack.includes(globalQuery)
    const matchesCustomQuery = !customQuery || haystack.includes(customQuery)

    return matchesGlobalQuery && matchesCustomQuery
  }

  const filteredAssetCategories = useMemo(() => (
    Object.entries(mergedAssetCategories || {}).reduce((entries, [categoryLabel, categoryAssets]) => {
      const safeAssets = Array.isArray(categoryAssets) ? categoryAssets : []
      const filteredAssets = safeAssets.filter(asset => (
        matchesAssetFilter(asset) && matchesAssetSearch(asset, categoryLabel)
      ))

      if (filteredAssets.length) {
        entries.push([categoryLabel, filteredAssets])
      }

      return entries
    }, [])
  ), [assetFilter, assetSearch, customAssetSearch, mergedAssetCategories])

  const hasAssetLibrary = useMemo(() => (
    Object.values(mergedAssetCategories || {}).some(categoryAssets => Array.isArray(categoryAssets) && categoryAssets.length > 0)
  ), [mergedAssetCategories])

  const startAssetPlacement = (asset) => {
    if (asset.itemKind === 'zone-template') {
      onZoneTemplateClickPlace?.(asset)
      return
    }

    const prepared = buildAssetVariant(asset)
    rememberAsset(asset.id)
    onAssetClickPlace?.(prepared)
  }

  const startAssetDrag = (event, asset) => {
    if (asset.itemKind === 'zone-template') return
    const prepared = buildAssetVariant(asset)
    rememberAsset(asset.id)
    isDraggingAssetRef.current = true
    onAssetDragStart(event, prepared)
  }

  const renderAssetCard = (asset, compact = false) => {
    const isZoneTemplate = asset.itemKind === 'zone-template'
    const isCustomLibraryAsset = !isZoneTemplate && Array.isArray(asset.libraryTags) && asset.libraryTags.includes('custom')
    const assetColor = assetColorOverride || asset.color
    const isActive = isZoneTemplate
      ? pendingZoneTemplate?.id === asset.id
      : pendingAssetDef?.id === asset.id

    return (
      <div
        key={`${compact ? 'recent' : 'asset'}-${asset.id}`}
        style={{
          ...(compact ? styles.miniAssetCard : styles.assetCard),
          borderColor: isActive ? assetColor : `${assetColor}44`,
          background: isActive ? `${assetColor}18` : 'var(--bg-secondary)',
          cursor: compact || isZoneTemplate ? 'pointer' : 'grab',
          transition: 'all 0.15s',
          position: 'relative',
        }}
        draggable={!compact && !isZoneTemplate}
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
      >
        {!compact && (isZoneTemplate || isCustomLibraryAsset) && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              if (isZoneTemplate) {
                onDeleteZoneTemplate?.(asset.id)
                return
              }
              onDeleteCustomAsset?.(asset.id)
            }}
            style={{
              ...styles.iconBtn,
              position: 'absolute',
              top: '8px',
              right: '8px',
              width: '24px',
              height: '24px',
              background: 'var(--bg-panel)',
            }}
            title={`Delete ${asset.name}`}
          >
            <Trash2 size={12} />
          </button>
        )}
        <div style={{ ...styles.assetIcon, border: `1px solid ${assetColor}33`, color: assetColor }}>
          {isZoneTemplate ? (
            asset.shapeType === 'circle' ? (
              <div
                style={{
                  width: compact ? '18px' : '22px',
                  height: compact ? '18px' : '22px',
                  borderRadius: '999px',
                  background: `${assetColor}22`,
                  border: `2px solid ${assetColor}`,
                }}
              />
            ) : (
              <div
                style={{
                  width: compact ? '18px' : '22px',
                  height: compact ? '18px' : '22px',
                  background: `${assetColor}22`,
                  border: `2px solid ${assetColor}`,
                  clipPath: 'polygon(15% 50%, 50% 15%, 85% 25%, 78% 75%, 38% 88%)',
                }}
              />
            )
          ) : (
            <AssetGlyph asset={{ ...asset, color: assetColor, iconColor: assetColor }} size={compact ? 18 : 20} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...styles.assetName, color: 'var(--text-primary)' }}>{asset.name}</div>
          {!compact && (
            <div style={{ fontSize: '10px', color: assetColor, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {isZoneTemplate
                ? `${asset.zoneType?.name || 'Area'}`
                : (asset.assetType || asset.category || '')}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderZoneNode = (zone, visitedZoneIds = new Set()) => {
    const nextVisitedZoneIds = new Set(visitedZoneIds)
    nextVisitedZoneIds.add(zone.id)

    const childZones = validZones.filter(z => z.parentId === zone.id && z.id !== zone.id && !nextVisitedZoneIds.has(z.id))
    const childAssets = assetsByParent[zone.id] || []
    const childLines = linesByParent[zone.id] || []
    const childAnnotations = annotationsByParent[zone.id] || []
    const hasChildren = childZones.length || childAssets.length || childLines.length || childAnnotations.length
    const expanded = expandedZones[zone.id] ?? true

    return (
      <div key={zone.id}>
        <div
          style={{
            ...styles.treeNode,
            background: selectedId === zone.id ? `${zone.zoneType?.color || '#3d8ef8'}18` : 'transparent',
            border: selectedId === zone.id ? `1px solid ${zone.zoneType?.color || '#3d8ef8'}` : '1px solid transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
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
            <span
              style={styles.treeLabel}
              onClick={() => onSelectItem?.(zone)}
            >
              {zone.label || zone.zoneType?.name || 'Zone'}
            </span>
            <span style={styles.treeMeta}>Zone</span>
          </div>

          {/* Zone visibility toggle - hides all assets inside */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onUpdateAsset?.({ ...zone, type: 'zone', visible: zone.visible === false })
            }}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: zone.visible !== false ? 'var(--text-secondary)' : 'var(--text-dim)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              marginRight: '4px',
            }}
            title={zone.visible !== false ? 'Hide zone & assets' : 'Show zone & assets'}
          >
            {zone.visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </div>

        {hasChildren && expanded && (
          <div style={styles.treeChildren}>
            {childZones.map(childZone => renderZoneNode(childZone, nextVisitedZoneIds))}
            {childAssets.map(asset => {
              const assetDef = asset.assetDef
              return (
                <div
                  key={asset.id}
                  style={{
                    ...styles.treeNode,
                    background: selectedId === asset.id ? 'var(--bg-hover)' : 'transparent',
                  }}
                  onClick={() => onSelectItem?.(asset)}
                >
                  <div style={{ width: '22px' }} />
                  <AssetGlyph asset={assetDef} size={14} color={assetDef?.iconColor || assetDef?.color} />
                  <span style={styles.treeLabel}>{asset.label || assetDef?.name || 'Asset'}</span>
                  <span style={styles.treeMeta}>Asset</span>
                </div>
              )
            })}
            {childLines.map(line => {
              return (
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
              )
            })}
            {childAnnotations.map(annotation => {
              return (
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
              )
            })}
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
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>Floor Plan Overlays</div>
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
              <div style={{ ...styles.floorMeta, marginTop: '6px' }}>
                Upload an image, then click on the map to place it. You can add multiple floor plans.
              </div>
            </div>

            {drawMode === 'text' && (
              <div style={{ ...styles.floorCard, marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>Drop Pin Title</div>
                <textarea
                  style={{ ...styles.floorInput, minHeight: '64px', resize: 'vertical' }}
                  value={annotationDraftText || ''}
                  onChange={(event) => onAnnotationDraftTextChange?.(event.target.value)}
                  placeholder="Type pin title, then click map..."
                />
                <div style={{ ...styles.floorMeta, marginTop: '6px' }}>
                  Pin tool selected: click map to drop this point.
                </div>
              </div>
            )}

            <input
              type="file"
              ref={assetImportInputRef}
              accept=".json,.png,.jpg,.jpeg,.svg,.webp,.gif,image/*"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return

                const isImageFile = file.type.startsWith('image/') || /\.(png|jpe?g|svg|webp|gif)$/i.test(file.name)
                const reader = new FileReader()

                if (isImageFile) {
                  reader.onload = () => {
                    const imageUrl = typeof reader.result === 'string' ? reader.result : ''
                    if (!imageUrl) {
                      window.alert('Could not import image asset.')
                      event.target.value = ''
                      return
                    }

                    onImportAssets?.({
                      mode: 'library-image',
                      fileName: file.name,
                      imageUrl,
                      name: customAssetName.trim() || file.name.replace(/\.[^.]+$/, ''),
                      category: customAssetCategory.trim() || 'Custom Assets',
                      assetType: customAssetType,
                      defaultWidth: 4,
                      defaultLength: 4,
                      color: customAssetColor,
                    })
                    event.target.value = ''
                  }
                  reader.readAsDataURL(file)
                  return
                }

                reader.onload = () => {
                  try {
                    const raw = typeof reader.result === 'string' ? reader.result : ''
                    const parsed = JSON.parse(raw)
                    onImportAssets?.(parsed)
                  } catch (error) {
                    window.alert('Could not import assets. Please use a valid JSON or image file.')
                  } finally {
                    event.target.value = ''
                  }
                }
                reader.readAsText(file)
              }}
            />

            <div style={{ ...styles.floorCard, marginBottom: '10px' }}>
              <div
                style={{ ...styles.sectionHeader, padding: 0, color: 'var(--text-primary)', justifyContent: 'space-between' }}
                onClick={() => setCustomImportExpanded(prev => !prev)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {customImportExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Custom Asset Import
                </span>
              </div>
              {customImportExpanded && (
                <>
                  <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                    <input
                      type="text"
                      value={customAssetName}
                      onChange={(event) => setCustomAssetName(event.target.value)}
                      placeholder="Asset name for PNG/Icon"
                      style={{ ...styles.floorInput, marginTop: 0 }}
                    />
                    <input
                      type="text"
                      value={customAssetCategory}
                      onChange={(event) => setCustomAssetCategory(event.target.value)}
                      placeholder="Category e.g. Branding / Furniture"
                      style={{ ...styles.floorInput, marginTop: 0 }}
                    />
                    <select
                      value={customAssetType}
                      onChange={(event) => setCustomAssetType(event.target.value)}
                      style={{ ...styles.floorInput, marginTop: 0 }}
                    >
                      <option value="icon">Icon</option>
                      <option value="furniture">Furniture</option>
                      <option value="equipment">Equipment</option>
                      <option value="structure">Structure</option>
                      <option value="branding">Branding</option>
                      <option value="utility">Utility</option>
                      <option value="other">Other</option>
                    </select>
                    <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={customAssetColor}
                        onChange={(event) => setCustomAssetColor(event.target.value)}
                        style={{ ...styles.floorInput, padding: '4px', height: '36px', width: '100%' }}
                      />
                      <input
                        type="text"
                        value={customAssetColor}
                        onChange={(event) => setCustomAssetColor(event.target.value)}
                        placeholder="#3d8ef8"
                        style={{ ...styles.floorInput, marginTop: 0 }}
                      />
                    </div>
                  </div>
                  <div style={{ ...styles.floorMeta, marginTop: '6px' }}>
                    Supports JSON layout import plus PNG / JPG / SVG / WebP icon assets.
                  </div>
                  <button
                    type="button"
                    style={{ ...styles.floorInput, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, width: '100%', marginTop: '10px' }}
                    onClick={() => assetImportInputRef.current?.click()}
                  >
                    <Upload size={13} /> Import Asset
                  </button>
                </>
              )}
            </div>

            <input
              type="text"
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder="Search assets..."
              style={{ ...styles.floorInput, marginTop: 0, marginBottom: '10px' }}
            />

            {!hasAssetLibrary && (
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: '10px' }}>
                Asset library is still loading or not available right now.
              </div>
            )}

            {filteredAssetCategories.map(([cat, filteredAssets]) => {
              return (
                <div key={cat}>
                  <div style={styles.sectionHeader} onClick={() => toggleCat(cat)}>
                    {expandedCats[cat] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {cat}
                  </div>
                  {expandedCats[cat] && (
                    <>
                      {cat === 'Custom Assets' && (
                        <input
                          type="text"
                          value={customAssetSearch}
                          onChange={(event) => setCustomAssetSearch(event.target.value)}
                          placeholder="Search custom assets..."
                          style={{ ...styles.floorInput, marginTop: 0, marginBottom: '10px' }}
                        />
                      )}
                      <div style={styles.assetGrid}>
                        {filteredAssets.map(asset => renderAssetCard(asset))}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
            {(assetSearch.trim() || assetFilter !== 'all') && filteredAssetCategories.length === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                No assets found for "{assetSearch || (assetFilter === 'all' ? 'All' : assetFilter)}".
              </div>
            )}
          </>
        )}

        {activeTab === 'layers' && (
          <>
            <div style={styles.treeWrap}>
              <div style={styles.treeHeader}>Layers</div>

              {[
                { id: 'zones', name: 'Zones', items: zones.length, visibleKey: 'zones' },
                { id: 'assets', name: 'Assets', items: assets.length, visibleKey: 'assets' },
                { id: 'annotations', name: 'Annotations', items: annotations.length, visibleKey: 'annotations' },
                { id: 'lines', name: lines.some(line => line.routeType) ? 'Routes' : 'Lines', items: lines.length, visibleKey: 'lines' },
                { id: 'floor', name: 'Floor Plans', items: floorPlans.length, visibleKey: 'floor' },
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
                        {zoneTreeRoots.length === 0 ? (
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                            Draw zones to organize assets, annotations, and lines. Items placed inside zones will appear nested under them.
                          </div>
                        ) : (
                          zoneTreeRoots.map(zone => renderZoneNode(zone))
                        )}
                      </div>
                    )}

                    {expanded && folder.id === 'assets' && assets.length > 0 && (
                      <div style={styles.treeChildren}>
                        {assets.map(asset => {
                          const assetDef = asset.assetDef
                          const parentZone = asset.parentId ? zones.find(z => z.id === asset.parentId) : null
                          const zoneLabel = parentZone ? ` (${parentZone.label || parentZone.zoneType?.name || 'Zone'})` : ''
                          return (
                            <div key={asset.id} style={{ ...styles.treeNode, background: selectedId === asset.id ? 'var(--bg-hover)' : 'transparent' }} onClick={() => onSelectItem?.(asset)}>
                              <div style={{ width: '22px' }} />
                              <AssetGlyph asset={assetDef} size={14} color={assetDef?.iconColor || assetDef?.color} />
                              <span style={styles.treeLabel}>{asset.label || assetDef?.name || 'Asset'}{zoneLabel}</span>
                              <span style={styles.treeMeta}>Asset</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {expanded && folder.id === 'annotations' && annotations.length > 0 && (
                      <div style={styles.treeChildren}>
                        {annotations.map(annotation => {
                          const parentZone = annotation.parentId ? zones.find(z => z.id === annotation.parentId) : null
                          const zoneLabel = parentZone ? ` (${parentZone.label || parentZone.zoneType?.name || 'Zone'})` : ''
                          return (
                            <div key={annotation.id} style={{ ...styles.treeNode, background: selectedId === annotation.id ? 'var(--bg-hover)' : 'transparent' }} onClick={() => onSelectItem?.(annotation)}>
                              <div style={{ width: '22px' }} />
                              <span style={{ fontSize: '14px', color: '#2563eb' }}>T</span>
                              <span style={styles.treeLabel}>{annotation.label || annotation.text || 'Annotation'}{zoneLabel}</span>
                              <span style={styles.treeMeta}>Note</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {expanded && folder.id === 'lines' && lines.length > 0 && (
                      <div style={styles.treeChildren}>
                        {lines.map(line => {
                          const parentZone = line.parentId ? zones.find(z => z.id === line.parentId) : null
                          const zoneLabel = parentZone ? ` (${parentZone.label || parentZone.zoneType?.name || 'Zone'})` : ''
                          return (
                            <div key={line.id} style={{ ...styles.treeNode, background: selectedId === line.id ? 'var(--bg-hover)' : 'transparent' }} onClick={() => onSelectItem?.(line)}>
                              <div style={{ width: '22px' }} />
                              <span style={{ fontSize: '14px', color: '#f59e0b' }}>-</span>
                              <span style={styles.treeLabel}>{line.label || (line.routeType ? 'Route' : 'Line')}{zoneLabel}</span>
                              <span style={styles.treeMeta}>{line.routeType ? 'Route' : 'Line'}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {expanded && folder.id === 'floor' && floorPlans.length > 0 && (
                      <div style={styles.treeChildren}>
                        {floorPlans.map((plan, i) => (
                          <div key={plan.id} style={{ ...styles.treeNode, background: selectedId === plan.id ? 'var(--bg-hover)' : 'transparent' }} onClick={() => onSelectItem?.({ type: 'floor', ...plan })}>
                            <span style={{ fontSize: '14px' }}>#</span>
                            <span style={styles.treeLabel}>Floor Plan {i + 1}</span>
                            <span style={styles.treeMeta}>Floor</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Grid Control */}
              <div style={styles.folderNode}>
                <div style={styles.folderLabelWrap}>
                  <div style={{ width: '22px' }} />
                  <span style={{ fontSize: '14px' }}>⊞</span>
                  <span style={styles.folderLabel}>Map Grid</span>
                </div>
                <div style={styles.folderActions}>
                  <button
                    style={{ ...styles.iconBtn, color: layers.grid?.visible ? 'var(--accent)' : 'var(--text-dim)' }}
                    onClick={() => onToggleLayer('grid')}
                    title={layers.grid?.visible ? 'Hide grid' : 'Show grid'}
                  >
                    {layers.grid?.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>
              </div>
              {layers.grid?.visible && (
                <div style={{ ...styles.treeChildren, paddingTop: '6px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>Size (meters)</div>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={layers.grid?.size || 3}
                        onChange={e => {
                          const v = Math.max(1, Number(e.target.value) || 3)
                          onToggleLayer('grid', { visible: true, size: v })
                        }}
                        style={{ ...styles.floorInput, marginTop: 0, width: '100%' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>Color</div>
                      <input
                        type="color"
                        value={layers.grid?.color || '#3d8ef8'}
                        onChange={e => onToggleLayer('grid', { visible: true, color: e.target.value })}
                        style={{ width: '100%', height: '34px', borderRadius: '6px', border: '1px solid var(--border)', padding: '2px', background: 'var(--bg-panel)', cursor: 'pointer', marginTop: '2px' }}
                      />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>Opacity — {Math.round((layers.grid?.opacity ?? 0.15) * 100)}%</div>
                    <input
                      type="range"
                      min="5"
                      max="80"
                      step="5"
                      value={Math.round((layers.grid?.opacity ?? 0.15) * 100)}
                      onChange={e => onToggleLayer('grid', { visible: true, opacity: Number(e.target.value) / 100 })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                    <input
                      id="baseSnapToGridToggle"
                      type="checkbox"
                      checked={Boolean(layers.grid?.snap)}
                      onChange={e => onToggleLayer('grid', { visible: true, snap: e.target.checked })}
                    />
                    <label htmlFor="baseSnapToGridToggle" style={{ fontSize: '12px', color: 'var(--text)', cursor: 'pointer' }}>
                      Snap assets to base map grid
                    </label>
                  </div>
                </div>
              )}

              <input
                type="file"
                ref={mapImportInputRef}
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return

                  const reader = new FileReader()
                  reader.onload = () => {
                    try {
                      const raw = typeof reader.result === 'string' ? reader.result : ''
                      const parsed = JSON.parse(raw)
                      onImportProject?.(parsed)
                    } catch (error) {
                      window.alert('Could not import map JSON. Please use a valid EventWiz export file.')
                    } finally {
                      event.target.value = ''
                    }
                  }
                  reader.readAsText(file)
                }}
              />

              <div style={{ ...styles.floorCard, marginTop: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>Map JSON</div>
                <div style={{ ...styles.floorMeta, marginTop: 0, marginBottom: '8px' }}>
                  Load a full EventWiz map from an exported JSON file.
                </div>
                <button
                  type="button"
                  style={{ ...styles.floorInput, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, width: '100%', marginTop: 0 }}
                  onClick={() => mapImportInputRef.current?.click()}
                >
                  <Upload size={13} /> Import Map JSON
                </button>
              </div>

              {rootZones.length === 0 && !assets.length && !annotations.length && !lines.length && !floorPlans.length && (
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6, padding: '8px 2px' }}>
                  Layers will appear here after you place zones, assets, lines, annotations, or floor plans.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
