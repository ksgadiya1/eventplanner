import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import MapCanvas from './components/MapCanvas'
import PropertiesPanel from './components/PropertiesPanel'
import StatsBar from './components/StatsBar'
import HomeScreen from './components/HomeScreen'
import { computeZoneCapacity } from './data/assets'
import { getRouteStylePreset } from './data/routeTypes'
import { metersPerPixel } from './utils/mapGeometry'
import { formatArea, formatDistance } from './utils/units'

const API_BASE_URL = 'http://localhost:5000/api'

const PROJECT_STORAGE_KEY = 'eventwiz-project-v1'
const CUSTOM_ASSET_LIBRARY_STORAGE_KEY = 'eventwiz-custom-asset-library-v1'
const EVENT_META_STORAGE_KEY = 'eventwiz-event-meta-v1'
const NAV_STATE_STORAGE_KEY = 'eventwiz-nav-state-v1'

function readRouteState() {
  if (typeof window === 'undefined') return { currentView: 'home', eventId: null }

  const pathSegments = window.location.pathname.split('/').filter(Boolean)
  const simplePathId = pathSegments.length === 1 ? pathSegments[0] : null

  if (simplePathId) {
    return {
      currentView: 'editor',
      eventId: decodeURIComponent(simplePathId),
    }
  }

  const hash = window.location.hash || ''
  const legacyMatch = hash.match(/^#\/?(?:event\/)?([^/?#]+)/i)
  if (legacyMatch?.[1]) {
    return {
      currentView: 'editor',
      eventId: decodeURIComponent(legacyMatch[1]),
    }
  }

  return { currentView: 'home', eventId: null }
}

function readNavigationState() {
  if (typeof window === 'undefined') return { currentView: 'home', eventId: null }

  const routeState = readRouteState()
  if (routeState.currentView === 'editor' && routeState.eventId) {
    return routeState
  }

  try {
    const raw = window.localStorage.getItem(NAV_STATE_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    const shouldRestoreEditor = parsed?.currentView === 'editor' && parsed?.eventId

    return {
      currentView: shouldRestoreEditor ? 'editor' : 'home',
      eventId: shouldRestoreEditor ? parsed.eventId : null,
    }
  } catch {
    return { currentView: 'home', eventId: null }
  }
}

function writeNavigationState(currentView, eventId) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NAV_STATE_STORAGE_KEY, JSON.stringify({
      currentView: currentView === 'editor' && eventId ? 'editor' : 'home',
      eventId: currentView === 'editor' && eventId ? eventId : null,
    }))
  } catch {
    // ignore storage failures
  }
}

function writeRouteState(currentView, eventId, options = {}) {
  if (typeof window === 'undefined') return

  const { replace = true } = options
  const nextPath = currentView === 'editor' && eventId
    ? `/${encodeURIComponent(eventId)}`
    : '/'
  const nextUrl = `${nextPath}${window.location.search}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`

  if (currentUrl !== nextUrl) {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', nextUrl)
  }
}

const DEFAULT_LAYERS = {
  zones: { visible: true, locked: false },
  assets: { visible: true, locked: false },
  annotations: { visible: true, locked: false },
  lines: { visible: true, locked: false },
  floor: { visible: true, locked: false },
  grid: { visible: false, locked: false },
}

function collectDescendantZoneIds(rootZoneId, zones) {
  const descendantZoneIds = new Set()
  const stack = [rootZoneId]

  while (stack.length) {
    const currentZoneId = stack.pop()
    zones.forEach(zone => {
      if (zone.parentId === currentZoneId && !descendantZoneIds.has(zone.id)) {
        descendantZoneIds.add(zone.id)
        stack.push(zone.id)
      }
    })
  }

  return descendantZoneIds
}

function buildCascadeDeleteState(rootZoneId, zones, assets, lines, annotations) {
  const zoneIdsToDelete = new Set([rootZoneId, ...collectDescendantZoneIds(rootZoneId, zones)])

  return {
    zoneIdsToDelete,
    nextZones: zones.filter(zone => !zoneIdsToDelete.has(zone.id)),
    nextAssets: assets.filter(asset => !zoneIdsToDelete.has(asset.parentId)),
    nextLines: lines.filter(line => !zoneIdsToDelete.has(line.parentId)),
    nextAnnotations: annotations.filter(annotation => !zoneIdsToDelete.has(annotation.parentId)),
  }
}

function mergeAssetCategoryMaps(baseCategories = {}, extraCategories = {}) {
  const merged = { ...baseCategories }

  Object.entries(extraCategories || {}).forEach(([category, assets]) => {
    const nextAssets = Array.isArray(assets) ? assets : []
    const previousAssets = Array.isArray(merged[category]) ? merged[category] : []
    const lookup = new Map()

    previousAssets.forEach(asset => {
      if (asset?.id) lookup.set(asset.id, asset)
    })

    nextAssets.forEach(asset => {
      if (!asset) return
      lookup.set(asset.id || `${category}-${lookup.size}`, asset)
    })

    merged[category] = Array.from(lookup.values())
  })

  return merged
}

function readCustomAssetCategories() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(CUSTOM_ASSET_LIBRARY_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeCustomAssetCategories(categories) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CUSTOM_ASSET_LIBRARY_STORAGE_KEY, JSON.stringify(categories || {}))
  } catch {
    // ignore storage failures
  }
}

function readEventMetaMap() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(EVENT_META_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeEventMetaMap(metaMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(EVENT_META_STORAGE_KEY, JSON.stringify(metaMap || {}))
  } catch {
    // ignore storage failures
  }
}

function mergeEventsWithMeta(events = [], metaMap = {}) {
  return (Array.isArray(events) ? events : []).map(event => {
    const meta = event?.id ? (metaMap?.[event.id] || {}) : {}
    return {
      ...event,
      ...meta,
      name: meta.name || event?.name || 'Untitled Event',
      isArchived: Boolean(meta.isArchived ?? event?.isArchived ?? event?.archived ?? false),
    }
  })
}

function isPointOnSegment(point, start, end, tolerance = 1e-9) {
  const crossProduct = (point.lng - start.lng) * (end.lat - start.lat) - (point.lat - start.lat) * (end.lng - start.lng)
  if (Math.abs(crossProduct) > tolerance) return false

  const dotProduct = (point.lng - start.lng) * (end.lng - start.lng) + (point.lat - start.lat) * (end.lat - start.lat)
  if (dotProduct < 0) return false

  const squaredLength = (end.lng - start.lng) ** 2 + (end.lat - start.lat) ** 2
  return dotProduct <= squaredLength
}

function arePathsEqual(pathA, pathB, tolerance = 1e-7) {
  if (pathA === pathB) return true
  if (!Array.isArray(pathA) || !Array.isArray(pathB)) return false
  if (pathA.length !== pathB.length) return false

  return pathA.every((point, index) => {
    const otherPoint = pathB[index]
    return otherPoint
      && Math.abs((point.lat || 0) - (otherPoint.lat || 0)) <= tolerance
      && Math.abs((point.lng || 0) - (otherPoint.lng || 0)) <= tolerance
  })
}

function getPathCentroid(path) {
  if (!Array.isArray(path) || path.length === 0) return null
  const totals = path.reduce((sum, point) => ({
    lat: sum.lat + (point.lat || 0),
    lng: sum.lng + (point.lng || 0),
  }), { lat: 0, lng: 0 })

  return {
    lat: totals.lat / path.length,
    lng: totals.lng / path.length,
  }
}

function detectPathTranslation(previousPath, nextPath, tolerance = 1e-6) {
  if (!Array.isArray(previousPath) || !Array.isArray(nextPath) || previousPath.length !== nextPath.length || !previousPath.length) {
    return null
  }

  const previousCentroid = getPathCentroid(previousPath)
  const nextCentroid = getPathCentroid(nextPath)
  if (!previousCentroid || !nextCentroid) return null

  const delta = {
    lat: nextCentroid.lat - previousCentroid.lat,
    lng: nextCentroid.lng - previousCentroid.lng,
  }

  const isConsistent = previousPath.every((point, index) => {
    const nextPoint = nextPath[index]
    return nextPoint
      && Math.abs(((nextPoint.lat || 0) - (point.lat || 0)) - delta.lat) <= tolerance
      && Math.abs(((nextPoint.lng || 0) - (point.lng || 0)) - delta.lng) <= tolerance
  })

  return isConsistent ? delta : null
}

function detectPathTranslationByCentroid(previousPath, nextPath) {
  if (!Array.isArray(previousPath) || !Array.isArray(nextPath) || !previousPath.length || !nextPath.length) return null

  const previousCentroid = getPathCentroid(previousPath)
  const nextCentroid = getPathCentroid(nextPath)
  if (!previousCentroid || !nextCentroid) return null

  return {
    lat: nextCentroid.lat - previousCentroid.lat,
    lng: nextCentroid.lng - previousCentroid.lng,
  }
}

function translatePoint(point, delta) {
  if (!point || !delta) return point
  return {
    ...point,
    lat: (point.lat || 0) + delta.lat,
    lng: (point.lng || 0) + delta.lng,
  }
}

function translatePath(path, delta) {
  if (!Array.isArray(path) || !delta) return path
  return path.map(point => translatePoint(point, delta))
}

function isPointInPolygon(point, polygonPath) {
  if (!point || !polygonPath?.length || polygonPath.length < 3) return false

  let inside = false
  for (let i = 0, j = polygonPath.length - 1; i < polygonPath.length; j = i++) {
    const current = polygonPath[i]
    const previous = polygonPath[j]

    if (isPointOnSegment(point, previous, current)) {
      return true
    }

    const intersects = ((current.lat > point.lat) !== (previous.lat > point.lat))
      && (point.lng < ((previous.lng - current.lng) * (point.lat - current.lat)) / ((previous.lat - current.lat) || Number.EPSILON) + current.lng)

    if (intersects) inside = !inside
  }

  return inside
}

function findDeepestZoneForPoint(point, zones, excludedZoneId = null) {
  return zones
    .filter(zone => zone.id !== excludedZoneId && isPointInPolygon(point, zone.path))
    .sort((a, b) => (a.areaM2 || Number.MAX_SAFE_INTEGER) - (b.areaM2 || Number.MAX_SAFE_INTEGER))[0] || null
}

function normalizeAssetParent(asset, zones) {
  if (!asset?.lat || !asset?.lng) return asset
  const parentZone = findDeepestZoneForPoint({ lat: asset.lat, lng: asset.lng }, zones)
  return { ...asset, parentId: parentZone?.id || null }
}

function normalizeAnnotationParent(annotation, zones) {
  if (!annotation?.lat || !annotation?.lng) return annotation
  const parentZone = findDeepestZoneForPoint({ lat: annotation.lat, lng: annotation.lng }, zones)
  return { ...annotation, parentId: parentZone?.id || null }
}

function normalizeLineParent(line, zones) {
  const anchorPoint = line?.path?.[0]
  if (!anchorPoint) return line
  const parentZone = findDeepestZoneForPoint(anchorPoint, zones)
  return { ...line, parentId: parentZone?.id || null }
}

function collectRelatedZoneIds(rootZoneId, zones) {
  return new Set([rootZoneId, ...collectDescendantZoneIds(rootZoneId, zones)])
}

/**
 * Calculates the next versioned name (e.g., "Event v1", "Event v2")
 * based on existing names in a list.
 */
function getNextVersionName(baseName, existingNames) {
  const versionRegex = /\sv(\d+)$/;
  const trueBase = (baseName || '').replace(versionRegex, '').trim() || 'Untitled';

  let maxVersion = 0;
  const escapedBase = trueBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fullRegex = new RegExp(`^${escapedBase}(\\sv(\\d+))?$`, 'i');

  existingNames.forEach(name => {
    if (!name) return;
    const match = name.match(fullRegex);
    if (match) {
      if (match[2]) {
        maxVersion = Math.max(maxVersion, parseInt(match[2]));
      } else {
        // It's the base name exactly
        maxVersion = Math.max(maxVersion, 0);
      }
    }
  });

  return `${trueBase} v${maxVersion + 1}`;
}

export default function App() {
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem('eventwiz-theme')
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  const [currentView, setCurrentView] = useState(() => readNavigationState().currentView)
  const [eventId, setEventId] = useState(() => readNavigationState().eventId)
  const [eventMetaMap, setEventMetaMap] = useState(() => readEventMetaMap())
  const [eventList, setEventList] = useState([])
  const [assetData, setAssetData] = useState({
    categories: {},
    zoneTypes: [],
    crowdDensityOptions: []
  })
  const [drawMode, setDrawMode] = useState('select')
  const [selectedZoneType, setSelectedZoneType] = useState(null)
  const [lineStyle, setLineStyle] = useState(() => ({
    ...getRouteStylePreset('custom'),
  }))
  const [textStyle, setTextStyle] = useState({
    color: '#1f2937',
    backgroundColor: 'rgba(255,255,255,0.96)',
    fontSize: 14,
    borderColor: 'rgba(15,23,42,0.12)',
    borderWidth: 1,
    borderRadius: 12,
  })
  const [zones, setZones] = useState([])
  const [assets, setAssets] = useState([])
  const [lines, setLines] = useState([])
  const [annotations, setAnnotations] = useState([])
  const [floorPlan, setFloorPlan] = useState(null)
  const [placingFloor, setPlacingFloor] = useState(false)
  const [pendingAssetDef, setPendingAssetDef] = useState(null)
  const [annotationDraftText, setAnnotationDraftText] = useState('New annotation')
  const [selectedId, setSelectedId] = useState(null)
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [layers, setLayers] = useState(DEFAULT_LAYERS)
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [eventDetails, setEventDetails] = useState({
    name: '',
    eventType: 'festival',
    isArchived: false,
    locationQuery: '',
    resolvedLocation: null,
  })
  const [mapViewMode, setMapViewMode] = useState('roadmap')
  const [measurementUnit, setMeasurementUnit] = useState(() => {
    const saved = window.localStorage.getItem('eventwiz-measurement-unit')
    return (saved === 'feet' || saved === 'meters') ? saved : 'meters'
  })
  const mapRef = useRef(null)
  const hasHydratedRef = useRef(false)

  const refreshEventList = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/maps`)
    const data = await res.json()
    const mergedEvents = mergeEventsWithMeta(Array.isArray(data) ? data : [], eventMetaMap)
    setEventList(mergedEvents)
    return mergedEvents
  }, [eventMetaMap])

  // Fetch assets from backend
  useEffect(() => {
    fetch(`${API_BASE_URL}/assets`)
      .then(res => res.json())
      .then(data => {
        const customCategories = readCustomAssetCategories()
        const mergedData = {
          ...data,
          categories: mergeAssetCategoryMaps(data.categories, customCategories),
        }

        setAssetData(mergedData)
        if (mergedData.zoneTypes.length > 0) {
          // If we had a default zone type from local storage, try to keep it
          // Otherwise use the first one from backend
          setSelectedZoneType(prev => {
            const matched = mergedData.zoneTypes.find(z => z.id === prev?.id)
            return matched || mergedData.zoneTypes[0]
          })
        }
      })
      .catch(err => console.error('Error fetching assets:', err))
  }, [])

  // Fetch all events for home screen
  useEffect(() => {
    if (currentView === 'home') {
      refreshEventList().catch(err => console.error('Error fetching events:', err))
    }
  }, [currentView, refreshEventList])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('eventwiz-theme', theme)
  }, [theme])

  useEffect(() => {
    writeEventMetaMap(eventMetaMap)
  }, [eventMetaMap])

  useEffect(() => {
    writeNavigationState(currentView, eventId)
    writeRouteState(currentView, eventId)
  }, [currentView, eventId])

  useEffect(() => {
    const handleLocationChange = () => {
      const routeState = readRouteState()
      setCurrentView(routeState.currentView)
      setEventId(routeState.eventId)
    }

    window.addEventListener('popstate', handleLocationChange)
    window.addEventListener('hashchange', handleLocationChange)
    return () => {
      window.removeEventListener('popstate', handleLocationChange)
      window.removeEventListener('hashchange', handleLocationChange)
    }
  }, [])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY)
      if (!raw) {
        hasHydratedRef.current = true
        return
      }

      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') {
        hasHydratedRef.current = true
        return
      }

      // Load and clean zones - remove any with empty/missing labels
      let loadedZones = Array.isArray(parsed.zones) ? parsed.zones : []
      loadedZones = loadedZones.filter(z => z && z.label && z.label.trim())

      setZones(loadedZones)
      setAssets(Array.isArray(parsed.assets) ? parsed.assets : [])
      setLines(Array.isArray(parsed.lines) ? parsed.lines : [])
      setAnnotations(Array.isArray(parsed.annotations) ? parsed.annotations : [])
      setFloorPlan(parsed.floorPlan || null)
      setLayers({ ...DEFAULT_LAYERS, ...(parsed.layers || {}) })
      setLineStyle(prev => ({ ...prev, ...(parsed.lineStyle || {}) }))
      setTextStyle(prev => ({ ...prev, ...(parsed.textStyle || {}) }))
      setEventDetails(prev => ({ ...prev, ...(parsed.eventDetails || {}) }))
      if (typeof parsed.annotationDraftText === 'string') setAnnotationDraftText(parsed.annotationDraftText)
      if (typeof parsed.leftSidebarCollapsed === 'boolean') setLeftSidebarCollapsed(parsed.leftSidebarCollapsed)
      if (typeof parsed.mapViewMode === 'string') {
        const normalizedMapViewMode = parsed.mapViewMode === '2d'
          ? 'roadmap'
          : parsed.mapViewMode === '3d'
            ? 'hybrid'
            : parsed.mapViewMode

        if (['roadmap', 'terrain', 'hybrid', 'satellite'].includes(normalizedMapViewMode)) {
          setMapViewMode(normalizedMapViewMode)
        }
      }

      const storedZoneTypeId = parsed.selectedZoneType?.id
      const matchedZoneType = assetData.zoneTypes.find(zone => zone.id === storedZoneTypeId)
      if (matchedZoneType) setSelectedZoneType(matchedZoneType)
    } catch {
      // ignore invalid storage and start fresh
    } finally {
      hasHydratedRef.current = true
    }
  }, [])

  useEffect(() => {
    if (!hasHydratedRef.current) return
    // Filter out invalid zones before saving
    const cleanZones = zones.filter(z => z && z.label && z.label.trim() && z.label.trim() !== '0')
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      zones: cleanZones,
      assets,
      lines,
      annotations,
      floorPlan,
      layers,
      lineStyle,
      textStyle,
      annotationDraftText,
      leftSidebarCollapsed,
      selectedZoneType,
      eventDetails,
      mapViewMode,
    }

    try {
      window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // ignore storage quota failures
    }
  }, [annotationDraftText, annotations, assets, eventDetails, floorPlan, layers, leftSidebarCollapsed, lineStyle, lines, mapViewMode, selectedZoneType, textStyle, zones])

  useEffect(() => {
    if (drawMode !== 'select' && pendingAssetDef) {
      setPendingAssetDef(null)
    }
  }, [drawMode, pendingAssetDef])

  // Auto-clean zones with invalid labels (empty or "0")
  useEffect(() => {
    const invalidZoneIds = new Set(
      zones
        .filter(z => !z.label || z.label.trim() === '' || z.label.trim() === '0')
        .map(z => z.id)
    )

    if (invalidZoneIds.size > 0) {
      setZones(prev => prev.filter(z => !invalidZoneIds.has(z.id)))
      setAssets(prev => prev.filter(a => !invalidZoneIds.has(a.parentId)))
      setLines(prev => prev.filter(l => !invalidZoneIds.has(l.parentId)))
      setAnnotations(prev => prev.filter(ann => !invalidZoneIds.has(ann.parentId)))
    }
  }, [])

  const selectedItem = useMemo(() => {
    const foundItem = [...zones, ...assets, ...lines, ...annotations].find(i => i.id === selectedId)
    if (foundItem) {
      // Ensure type property is set
      if (zones.find(z => z.id === selectedId)) return { ...foundItem, type: 'zone' }
      if (assets.find(a => a.id === selectedId)) return { ...foundItem, type: 'asset' }
      if (lines.find(l => l.id === selectedId)) return { ...foundItem, type: 'line' }
      if (annotations.find(a => a.id === selectedId)) return { ...foundItem, type: 'annotation' }
    }
    if (selectedId === 'floor-plan' && floorPlan) return { id: 'floor-plan', type: 'floor', ...floorPlan }
    return null
  }, [annotations, assets, floorPlan, lines, selectedId, zones])

  const snapshot = useCallback(() => ({ zones, assets, lines, annotations, floorPlan }), [zones, assets, lines, annotations, floorPlan])

  const snapshotRef = useRef(snapshot)
  useEffect(() => { snapshotRef.current = snapshot }, [snapshot])

  const pushHistory = useCallback(() => {
    setUndoStack(s => [...s.slice(-50), snapshotRef.current()])
    setRedoStack([])
  }, [])

  // Zone created by drawing
  const handleZoneCreate = useCallback((zone) => {
    pushHistory()
    setZones(prev => [...prev, { ...zone, capacity: computeZoneCapacity(zone) }])
    setSelectedId(zone.id)
    setDrawMode('select')
  }, [pushHistory])

  // Asset dropped onto map
  const handleAssetDrop = useCallback((asset) => {
    pushHistory()
    const normalizedAsset = normalizeAssetParent(asset, zones)
    setAssets(prev => [...prev, normalizedAsset])
    setSelectedId(normalizedAsset.id)
    setPendingAssetDef(null)
  }, [pushHistory, zones])

  const handleImportAssets = useCallback((payload) => {
    if (payload?.mode === 'library-image') {
      const categoryLabel = String(payload.category || 'Custom Assets').trim() || 'Custom Assets'
      const baseName = String(payload.name || payload.fileName || 'Custom Asset').trim() || 'Custom Asset'
      const assetType = String(payload.assetType || 'custom').trim() || 'custom'

      const assetDefinition = {
        id: `custom_asset_${Date.now()}`,
        name: baseName,
        category: categoryLabel,
        assetType,
        iconType: 'image',
        imageUrl: payload.imageUrl,
        color: payload.color || '#3d8ef8',
        iconColor: payload.color || '#3d8ef8',
        defaultWidth: Number(payload.defaultWidth || 4),
        defaultLength: Number(payload.defaultLength || 4),
        keywords: [assetType, 'custom', categoryLabel.toLowerCase()],
        libraryTags: ['custom'],
      }

      setAssetData(prev => {
        const nextCategories = mergeAssetCategoryMaps(prev.categories, {
          [categoryLabel]: [assetDefinition],
        })
        writeCustomAssetCategories(nextCategories)
        return { ...prev, categories: nextCategories }
      })

      window.alert(`Custom asset "${baseName}" added to ${categoryLabel}.`)
      return
    }

    if (payload?.categories && typeof payload.categories === 'object') {
      const importedCategories = payload.categories
      setAssetData(prev => {
        const nextCategories = mergeAssetCategoryMaps(prev.categories, importedCategories)
        writeCustomAssetCategories(nextCategories)
        return { ...prev, categories: nextCategories }
      })
      window.alert('Asset library imported successfully.')
      return
    }

    const incomingAssets = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.assets) ? payload.assets : [])

    if (!incomingAssets.length) {
      window.alert('No asset data found in the selected file.')
      return
    }

    const importedAssets = incomingAssets
      .map((asset, index) => {
        const lat = Number(asset?.lat)
        const lng = Number(asset?.lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

        return normalizeAssetParent({
          ...asset,
          id: asset?.id || `asset_import_${Date.now()}_${index}`,
          type: 'asset',
          lat,
          lng,
          widthM: Number(asset?.widthM ?? asset?.assetDef?.defaultWidth ?? 4),
          lengthM: Number(asset?.lengthM ?? asset?.assetDef?.defaultLength ?? asset?.widthM ?? 4),
          rotationDeg: Number(asset?.rotationDeg ?? 0),
          label: asset?.label || asset?.assetDef?.name || 'Imported Asset',
          status: asset?.status || 'planned',
          notes: asset?.notes || '',
        }, zones)
      })
      .filter(Boolean)

    if (!importedAssets.length) {
      window.alert('No valid asset positions were found to import.')
      return
    }

    pushHistory()
    setAssets(prev => [...prev, ...importedAssets])
    setSelectedId(importedAssets[importedAssets.length - 1].id)
    setDrawMode('select')
    window.alert(`${importedAssets.length} asset(s) imported successfully.`)
  }, [pushHistory, zones])

  const handleImportProject = useCallback((payload) => {
    const isSupportedPayload = payload && typeof payload === 'object' && (
      'zones' in payload
      || 'assets' in payload
      || 'lines' in payload
      || 'annotations' in payload
      || 'floorPlan' in payload
      || 'eventDetails' in payload
    )

    if (!isSupportedPayload) {
      window.alert('Please select a valid EventWiz map JSON export.')
      return
    }

    const importedZones = (Array.isArray(payload.zones) ? payload.zones : [])
      .filter(Boolean)
      .map(zone => ({
        ...zone,
        type: 'zone',
        capacity: zone?.capacity ?? computeZoneCapacity(zone, zone?.density || 0.5),
      }))

    const importedAssets = (Array.isArray(payload.assets) ? payload.assets : [])
      .filter(Boolean)
      .map(asset => normalizeAssetParent({ ...asset, type: 'asset' }, importedZones))

    const importedLines = (Array.isArray(payload.lines) ? payload.lines : [])
      .filter(Boolean)
      .map(line => normalizeLineParent({ ...line, type: 'line' }, importedZones))

    const importedAnnotations = (Array.isArray(payload.annotations) ? payload.annotations : [])
      .filter(Boolean)
      .map(annotation => normalizeAnnotationParent({
        ...annotation,
        type: 'annotation',
        text: annotation?.text || annotation?.label || 'New annotation',
      }, importedZones))

    const importedMapViewMode = payload.mapViewMode === '2d'
      ? 'roadmap'
      : payload.mapViewMode === '3d'
        ? 'hybrid'
        : payload.mapViewMode

    pushHistory()
    setZones(importedZones)
    setAssets(importedAssets)
    setLines(importedLines)
    setAnnotations(importedAnnotations)
    setFloorPlan(payload.floorPlan || null)
    setLayers({ ...DEFAULT_LAYERS, ...(payload.layers || {}) })
    setLineStyle(prev => ({ ...prev, ...(payload.lineStyle || {}) }))
    setTextStyle(prev => ({ ...prev, ...(payload.textStyle || {}) }))
    setEventDetails(prev => ({ ...prev, ...(payload.eventDetails || {}) }))
    setAnnotationDraftText(typeof payload.annotationDraftText === 'string' ? payload.annotationDraftText : 'New annotation')
    if (typeof payload.leftSidebarCollapsed === 'boolean') {
      setLeftSidebarCollapsed(payload.leftSidebarCollapsed)
    }
    if (['roadmap', 'terrain', 'hybrid', 'satellite'].includes(importedMapViewMode)) {
      setMapViewMode(importedMapViewMode)
    }
    setSelectedZoneType(prev => {
      const importedZoneTypeId = payload.selectedZoneType?.id
      if (!importedZoneTypeId) return prev
      return assetData.zoneTypes.find(zone => zone.id === importedZoneTypeId) || payload.selectedZoneType || prev
    })
    setSelectedId(null)
    setPendingAssetDef(null)
    setPlacingFloor(false)
    setDrawMode('select')
    window.alert('Map JSON imported successfully.')
  }, [assetData.zoneTypes, pushHistory])

  const handleDownloadAssetList = useCallback(() => {
    if (!assets.length) {
      window.alert('No assets available to download.')
      return
    }

    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = assets.map(asset => {
      const parentZone = zones.find(zone => zone.id === asset.parentId)
      return [
        asset.label || asset.assetDef?.name || 'Asset',
        asset.assetDef?.id || '',
        asset.assetDef?.category || '',
        asset.lat ?? '',
        asset.lng ?? '',
        asset.widthM ?? '',
        asset.lengthM ?? '',
        asset.rotationDeg ?? 0,
        asset.status || 'planned',
        parentZone?.label || parentZone?.zoneType?.name || '',
      ].map(escapeCsv).join(',')
    })

    const csv = [
      'Label,Asset Type,Category,Latitude,Longitude,Width (m),Length (m),Rotation (deg),Status,Parent Zone',
      ...rows,
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `eventwiz-assets-${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [assets, zones])

  const handleLineCreate = useCallback((line) => {
    pushHistory()
    setLines(prev => [...prev, line])
    setSelectedId(line.id)
    setDrawMode('select')
  }, [pushHistory])

  const handleAnnotationCreate = useCallback((annotation) => {
    pushHistory()
    setAnnotations(prev => [...prev, annotation])
    setSelectedId(annotation.id)
    setDrawMode('select')
  }, [pushHistory])

  // Asset drag start
  const handleAssetDragStart = useCallback((e, assetDef) => {
    setPendingAssetDef(null)
    e.dataTransfer.setData('application/eventwiz-asset', JSON.stringify(assetDef))
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handleAssetDragEnd = useCallback(() => { }, [])

  const handleAssetClickPlace = useCallback((assetDef) => {
    setPendingAssetDef(prev => (prev?.id === assetDef.id ? null : assetDef))
    setDrawMode('select')
  }, [])

  // Select item
  const handleSelect = useCallback((item) => {
    setPendingAssetDef(null)
    setSelectedId(item.id)
    setDrawMode('select')

    // Auto-zoom to selected item on map
    if (mapRef.current && window.google) {
      let targetLat = null
      let targetLng = null
      let zoomLevel = 16

      if (item.type === 'zone' || item.zoneType) {
        // For zones, calculate center of polygon
        if (item.path && item.path.length > 0) {
          let sumLat = 0, sumLng = 0
          item.path.forEach(point => {
            sumLat += point.lat
            sumLng += point.lng
          })
          targetLat = sumLat / item.path.length
          targetLng = sumLng / item.path.length
          zoomLevel = 16
        }
      } else if (item.type === 'line' || (item.path && !item.zoneType)) {
        // For lines, calculate center of line path
        if (item.path && item.path.length > 0) {
          let sumLat = 0, sumLng = 0
          item.path.forEach(point => {
            sumLat += point.lat
            sumLng += point.lng
          })
          targetLat = sumLat / item.path.length
          targetLng = sumLng / item.path.length
          zoomLevel = 16
        }
      } else if (item.lat !== undefined && item.lng !== undefined) {
        // For assets, annotations — pan only, no zoom change
        targetLat = item.lat
        targetLng = item.lng
        zoomLevel = null
      }

      if (targetLat !== null && targetLng !== null) {
        mapRef.current.panTo({ lat: targetLat, lng: targetLng })
        // Only zoom in if currently zoomed out further than the target level
        if (zoomLevel !== null) {
          const currentZoom = mapRef.current.getZoom()
          if (currentZoom < zoomLevel) {
            mapRef.current.setZoom(zoomLevel)
          }
        }
      }
    }
  }, [])

  const updateDebounceRef = useRef(null)

  // Update selected item properties
  const handleUpdate = useCallback((updated) => {
    // Debounce history push for rapid text/number edits (300ms)
    clearTimeout(updateDebounceRef.current)
    updateDebounceRef.current = setTimeout(() => pushHistory(), 300)
    if (updated.type === 'zone') {
      const previousZone = zones.find(zone => zone.id === updated.id)
      const isZoneGeometryChange = !arePathsEqual(previousZone?.path, updated.path)
      const didLayoutChange = previousZone?.layoutType !== updated.layoutType
      const nextZoneRecord = {
        ...updated,
        capacity: computeZoneCapacity(updated),
      }

      if (didLayoutChange) {
        setLayers(prev => ({
          ...prev,
          grid: { ...prev.grid, visible: false },
        }))
      }

      if (isZoneGeometryChange) {
        const translation = detectPathTranslation(previousZone?.path, updated.path)
          || detectPathTranslationByCentroid(previousZone?.path, updated.path)
        const zoneIdsToMove = collectRelatedZoneIds(updated.id, zones)
        const nextZones = zones.map(zone => {
          if (zone.id === updated.id) return nextZoneRecord
          if (!translation || !zoneIdsToMove.has(zone.parentId)) return zone

          const movedPath = translatePath(zone.path, translation)
          return {
            ...zone,
            path: movedPath,
            areaM2: zone.areaM2,
            perimeterM: zone.perimeterM,
            capacity: computeZoneCapacity({ ...zone, path: movedPath, areaM2: zone.areaM2 }),
          }
        })

        if (translation) {
          setZones(nextZones)
          setAssets(assets.map(asset => (
            zoneIdsToMove.has(asset.parentId)
              ? {
                ...asset,
                ...translatePoint(asset, translation),
              }
              : asset
          )))
          setAnnotations(annotations.map(annotation => (
            zoneIdsToMove.has(annotation.parentId)
              ? {
                ...annotation,
                ...translatePoint(annotation, translation),
              }
              : annotation
          )))
          setLines(lines.map(line => (
            zoneIdsToMove.has(line.parentId)
              ? {
                ...line,
                path: translatePath(line.path, translation),
              }
              : line
          )))
        } else {
          setZones(nextZones)
          setAssets(assets.map(asset => normalizeAssetParent(asset, nextZones)))
          setAnnotations(annotations.map(annotation => normalizeAnnotationParent(annotation, nextZones)))
          setLines(lines.map(line => normalizeLineParent(line, nextZones)))
        }
      } else {
        setZones(prev => prev.map(z => z.id === updated.id ? nextZoneRecord : z))
      }
    } else if (updated.type === 'line') {
      const normalizedLine = normalizeLineParent(updated, zones)
      setLines(prev => prev.map(line => line.id === updated.id ? normalizedLine : line))
    } else if (updated.type === 'annotation') {
      const normalizedAnnotation = normalizeAnnotationParent(updated, zones)
      setAnnotations(prev => prev.map(annotation => annotation.id === updated.id ? normalizedAnnotation : annotation))
    } else if (updated.type === 'floor') {
      setFloorPlan(prev => prev ? {
        ...prev,
        ...updated,
      } : prev)
    } else {
      const normalizedAsset = normalizeAssetParent(updated, zones)
      setAssets(prev => prev.map(a => a.id === updated.id ? normalizedAsset : a))
    }
  }, [annotations, assets, lines, pushHistory, selectedId, zones])

  const handleToggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])

  const handleMeasurementUnitChange = useCallback((unit) => {
    if (unit === 'feet' || unit === 'meters') {
      setMeasurementUnit(unit)
      window.localStorage.setItem('eventwiz-measurement-unit', unit)
    }
  }, [])

  const handleDrawMode = useCallback((mode) => {
    if (mode === 'line') {
      mode = 'route'
    }

    setDrawMode(mode)

    if (mode === 'route') {
      const preset = getRouteStylePreset(lineStyle?.routeType || 'custom')
      setLineStyle(prev => ({
        ...prev,
        ...preset,
      }))
    }
  }, [lineStyle?.routeType])

  const handleLocationSearch = useCallback(() => {
    const query = (eventDetails.locationQuery || '').trim()
    if (!query) return
    setEventDetails(prev => ({
      ...prev,
      locationQuery: query,
      resolvedLocation: null,
    }))
  }, [eventDetails.locationQuery])

  const handleFloorPlanUpload = useCallback((imageUrl) => {
    setFloorPlan({
      id: 'floor-plan',
      type: 'floor',
      imageUrl,
      bounds: null,
      opacity: 0.7,
      rotation: 0,
    })
    setPlacingFloor(true)
  }, [])

  const handleFloorPlanChange = useCallback((updater) => {
    setFloorPlan(prev => typeof updater === 'function' ? updater(prev) : updater)
  }, [])

  // Delete selected
  const handleDelete = useCallback(() => {
    if (!selectedId) return
    pushHistory()
    if (zones.some(zone => zone.id === selectedId)) {
      const cascadeState = buildCascadeDeleteState(selectedId, zones, assets, lines, annotations)
      setZones(cascadeState.nextZones)
      setAssets(prev => prev.filter(asset => asset.id !== selectedId && !cascadeState.zoneIdsToDelete.has(asset.parentId)))
      setLines(prev => prev.filter(line => line.id !== selectedId && !cascadeState.zoneIdsToDelete.has(line.parentId)))
      setAnnotations(prev => prev.filter(annotation => annotation.id !== selectedId && !cascadeState.zoneIdsToDelete.has(annotation.parentId)))
    } else {
      setZones(prev => prev.filter(z => z.id !== selectedId))
      setAssets(prev => prev.filter(a => a.id !== selectedId))
      setLines(prev => prev.filter(line => line.id !== selectedId))
      setAnnotations(prev => prev.filter(annotation => annotation.id !== selectedId))
    }
    if (selectedId === 'floor-plan') setFloorPlan(null)
    setSelectedId(null)
  }, [annotations, assets, lines, pushHistory, selectedId, zones])

  const handleUndo = useCallback(() => {
    setUndoStack(stack => {
      if (!stack.length) return stack
      const prev = stack[stack.length - 1]
      const current = { zones, assets, lines, annotations, floorPlan }
      setRedoStack(r => [...r.slice(-50), current])
      setZones(prev.zones)
      setAssets(prev.assets)
      setLines(prev.lines || [])
      setAnnotations(prev.annotations || [])
      setFloorPlan(prev.floorPlan || null)
      setSelectedId(null)
      return stack.slice(0, -1)
    })
  }, [zones, assets, lines, annotations, floorPlan])

  const handleRedo = useCallback(() => {
    setRedoStack(stack => {
      if (!stack.length) return stack
      const next = stack[stack.length - 1]
      const current = { zones, assets, lines, annotations, floorPlan }
      setUndoStack(u => [...u.slice(-50), current])
      setZones(next.zones)
      setAssets(next.assets)
      setLines(next.lines || [])
      setAnnotations(next.annotations || [])
      setFloorPlan(next.floorPlan || null)
      setSelectedId(null)
      return stack.slice(0, -1)
    })
  }, [zones, assets, lines, annotations, floorPlan])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target
      const tagName = target?.tagName?.toLowerCase?.()
      const isTypingField = tagName === 'input' || tagName === 'textarea' || target?.isContentEditable
      if (isTypingField) return

      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const ctrl = isMac ? event.metaKey : event.ctrlKey

      if (ctrl && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
        return
      }
      if (ctrl && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault()
        handleRedo()
        return
      }

      if (!selectedId) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setSelectedId(null)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        handleDelete()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleDelete, handleRedo, handleUndo, selectedId])

  // Layer toggles
  const handleDuplicate = useCallback(() => {
    const selectedAsset = assets.find(asset => asset.id === selectedId)
    if (!selectedAsset) return

    pushHistory()
    const offsetTarget = window.google?.maps?.geometry?.spherical
      ? window.google.maps.geometry.spherical.computeOffset(
        new window.google.maps.LatLng(selectedAsset.lat, selectedAsset.lng),
        6,
        135
      )
      : null

    const duplicated = {
      ...selectedAsset,
      id: `asset_${Date.now()}`,
      lat: offsetTarget ? offsetTarget.lat() : selectedAsset.lat + 0.00004,
      lng: offsetTarget ? offsetTarget.lng() : selectedAsset.lng + 0.00004,
      label: getNextVersionName(selectedAsset.label || 'Asset', assets.map(a => a.label)),
    }

    setAssets(prev => [...prev, duplicated])
    setSelectedId(duplicated.id)
    setDrawMode('select')
  }, [assets, pushHistory, selectedId])

  const handleToggleLayer = useCallback((layerId, options) => {
    setLayers(prev => {
      const layer = prev[layerId] || { visible: true, locked: false }
      let nextLayer

      if (options) {
        nextLayer = { ...layer, ...options }
      } else {
        nextLayer = { ...layer, visible: !layer.visible }
      }

      if (nextLayer.visible === false) {
        if (layerId === 'lines' && lines.some(line => line.id === selectedId)) {
          setSelectedId(null)
        }
        if (layerId === 'zones' && zones.some(zone => zone.id === selectedId)) {
          setSelectedId(null)
        }
      }

      return {
        ...prev,
        [layerId]: nextLayer,
      }
    })
  }, [lines, selectedId, zones])

  const handleEraseAsset = useCallback((idOrItem, type) => {
    // Support both old and new signatures for backward compatibility
    let id = idOrItem?.id || idOrItem
    let itemType = type || idOrItem?.type

    if (!id) return
    pushHistory()

    // Handle deletion based on type
    if (itemType === 'line') {
      setLines(prev => prev.filter(l => l.id !== id))
    } else if (itemType === 'annotation') {
      setAnnotations(prev => prev.filter(a => a.id !== id))
    } else if (itemType === 'zone' || itemType === 'zone-plan') {
      const cascadeState = buildCascadeDeleteState(id, zones, assets, lines, annotations)
      setZones(cascadeState.nextZones)
      setAssets(prev => prev.filter(a => a.id !== id && !cascadeState.zoneIdsToDelete.has(a.parentId)))
      setLines(prev => prev.filter(l => l.id !== id && !cascadeState.zoneIdsToDelete.has(l.parentId)))
      setAnnotations(prev => prev.filter(a => a.id !== id && !cascadeState.zoneIdsToDelete.has(a.parentId)))
    } else {
      // Default: treat as asset
      setAssets(prev => prev.filter(a => a.id !== id))
    }

    if (selectedId === id) setSelectedId(null)
  }, [annotations, assets, buildCascadeDeleteState, lines, pushHistory, selectedId, zones])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target
      const tagName = target?.tagName?.toLowerCase?.()
      const isTypingField = tagName === 'input' || tagName === 'textarea' || target?.isContentEditable
      if (isTypingField) return

      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const ctrl = isMac ? event.metaKey : event.ctrlKey

      if (ctrl && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
        return
      }
      if (ctrl && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault()
        handleRedo()
        return
      }

      if (!selectedId) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setSelectedId(null)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        handleDelete()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleDelete, handleRedo, handleUndo, selectedId])

  const handleToggleVisibility = useCallback((layerId) => {
    setLayers(prev => ({
      ...prev,
      [layerId]: { ...prev[layerId], visible: !prev[layerId].visible }
    }))
  }, [])

  const handleToggleLock = useCallback((layerId) => {
    setLayers(prev => ({
      ...prev,
      [layerId]: { ...prev[layerId], locked: !prev[layerId].locked }
    }))
  }, [])

  // Capture the map container DOM node as a data URL
  const captureMapImage = useCallback(async () => {
    const map = mapRef.current
    if (!map) throw new Error('Map not loaded')
    const mapDiv = map.getDiv()
    if (!mapDiv) throw new Error('Map container not found')

    // html-to-image captures the entire DOM subtree including canvas tiles, overlays, SVG
    const dataUrl = await toPng(mapDiv, {
      cacheBust: true,
      pixelRatio: 2,
      skipFonts: true,
      // Skip Google UI controls (zoom buttons, map type switcher, etc.)
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true
        const cls = node.className || ''
        if (typeof cls === 'string' && (cls.includes('gm-control') || cls.includes('gm-style-cc') || cls.includes('gm-bundled-control'))) return false
        return true
      },
    })
    return dataUrl
  }, [])

  // Export current viewport as PNG / PDF / JSON
  const handleExport = useCallback(async (format = 'png') => {
    if (format === 'json') {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        eventDetails,
        zones,
        assets,
        lines,
        annotations,
        floorPlan,
        layers,
        lineStyle,
        textStyle,
        selectedZoneType,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `eventwiz-layout-${Date.now()}.json`
      link.click()
      URL.revokeObjectURL(downloadUrl)
      return
    }

    try {
      const dataUrl = await captureMapImage()

      if (format === 'png') {
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = `eventwiz-map-${Date.now()}.png`
        link.click()
        return
      }

      if (format === 'pdf') {
        const img = new Image()
        img.src = dataUrl
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
        })

        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: 'a4',
        })

        const pageW = pdf.internal.pageSize.getWidth()
        const pageH = pdf.internal.pageSize.getHeight()
        const margin = 28
        const contentW = pageW - margin * 2
        let cursorY = margin

        const getZoneName = (zone) => {
          const customLabel = typeof zone?.label === 'string' ? zone.label.trim() : ''
          return customLabel || zone?.zoneType?.name || 'Zone'
        }
        const getAssetLabel = (asset) => asset?.label?.trim() || asset?.assetDef?.label || asset?.assetDef?.name || 'Asset'
        const toText = (value, fallback = '—') => {
          if (value === null || value === undefined) return fallback
          const text = String(value).trim()
          return text || fallback
        }
        const zoneLookup = new Map(zones.map(zone => [zone.id, getZoneName(zone)]))
        const addPageIfNeeded = (needed = 24) => {
          if (cursorY + needed <= pageH - margin) return
          pdf.addPage()
          cursorY = margin
        }
        const addSectionTitle = (title) => {
          addPageIfNeeded(42)
          if (cursorY > margin) cursorY += 4
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(16)
          pdf.setTextColor(17, 24, 39)
          pdf.text(title, margin, cursorY)
          pdf.setDrawColor(226, 232, 240)
          pdf.setLineWidth(1)
          pdf.line(margin, cursorY + 8, pageW - margin, cursorY + 8)
          cursorY += 24
        }
        const addCard = (title, lines = []) => {
          const wrapped = lines.flatMap(line => pdf.splitTextToSize(line, contentW - 28))
          const lineHeight = 15
          const headerHeight = 22
          const bodyTop = 38
          const bottomPadding = 12
          const cardHeight = Math.max(62, bodyTop + wrapped.length * lineHeight + bottomPadding)

          addPageIfNeeded(cardHeight + 14)
          pdf.setDrawColor(218, 223, 232)
          pdf.setFillColor(250, 251, 253)
          pdf.roundedRect(margin, cursorY, contentW, cardHeight, 8, 8, 'FD')

          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(12)
          pdf.setTextColor(15, 23, 42)
          pdf.text(title, margin + 14, cursorY + headerHeight)

          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(10)
          pdf.setTextColor(71, 85, 105)

          let lineY = cursorY + bodyTop
          wrapped.forEach(line => {
            pdf.text(line, margin + 14, lineY)
            lineY += lineHeight
          })

          cursorY += cardHeight + 14
        }

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(22)
        pdf.setTextColor(15, 23, 42)
        pdf.text(eventDetails?.name || 'EventWiz Detailed Report', margin, cursorY)
        cursorY += 18

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(11)
        pdf.setTextColor(71, 85, 105)
        pdf.text(`Generated ${new Date().toLocaleString()} | View ${mapViewMode || 'roadmap'} | Unit ${measurementUnit}`, margin, cursorY)
        cursorY += 16

        const mapMaxHeight = 220
        const imageScale = Math.min(contentW / img.naturalWidth, mapMaxHeight / img.naturalHeight)
        const renderW = img.naturalWidth * imageScale
        const renderH = img.naturalHeight * imageScale
        pdf.addImage(dataUrl, 'PNG', margin, cursorY, renderW, renderH)
        cursorY += renderH + 16

        const uniqueZoneTypes = []
        const seenIds = new Set()
        for (const zone of zones) {
          const zoneType = zone.zoneType
          if (zoneType?.id && !seenIds.has(zoneType.id)) {
            seenIds.add(zoneType.id)
            uniqueZoneTypes.push(zoneType)
          }
        }

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(13)
        pdf.setTextColor(30, 41, 59)
        pdf.text('Snapshot Overview', margin, cursorY)
        cursorY += 14
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
        pdf.text(`Zones: ${zones.length}   Assets: ${assets.length}   Routes: ${lines.length}   Notes: ${annotations.length}`, margin, cursorY)
        cursorY += 12

        if (uniqueZoneTypes.length) {
          let legendX = margin
          let legendY = cursorY
          uniqueZoneTypes.forEach((zoneType, index) => {
            const hex = zoneType.color || '#3d8ef8'
            const normalizedHex = /^#([0-9a-f]{6})$/i.test(hex) ? hex : '#3d8ef8'
            const r = parseInt(normalizedHex.slice(1, 3), 16)
            const g = parseInt(normalizedHex.slice(3, 5), 16)
            const b = parseInt(normalizedHex.slice(5, 7), 16)
            if (index > 0 && legendX > pageW - 150) {
              legendX = margin
              legendY += 16
            }
            pdf.setFillColor(r, g, b)
            pdf.rect(legendX, legendY - 8, 10, 10, 'F')
            pdf.setTextColor(55, 65, 81)
            pdf.text(zoneType.name || zoneType.id, legendX + 16, legendY)
            legendX += 120
          })
          cursorY = legendY + 18
        } else {
          cursorY += 6
        }

        pdf.addPage()
        cursorY = margin

        addSectionTitle('Event Summary')
        addCard('Event Details', [
          `Name: ${toText(eventDetails?.name, 'Untitled Event')}`,
          `Type: ${toText(eventDetails?.eventType, 'general')}`,
          `Location Query: ${toText(eventDetails?.locationQuery)}`,
          `Resolved Address: ${toText(eventDetails?.resolvedLocation?.formattedAddress)}`,
          `Coordinates: ${eventDetails?.resolvedLocation?.lat != null && eventDetails?.resolvedLocation?.lng != null
            ? `${Number(eventDetails.resolvedLocation.lat).toFixed(5)}, ${Number(eventDetails.resolvedLocation.lng).toFixed(5)}`
            : '—'}`,
        ])
        addCard('Plan Totals', [
          `Zones: ${zones.length}`,
          `Assets: ${assets.length}`,
          `Routes / Lines: ${lines.length}`,
          `Annotations: ${annotations.length}`,
          `Floor Plan Added: ${floorPlan?.bounds ? 'Yes' : 'No'}`,
        ])

        addSectionTitle('Zone Details')
        if (zones.length) {
          zones.forEach((zone, index) => {
            const centroid = zone.path?.length
              ? zone.path.reduce((acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }), { lat: 0, lng: 0 })
              : null
            const zoneCenter = centroid
              ? `${(centroid.lat / zone.path.length).toFixed(5)}, ${(centroid.lng / zone.path.length).toFixed(5)}`
              : '—'

            addCard(`${index + 1}. ${getZoneName(zone)}`, [
              `Type: ${toText(zone.zoneType?.name, zone.zoneType?.id || 'Zone')}`,
              `Status: ${toText(zone.status, 'planned')}`,
              `Layout: ${toText(zone.layoutType, 'free')}`,
              `Parent: ${toText(zoneLookup.get(zone.parentId))}`,
              `Area: ${formatArea(zone.areaM2, measurementUnit)}`,
              `Perimeter: ${formatDistance(zone.perimeterM, measurementUnit)}`,
              `Capacity: ${zone.capacity != null ? Number(zone.capacity).toLocaleString() : '—'}`,
              `Center: ${zoneCenter}`,
            ])
          })
        } else {
          addCard('No Zones', ['No zones have been created in this plan yet.'])
        }

        addSectionTitle('Asset Placement Details')
        if (assets.length) {
          assets.forEach((asset, index) => {
            addCard(`${index + 1}. ${getAssetLabel(asset)}`, [
              `Type: ${toText(asset.assetDef?.category, asset.assetDef?.id || 'asset')}`,
              `Parent Zone: ${toText(zoneLookup.get(asset.parentId))}`,
              `Position: ${Number(asset.lat || 0).toFixed(5)}, ${Number(asset.lng || 0).toFixed(5)}`,
              `Size: ${formatDistance(asset.widthM || asset.assetDef?.defaultWidth || 0, measurementUnit)} × ${formatDistance(asset.lengthM || asset.assetDef?.defaultLength || 0, measurementUnit)}`,
              `Rotation: ${Number(asset.rotationDeg || 0).toFixed(0)}°`,
            ])
          })
        } else {
          addCard('No Assets', ['No assets have been placed on the map yet.'])
        }

        addSectionTitle('Routes and Line Details')
        if (lines.length) {
          lines.forEach((line, index) => {
            addCard(`${index + 1}. ${toText(line.label, 'Route')}`, [
              `Route Type: ${toText(line.routeType, 'custom')}`,
              `Parent Zone: ${toText(zoneLookup.get(line.parentId))}`,
              `Length: ${formatDistance(line.lengthM, measurementUnit)}`,
              `Segments: ${Math.max(0, (line.path?.length || 1) - 1)}`,
              `Style: ${toText(line.pattern, 'solid')}`,
              `Weight: ${toText(line.strokeWeight, 4)}`,
              `Color: ${toText(line.color, '#f59e0b')}`,
            ])
          })
        } else {
          addCard('No Routes', ['No route or line data has been added yet.'])
        }

        addSectionTitle('Notes and Overlays')
        if (annotations.length) {
          annotations.forEach((annotation, index) => {
            addCard(`${index + 1}. Annotation`, [
              `Text: ${toText(annotation.text, '—')}`,
              `Position: ${Number(annotation.lat || 0).toFixed(5)}, ${Number(annotation.lng || 0).toFixed(5)}`,
            ])
          })
        } else {
          addCard('Annotations', ['No annotation notes have been added.'])
        }

        addCard('Floor Plan', [
          `Attached: ${floorPlan?.bounds ? 'Yes' : 'No'}`,
          `Opacity: ${floorPlan?.opacity != null ? `${Math.round(floorPlan.opacity * 100)}%` : '—'}`,
          `Rotation: ${floorPlan?.rotation != null ? `${floorPlan.rotation}°` : '—'}`,
        ])

        pdf.save(`eventwiz-detailed-report-${Date.now()}.pdf`)
        return
      }
    } catch (err) {
      console.error('Export failed:', err)
      window.alert(`Could not export ${format.toUpperCase()}. ${err.message || 'Unknown error.'}`)
    }
  }, [annotations, assets, captureMapImage, eventDetails, floorPlan, layers, lineStyle, lines, mapViewMode, measurementUnit, selectedZoneType, textStyle, zones])

  const updateEventMeta = useCallback((id, patch = null) => {
    if (!id) return
    setEventMetaMap(prev => {
      const next = { ...prev }
      if (!patch) {
        delete next[id]
      } else {
        next[id] = {
          ...(next[id] || {}),
          ...patch,
        }
      }
      return next
    })
  }, [])

  const loadEventRecord = useCallback(async (id) => {
    const res = await fetch(`${API_BASE_URL}/maps/${id}`)
    const data = await res.json()
    if (!res.ok || data.error || !data.success) {
      throw new Error(data.error || data.message || 'Failed to load event')
    }

    const meta = eventMetaMap[id] || {}
    return {
      ...data,
      name: meta.name || data.name,
      isArchived: Boolean(meta.isArchived ?? data.isArchived ?? data.archived ?? data.settings?.archived ?? false),
    }
  }, [eventMetaMap])

  const persistEventPatch = useCallback(async (id, patch = {}) => {
    const currentData = await loadEventRecord(id)
    const nextArchived = Boolean(patch.isArchived ?? patch.archived ?? currentData.isArchived)
    const nextSettings = {
      ...(currentData.settings || {}),
      ...(patch.settings || {}),
      archived: nextArchived,
    }

    const requestBody = {
      name: patch.name ?? currentData.name ?? 'Untitled Event',
      eventType: patch.eventType ?? currentData.eventType ?? currentData.event_type ?? 'festival',
      center_lat: patch.center_lat ?? currentData.center_lat ?? 51.505,
      center_lng: patch.center_lng ?? currentData.center_lng ?? -0.09,
      zoom: patch.zoom ?? currentData.zoom ?? 13,
      measurementUnit: patch.measurementUnit ?? currentData.measurementUnit ?? 'meters',
      layers: patch.layers ?? currentData.layers ?? DEFAULT_LAYERS,
      settings: nextSettings,
      zones: patch.zones ?? currentData.zones ?? [],
      assets: patch.assets ?? currentData.assets ?? [],
      lines: patch.lines ?? currentData.lines ?? [],
      annotations: patch.annotations ?? currentData.annotations ?? [],
      archived: nextArchived,
    }

    const res = await fetch(`${API_BASE_URL}/maps/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })
    const data = await res.json()

    if (!res.ok || data.error || data.success === false) {
      throw new Error(data.error || data.message || 'Failed to update event')
    }

    updateEventMeta(id, {
      name: requestBody.name,
      isArchived: nextArchived,
    })
    setEventList(prev => prev.map(event => (
      event.id === id
        ? {
          ...event,
          name: requestBody.name,
          eventType: requestBody.eventType,
          isArchived: nextArchived,
        }
        : event
    )))

    if (eventId === id) {
      setEventDetails(prev => ({
        ...prev,
        name: requestBody.name,
        eventType: requestBody.eventType,
        isArchived: nextArchived,
      }))
    }

    return requestBody
  }, [eventId, loadEventRecord, updateEventMeta])

  const handleCreateEvent = async (name, eventType) => {
    try {
      const res = await fetch(`${API_BASE_URL}/maps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || 'New Event',
          eventType: eventType || 'festival',
          center_lat: 51.505,
          center_lng: -0.09,
          zoom: 13,
          archived: false,
        })
      })
      const data = await res.json()
      if (data.success && data.id) {
        updateEventMeta(data.id, {
          name: name || 'New Event',
          isArchived: false,
        })
        writeRouteState('editor', data.id, { replace: false })
        setEventId(data.id)
        setEventDetails(prev => ({
          ...prev,
          name: name || 'New Event',
          eventType: eventType || 'festival',
          isArchived: false,
        }))
        setCurrentView('editor')
      }
    } catch (err) {
      console.error('Error creating event:', err)
      alert('Failed to create event. Is the backend running?')
    }
  }

  const handleResumeEvent = (id) => {
    if (!id) return
    writeRouteState('editor', id, { replace: false })
    setEventId(id)
    setCurrentView('editor')
  }

  useEffect(() => {
    if (currentView !== 'editor' || !eventId) return

    loadEventRecord(eventId)
      .then(data => {
        setSelectedId(null)
        setEventDetails(prev => ({
          ...prev,
          name: data.name,
          eventType: data.eventType || data.event_type || 'festival',
          isArchived: Boolean(data.isArchived),
        }))
        setZones(data.zones || [])
        setAssets(data.assets || [])
        setLines(data.lines || [])
        setAnnotations(data.annotations || [])
        setLayers(prev => ({ ...prev, ...(data.layers || {}) }))
        setLineStyle(data.settings?.lineStyle || getRouteStylePreset('custom'))
        setTextStyle(prev => ({ ...prev, ...(data.settings?.textStyle || {}) }))
        setFloorPlan(data.settings?.floorPlan || null)
      })
      .catch(err => {
        console.error('Error resuming event:', err)
        setEventId(null)
        setCurrentView('home')
        alert('Failed to load event: ' + err.message)
      })
  }, [currentView, eventId, loadEventRecord])

  const handleRenameEvent = async (id, nextNameInput) => {
    const currentEvent = eventList.find(event => event.id === id)
    const nextName = String(nextNameInput ?? '').trim()
    if (!nextName || nextName === currentEvent?.name) return

    try {
      await persistEventPatch(id, { name: nextName })
      await refreshEventList()
    } catch (err) {
      console.error('Error renaming event:', err)
    }
  }

  const handleArchiveEvent = async (id, archived = true) => {
    try {
      const livePatch = eventId === id ? {
        name: eventDetails.name,
        eventType: eventDetails.eventType,
        measurementUnit,
        layers,
        zones,
        assets,
        lines,
        annotations,
        settings: {
          lineStyle,
          textStyle,
          floorPlan,
        },
      } : {}

      await persistEventPatch(id, {
        ...livePatch,
        isArchived: archived,
      })
      await refreshEventList()
    } catch (err) {
      console.error('Error updating archive state:', err)
    }
  }

  const handleDeleteEvent = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/maps/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || data.error || data.success === false) {
        throw new Error(data.error || data.message || 'Failed to delete event')
      }

      updateEventMeta(id, null)
      setEventList(prev => prev.filter(event => event.id !== id))

      if (eventId === id) {
        setEventId(null)
        setCurrentView('home')
      }
    } catch (err) {
      console.error('Error deleting event:', err)
    }
  }

  const handleDuplicateEvent = async (id) => {
    try {
      const sourceEvent = await loadEventRecord(id)
      const copyName = getNextVersionName(sourceEvent.name || 'Event', eventList.map(e => e.name))

      const createRes = await fetch(`${API_BASE_URL}/maps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: copyName,
          eventType: sourceEvent.eventType || sourceEvent.event_type || 'festival',
          center_lat: sourceEvent.center_lat ?? 51.505,
          center_lng: sourceEvent.center_lng ?? -0.09,
          zoom: sourceEvent.zoom ?? 13,
          archived: false,
        })
      })
      const createData = await createRes.json()
      if (!createRes.ok || !createData.success || !createData.id) {
        throw new Error(createData.error || createData.message || 'Failed to duplicate event')
      }

      await persistEventPatch(createData.id, {
        name: copyName,
        eventType: sourceEvent.eventType || sourceEvent.event_type || 'festival',
        center_lat: sourceEvent.center_lat ?? 51.505,
        center_lng: sourceEvent.center_lng ?? -0.09,
        zoom: sourceEvent.zoom ?? 13,
        measurementUnit: sourceEvent.measurementUnit ?? 'meters',
        layers: sourceEvent.layers ?? DEFAULT_LAYERS,
        zones: sourceEvent.zones ?? [],
        assets: sourceEvent.assets ?? [],
        lines: sourceEvent.lines ?? [],
        annotations: sourceEvent.annotations ?? [],
        settings: {
          ...(sourceEvent.settings || {}),
          archived: false,
        },
        isArchived: false,
      })

      await refreshEventList()
    } catch (err) {
      console.error('Error duplicating event:', err)
    }
  }

  const handleSaveMap = async () => {
    if (!eventId) {
      alert('Cannot save: No Event ID found.')
      return
    }
    console.log('Attempting to save map...', { eventId, eventDetails, zonesCount: zones.length, assetsCount: assets.length })
    try {
      const res = await fetch(`${API_BASE_URL}/maps/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: eventDetails.name,
          eventType: eventDetails.eventType,
          center_lat: 51.505,
          center_lng: -0.09,
          zoom: 13,
          measurementUnit: measurementUnit,
          layers,
          settings: {
            lineStyle,
            textStyle,
            floorPlan,
            archived: !!eventDetails.isArchived,
          },
          zones,
          assets,
          lines,
          annotations,
          archived: !!eventDetails.isArchived,
        })
      })
      const data = await res.json()
      console.log('Save response data:', data)
      if (data.success) {
        updateEventMeta(eventId, {
          name: eventDetails.name,
          isArchived: !!eventDetails.isArchived,
        })
        refreshEventList().catch(() => { })
        alert('Map saved successfully!')
      } else {
        throw new Error(data.error || data.message || 'Failed to save map')
      }
    } catch (err) {
      console.error('Error saving map:', err)
      alert('Error saving map: ' + err.message)
    }
  }

  if (currentView === 'home') {
    return <HomeScreen
      onCreateEvent={handleCreateEvent}
      onResumeEvent={handleResumeEvent}
      onRenameEvent={handleRenameEvent}
      onDeleteEvent={handleDeleteEvent}
      onDuplicateEvent={handleDuplicateEvent}
      onArchiveEvent={(id) => handleArchiveEvent(id, true)}
      onUnarchiveEvent={(id) => handleArchiveEvent(id, false)}
      eventList={eventList}
    />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Toolbar
        drawMode={drawMode}
        onDrawMode={handleDrawMode}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onExport={handleExport}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        locationQuery={eventDetails.locationQuery}
        onLocationQueryChange={(value) => {
          setEventDetails(prev => ({
            ...prev,
            locationQuery: value,
          }))
        }}
        onLocationSearch={handleLocationSearch}
        measurementUnit={measurementUnit}
        onMeasurementUnitChange={handleMeasurementUnitChange}
        eventId={eventId}
        eventName={eventDetails.name}
        isArchived={!!eventDetails.isArchived}
        onSave={handleSaveMap}
        onUnarchive={() => handleArchiveEvent(eventId, false)}
        onGoHome={() => {
          writeRouteState('home', null, { replace: false })
          setEventId(null)
          setCurrentView('home')
        }}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <Sidebar
          collapsed={leftSidebarCollapsed}
          onToggleCollapse={() => setLeftSidebarCollapsed(prev => !prev)}
          drawMode={drawMode}
          onDrawMode={handleDrawMode}
          onAssetDragStart={handleAssetDragStart}
          onAssetDragEnd={handleAssetDragEnd}
          pendingAssetDef={pendingAssetDef}
          onAssetClickPlace={handleAssetClickPlace}
          onImportAssets={handleImportAssets}
          onImportProject={handleImportProject}
          onDownloadAssetList={handleDownloadAssetList}
          zones={zones}
          assets={assets}
          lines={lines}
          annotations={annotations}
          selectedId={selectedId}
          onSelectItem={handleSelect}
          onUpdateAsset={handleUpdate}
          floorPlan={floorPlan}
          placingFloor={placingFloor}
          onFloorPlanUpload={handleFloorPlanUpload}
          onStartFloorPlacement={() => {
            if (!floorPlan?.imageUrl) return
            setFloorPlan(prev => prev ? { ...prev, bounds: null } : prev)
            setPlacingFloor(true)
          }}
          onFloorOpacityChange={(opacity) => {
            setFloorPlan(prev => prev ? { ...prev, opacity } : prev)
          }}
          layers={layers}
          onToggleLayer={handleToggleLayer}
          onToggleLock={handleToggleLock}
          selectedZoneType={selectedZoneType}
          onZoneTypeChange={(zone) => setSelectedZoneType(zone)}
          lineStyle={lineStyle}
          onLineStyleChange={setLineStyle}
          textStyle={textStyle}
          onTextStyleChange={setTextStyle}
          annotationDraftText={annotationDraftText}
          onAnnotationDraftTextChange={setAnnotationDraftText}
          assetCategories={assetData.categories}
          zoneTypes={assetData.zoneTypes}
        />

        <MapCanvas
          drawMode={drawMode}
          onDrawMode={setDrawMode}
          selectedZoneType={selectedZoneType}
          layers={layers}
          zones={zones}
          assets={assets}
          lines={lines}
          annotations={annotations}
          floorPlan={floorPlan}
          placingFloor={placingFloor}
          selectedId={selectedId}
          onSelect={handleSelect}
          onClearSelection={() => setSelectedId(null)}
          onEraseAsset={handleEraseAsset}
          onZoneCreate={handleZoneCreate}
          onLineCreate={handleLineCreate}
          onAnnotationCreate={handleAnnotationCreate}
          onAssetDrop={handleAssetDrop}
          onAssetUpdate={handleUpdate}
          pendingAssetDef={pendingAssetDef}
          onPendingAssetClear={() => setPendingAssetDef(null)}
          onFloorPlanChange={handleFloorPlanChange}
          onFloorPlacementChange={setPlacingFloor}
          eventDetails={eventDetails}
          onEventDetailsChange={setEventDetails}
          mapViewMode={mapViewMode}
          lineStyle={lineStyle}
          textStyle={textStyle}
          annotationDraftText={annotationDraftText}
          onMapRef={(ref) => { mapRef.current = ref }}
          measurementUnit={measurementUnit}
        />

        <PropertiesPanel
          collapsed={!selectedId}
          selected={selectedItem}
          zones={zones}
          assets={assets}
          lines={lines}
          annotations={annotations}
          onUpdate={handleUpdate}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onClose={() => setSelectedId(null)}
          measurementUnit={measurementUnit}
          crowdDensityOptions={assetData.crowdDensityOptions}
          zoneTypes={assetData.zoneTypes}
        />

      </div>

      <StatsBar zones={zones} assets={assets} annotations={annotations} selectedId={selectedId} measurementUnit={measurementUnit} />
    </div>
  )
}
