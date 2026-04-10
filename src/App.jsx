import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { toCanvas } from 'html-to-image'
import { jsPDF } from 'jspdf'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import MapCanvas from './components/MapCanvas'
import PropertiesPanel from './components/PropertiesPanel'
import StatsBar from './components/StatsBar'
import HomeScreen from './components/HomeScreen'
import { computeZoneCapacity } from './data/assets'
import { getRouteStylePreset } from './data/routeTypes'
import { getAssetSize, getFloorGeometry, latLngToContainerPoint, normalizeFloorPlanState } from './utils/mapGeometry'
import { formatArea, formatDistance } from './utils/units'

const API_BASE_URL = 'http://localhost:5000/api'

const PROJECT_STORAGE_KEY = 'eventwiz-project-v1'
const CUSTOM_ASSET_LIBRARY_STORAGE_KEY = 'eventwiz-custom-asset-library-v1'
const EVENT_META_STORAGE_KEY = 'eventwiz-event-meta-v1'
const NAV_STATE_STORAGE_KEY = 'eventwiz-nav-state-v1'
const DEFAULT_MAP_VIEWPORT = {
  center: { lat: 23.0225, lng: 72.5714 },
  zoom: 14,
}

function normalizePersistedZoom(value, fallback = DEFAULT_MAP_VIEWPORT.zoom) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(2, Math.min(21, Math.round(parsed)))
}

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

  const { replace = true, preserveViewParams = false } = options
  const nextPath = currentView === 'editor' && eventId
    ? `/${encodeURIComponent(eventId)}`
    : '/'

  const params = new URLSearchParams(window.location.search)
  if (!preserveViewParams) {
    ;['view', 'mode', 'zoom', 'minZoom', 'maxZoom'].forEach((key) => params.delete(key))
  }

  const nextSearch = params.toString()
  const nextUrl = `${nextPath}${nextSearch ? `?${nextSearch}` : ''}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`

  if (currentUrl !== nextUrl) {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', nextUrl)
  }
}

function readSharedViewState() {
  if (typeof window === 'undefined') {
    return { isViewOnly: false, zoom: null, minZoom: null, maxZoom: null }
  }

  const params = new URLSearchParams(window.location.search)
  const normalizeNumber = (value) => {
    if (value == null || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  const viewParam = String(params.get('view') || '').toLowerCase()
  const modeParam = String(params.get('mode') || '').toLowerCase()

  return {
    isViewOnly: viewParam === '1' || viewParam === 'true' || modeParam === 'view',
    zoom: normalizeNumber(params.get('zoom')),
    minZoom: normalizeNumber(params.get('minZoom')),
    maxZoom: normalizeNumber(params.get('maxZoom')),
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

function getExportStatusColor(status) {
  switch (status) {
    case 'confirmed':
    case 'installed':
      return '#10b981'
    case 'removed':
      return '#ef4444'
    case 'planned':
    default:
      return '#f59e0b'
  }
}

function buildCanvasPolylinePath(ctx, points, closePath = false) {
  if (!ctx || !Array.isArray(points) || !points.length) return false
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y)
  }
  if (closePath) ctx.closePath()
  return true
}

function buildCanvasRoundedRectPath(ctx, x, y, width, height, radius = 12) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + safeRadius, y)
  ctx.lineTo(x + width - safeRadius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  ctx.lineTo(x + width, y + height - safeRadius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  ctx.lineTo(x + safeRadius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  ctx.lineTo(x, y + safeRadius)
  ctx.quadraticCurveTo(x, y, x + safeRadius, y)
  ctx.closePath()
}

function drawCanvasPin(ctx, { x, y, color = '#ea4335', label = '', size = 18, compact = false }) {
  ctx.save()

  if (compact) {
    ctx.beginPath()
    ctx.arc(x, y, Math.max(4, size * 0.42), 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    ctx.restore()
    return
  }

  const circleRadius = size * 0.42
  const circleCenterY = y - size * 0.82

  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - circleRadius * 0.8, circleCenterY + circleRadius * 0.4)
  ctx.arc(x, circleCenterY, circleRadius, Math.PI * 0.92, Math.PI * 0.08, true)
  ctx.lineTo(x + circleRadius * 0.8, circleCenterY + circleRadius * 0.4)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 1.8
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x, circleCenterY, circleRadius * 0.52, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  if (label) {
    ctx.fillStyle = color
    ctx.font = `700 ${Math.max(9, size * 0.46)}px Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, circleCenterY + 0.5)
  }

  ctx.restore()
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
  const [sharedView, setSharedView] = useState(() => readSharedViewState())
  const isViewOnly = sharedView.isViewOnly
  const [mapViewport, setMapViewport] = useState(DEFAULT_MAP_VIEWPORT)
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
    pinColor: '#ea4335',
    color: '#111827',
    backgroundColor: '#fff7d6',
    fontSize: 14,
    fontWeight: 700,
    borderColor: '#334155',
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

  const viewOnlyMinZoom = useMemo(() => {
    const baseZoom = Number.isFinite(sharedView.zoom)
      ? sharedView.zoom
      : (Number.isFinite(Number(mapViewport.zoom)) ? Number(mapViewport.zoom) : DEFAULT_MAP_VIEWPORT.zoom)

    return Number.isFinite(sharedView.minZoom)
      ? sharedView.minZoom
      : Math.max(2, Math.floor(baseZoom) - 2)
  }, [mapViewport.zoom, sharedView.minZoom, sharedView.zoom])

  const viewOnlyMaxZoom = useMemo(() => {
    const baseZoom = Number.isFinite(sharedView.zoom)
      ? sharedView.zoom
      : (Number.isFinite(Number(mapViewport.zoom)) ? Number(mapViewport.zoom) : DEFAULT_MAP_VIEWPORT.zoom)
    const candidate = Number.isFinite(sharedView.maxZoom)
      ? sharedView.maxZoom
      : Math.min(21, Math.ceil(baseZoom) + 2)

    return Math.max(viewOnlyMinZoom + 1, candidate)
  }, [mapViewport.zoom, sharedView.maxZoom, sharedView.zoom, viewOnlyMinZoom])

  const effectiveLayers = useMemo(() => {
    if (!isViewOnly) return layers

    return Object.fromEntries(
      Object.entries(layers || {}).map(([key, value]) => [
        key,
        { ...(value || {}), locked: true },
      ])
    )
  }, [isViewOnly, layers])

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
    setSharedView(readSharedViewState())
  }, [currentView, eventId])

  useEffect(() => {
    const handleLocationChange = () => {
      const routeState = readRouteState()
      setCurrentView(routeState.currentView)
      setEventId(routeState.eventId)
      setSharedView(readSharedViewState())
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

  useEffect(() => {
    if (!isViewOnly) return

    if (drawMode !== 'select') {
      setDrawMode('select')
    }

    setPendingAssetDef(null)
    setPlacingFloor(false)
  }, [drawMode, isViewOnly])

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
    if (isViewOnly) {
      setDrawMode('select')
      return
    }

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
  }, [isViewOnly, lineStyle?.routeType])

  const handleLocationSearch = useCallback(() => {
    if (isViewOnly) return

    const query = (eventDetails.locationQuery || '').trim()
    if (!query) return
    setEventDetails(prev => ({
      ...prev,
      locationQuery: query,
      resolvedLocation: null,
    }))
  }, [eventDetails.locationQuery, isViewOnly])

  const handleViewportChange = useCallback((nextViewport) => {
    if (!nextViewport?.center) return

    setMapViewport((prev) => {
      const prevLat = Number(prev?.center?.lat || 0)
      const prevLng = Number(prev?.center?.lng || 0)
      const nextLat = Number(nextViewport.center?.lat || 0)
      const nextLng = Number(nextViewport.center?.lng || 0)
      const prevZoom = Number(prev?.zoom || 0)
      const nextZoom = Number(nextViewport.zoom || 0)

      if (
        Math.abs(prevLat - nextLat) < 1e-7
        && Math.abs(prevLng - nextLng) < 1e-7
        && Math.abs(prevZoom - nextZoom) < 1e-7
      ) {
        return prev
      }

      return nextViewport
    })
  }, [])

  const handleEnterViewOnly = useCallback(() => {
    if (typeof window === 'undefined' || !eventId) return

    const url = new URL(window.location.href)
    const liveZoom = mapRef.current?.getZoom?.()
    const liveCenter = mapRef.current?.getCenter?.()
    const baseZoom = Number.isFinite(Number(liveZoom))
      ? Math.round(Number(liveZoom))
      : (Number.isFinite(Number(mapViewport.zoom)) ? Math.round(Number(mapViewport.zoom)) : DEFAULT_MAP_VIEWPORT.zoom)
    const nextMinZoom = Math.max(2, baseZoom - 2)
    const nextMaxZoom = Math.min(21, baseZoom + 2)

    if (liveCenter) {
      setMapViewport({
        center: { lat: liveCenter.lat(), lng: liveCenter.lng() },
        zoom: baseZoom,
      })
    }

    url.searchParams.set('view', '1')
    url.searchParams.set('zoom', String(baseZoom))
    url.searchParams.set('minZoom', String(nextMinZoom))
    url.searchParams.set('maxZoom', String(nextMaxZoom))
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
    setSharedView(readSharedViewState())
  }, [eventId, mapViewport.zoom])

  const handleExitViewOnly = useCallback(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    ;['view', 'mode', 'zoom', 'minZoom', 'maxZoom'].forEach((key) => url.searchParams.delete(key))
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
    setSharedView(readSharedViewState())
  }, [])

  const handleFloorPlanUpload = useCallback((imageUrl) => {
    setFloorPlan({
      id: 'floor-plan',
      type: 'floor',
      imageUrl,
      bounds: null,
      center: null,
      widthM: null,
      heightM: null,
      opacity: 0.7,
      rotation: 0,
    })
    setPlacingFloor(true)
  }, [])

  const handleFloorPlanChange = useCallback((updater) => {
    setFloorPlan(prev => normalizeFloorPlanState(typeof updater === 'function' ? updater(prev) : updater))
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
      if (isViewOnly) return

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
  }, [handleDelete, handleRedo, handleUndo, isViewOnly, selectedId])

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
      if (isViewOnly) return

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
  }, [handleDelete, handleRedo, handleUndo, isViewOnly, selectedId])

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

  // Capture the current map view with a dedicated canvas renderer for reliable PNG/PDF export.
  const captureMapImage = useCallback(async () => {
    const map = mapRef.current
    if (!map) throw new Error('Map not loaded')
    const mapDiv = map.getDiv()
    if (!mapDiv) throw new Error('Map container not found')

    const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
    const rect = mapDiv.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const pixelRatio = 2

    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = width * pixelRatio
    exportCanvas.height = height * pixelRatio
    const ctx = exportCanvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context unavailable')

    ctx.scale(pixelRatio, pixelRatio)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const imageCache = new Map()
    const loadImage = (src) => {
      if (!src) return Promise.reject(new Error('Missing image source'))
      if (imageCache.has(src)) return imageCache.get(src)

      const promise = new Promise((resolve, reject) => {
        const image = new Image()
        if (!String(src).startsWith('data:')) image.crossOrigin = 'anonymous'
        image.decoding = 'async'
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = src
      })

      imageCache.set(src, promise)
      return promise
    }

    const zoneMap = new Map(zones.map(zone => [zone.id, zone]))
    const isZoneHidden = (zone) => {
      if (!zone) return false
      if (zone.visible === false) return true
      return zone.parentId ? isZoneHidden(zoneMap.get(zone.parentId)) : false
    }
    const isParentHidden = (parentId) => (parentId ? isZoneHidden(zoneMap.get(parentId)) : false)

    const previousSelectedId = selectedId
    if (previousSelectedId) {
      setSelectedId(null)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    }

    const drawBaseMapFromDom = async () => {
      const baseClone = mapDiv.cloneNode(true)
      baseClone.style.width = `${width}px`
      baseClone.style.height = `${height}px`
      baseClone.style.position = 'fixed'
      baseClone.style.left = '-20000px'
      baseClone.style.top = '0'
      baseClone.style.margin = '0'
      baseClone.style.pointerEvents = 'none'
      baseClone.style.zIndex = '-1'
      baseClone.style.background = '#ffffff'
      baseClone.style.overflow = 'hidden'

      Array.from(baseClone.querySelectorAll('.gm-style-cc, .gm-fullscreen-control, .gm-svpc, .gm-style-mtc, .gm-bundled-control, .gmnoprint')).forEach((node) => {
        if (node instanceof HTMLElement) node.style.display = 'none'
      })

      Array.from(baseClone.querySelectorAll('button, textarea, svg, canvas')).forEach((node) => {
        if (node instanceof HTMLElement) node.style.visibility = 'hidden'
      })

      Array.from(baseClone.querySelectorAll('img')).forEach((node) => {
        if (!(node instanceof HTMLImageElement)) return
        const src = node.getAttribute('src') || ''
        const isGoogleTile = /googleapis|gstatic|googleusercontent|maps\.google/i.test(src)
        if (!isGoogleTile) node.style.visibility = 'hidden'
      })

      document.body.appendChild(baseClone)
      try {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const baseCanvas = await toCanvas(baseClone, {
          cacheBust: true,
          pixelRatio,
          skipFonts: true,
          backgroundColor: '#ffffff',
        })
        ctx.drawImage(baseCanvas, 0, 0, width, height)
      } finally {
        baseClone.remove()
      }
    }

    try {
      const center = map.getCenter?.()
      const mapTypeId = map.getMapTypeId?.() || mapViewMode || 'roadmap'
      const zoom = Math.max(1, Math.round(map.getZoom?.() || 14))
      let baseMapDrawn = false

      if (center && googleMapsKey) {
        const sizeScale = Math.min(1, 640 / Math.max(width, height))
        const requestWidth = Math.max(1, Math.round(width * sizeScale))
        const requestHeight = Math.max(1, Math.round(height * sizeScale))
        const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat()},${center.lng()}&zoom=${zoom}&size=${requestWidth}x${requestHeight}&scale=2&maptype=${encodeURIComponent(mapTypeId)}&format=png&key=${encodeURIComponent(googleMapsKey)}`

        try {
          const baseMapImage = await loadImage(staticMapUrl)
          ctx.drawImage(baseMapImage, 0, 0, width, height)
          baseMapDrawn = true
        } catch (error) {
          console.warn('Static Maps export unavailable; falling back to DOM capture.', error)
        }
      }

      if (!baseMapDrawn) {
        await drawBaseMapFromDom()
      }

      if (layers.floor?.visible !== false && floorPlan?.bounds && floorPlan?.imageUrl) {
        try {
          const floorImage = await loadImage(floorPlan.imageUrl)
          const geometry = getFloorGeometry(map, floorPlan)
          if (geometry) {
            ctx.save()
            ctx.translate(geometry.centerPoint.x, geometry.centerPoint.y)
            ctx.rotate(((floorPlan.rotation || 0) * Math.PI) / 180)
            ctx.globalAlpha = floorPlan.opacity ?? 0.7
            ctx.drawImage(floorImage, -geometry.widthPx / 2, -geometry.heightPx / 2, geometry.widthPx, geometry.heightPx)
            ctx.restore()
          }
        } catch (error) {
          console.warn('Could not draw floor plan in export.', error)
        }
      }

      if (layers.zones?.visible !== false) {
        zones.forEach((zone) => {
          if (isZoneHidden(zone)) return
          const points = (zone.path || [])
            .map(point => latLngToContainerPoint(map, point.lat, point.lng))
            .filter(Boolean)
          if (points.length < 3) return

          ctx.save()
          buildCanvasPolylinePath(ctx, points, true)
          ctx.globalAlpha = zone.fillOpacity ?? zone.zoneType?.fillOpacity ?? 0.2
          ctx.fillStyle = zone.fillColor || zone.zoneType?.color || '#3d8ef8'
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.strokeStyle = zone.strokeColor || zone.zoneType?.color || '#3d8ef8'
          ctx.lineWidth = zone.strokeWeight || 2
          ctx.stroke()
          ctx.restore()
        })
      }

      if (layers.lines?.visible !== false) {
        lines.forEach((line) => {
          if (line.visible === false || isParentHidden(line.parentId)) return
          const points = (line.path || [])
            .map(point => latLngToContainerPoint(map, point.lat, point.lng))
            .filter(Boolean)
          if (points.length < 2) return

          ctx.save()
          buildCanvasPolylinePath(ctx, points, false)
          ctx.strokeStyle = line.color || '#f59e0b'
          ctx.lineWidth = line.strokeWeight || 4
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          if ((line.pattern || 'dashed') === 'dotted') {
            ctx.setLineDash([2, 10])
          } else if ((line.pattern || 'dashed') === 'dashed') {
            ctx.setLineDash([14, 10])
          } else {
            ctx.setLineDash([])
          }
          ctx.stroke()
          ctx.restore()
        })
      }

      if (layers.assets?.visible !== false) {
        for (const asset of assets) {
          if (isParentHidden(asset.parentId)) continue
          const point = latLngToContainerPoint(map, asset.lat, asset.lng)
          if (!point) continue

          const { widthPx, lengthPx } = getAssetSize(asset, map.getZoom())
          const fillColor = asset.fillColor || asset.assetDef?.color || '#3d8ef8'
          const strokeColor = asset.strokeColor || asset.assetDef?.color || '#3d8ef8'
          const fillOpacity = asset.fillOpacity !== undefined ? asset.fillOpacity : 0.85
          const innerSize = Math.min(widthPx, lengthPx) * 0.56
          const iconSize = Math.max(12, innerSize * 0.7)
          const iconText = (() => {
            const rawIcon = asset.assetDef?.icon
            if (typeof rawIcon === 'string' && rawIcon && !rawIcon.includes(':')) return rawIcon.slice(0, 2)
            const label = asset.assetDef?.name || asset.label || 'A'
            return String(label).trim().charAt(0).toUpperCase()
          })()

          ctx.save()
          ctx.translate(point.x, point.y)
          ctx.rotate(((asset.rotationDeg || 0) * Math.PI) / 180)

          buildCanvasRoundedRectPath(ctx, -widthPx / 2, -lengthPx / 2, widthPx, lengthPx, Math.max(10, Math.min(widthPx, lengthPx) * 0.22))
          ctx.globalAlpha = fillOpacity
          ctx.fillStyle = fillColor
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.lineWidth = asset.strokeWeight || 2
          ctx.strokeStyle = strokeColor
          ctx.stroke()

          ctx.beginPath()
          ctx.arc(0, 0, innerSize / 2, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'
          ctx.fill()
          ctx.lineWidth = 2
          ctx.strokeStyle = strokeColor
          ctx.stroke()

          if (asset.assetDef?.imageUrl) {
            try {
              const iconImage = await loadImage(asset.assetDef.imageUrl)
              ctx.drawImage(iconImage, -iconSize / 2, -iconSize / 2, iconSize, iconSize)
            } catch {
              ctx.fillStyle = asset.assetDef?.iconColor || strokeColor
              ctx.font = `700 ${Math.max(11, iconSize * 0.6)}px Arial, sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(iconText, 0, 0)
            }
          } else {
            ctx.fillStyle = asset.assetDef?.iconColor || strokeColor
            ctx.font = `700 ${Math.max(11, iconSize * 0.6)}px Arial, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(iconText, 0, 0)
          }

          const statusDotSize = Math.max(5, Math.min(widthPx, lengthPx) * 0.12)
          ctx.beginPath()
          ctx.arc(widthPx / 2 - statusDotSize * 1.4, lengthPx / 2 - statusDotSize * 1.4, statusDotSize, 0, Math.PI * 2)
          ctx.fillStyle = getExportStatusColor(asset.status || 'planned')
          ctx.fill()
          ctx.lineWidth = 2
          ctx.strokeStyle = '#ffffff'
          ctx.stroke()
          ctx.restore()
        }
      }

      if (layers.annotations?.visible !== false) {
        annotations.forEach((annotation) => {
          if (isParentHidden(annotation.parentId)) return
          const point = latLngToContainerPoint(map, annotation.lat, annotation.lng)
          if (!point) return

          const compact = zoom < 14
          drawCanvasPin(ctx, {
            x: point.x,
            y: point.y,
            color: annotation.pinColor || '#ea4335',
            label: compact ? '' : String(annotation.label || annotation.text || 'P').trim().charAt(0).toUpperCase(),
            size: compact ? 12 : 18,
            compact,
          })
        })
      }

      return exportCanvas.toDataURL('image/png')
    } finally {
      if (previousSelectedId) {
        requestAnimationFrame(() => setSelectedId(previousSelectedId))
      }
    }
  }, [annotations, assets, floorPlan, layers, lines, mapViewMode, selectedId, zones])

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
      zoom: normalizePersistedZoom(patch.zoom ?? currentData.zoom ?? 13),
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
        setMapViewport({
          center: { lat: 51.505, lng: -0.09 },
          zoom: 13,
        })
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
        setMapViewport({
          center: {
            lat: Number.isFinite(Number(data.center_lat)) ? Number(data.center_lat) : DEFAULT_MAP_VIEWPORT.center.lat,
            lng: Number.isFinite(Number(data.center_lng)) ? Number(data.center_lng) : DEFAULT_MAP_VIEWPORT.center.lng,
          },
          zoom: Number.isFinite(Number(data.zoom)) ? Number(data.zoom) : DEFAULT_MAP_VIEWPORT.zoom,
        })
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
      const liveCenter = mapRef.current?.getCenter?.()
      const liveZoom = mapRef.current?.getZoom?.()
      const safeCenter = {
        lat: liveCenter ? liveCenter.lat() : (Number.isFinite(Number(mapViewport.center?.lat)) ? Number(mapViewport.center.lat) : DEFAULT_MAP_VIEWPORT.center.lat),
        lng: liveCenter ? liveCenter.lng() : (Number.isFinite(Number(mapViewport.center?.lng)) ? Number(mapViewport.center.lng) : DEFAULT_MAP_VIEWPORT.center.lng),
      }
      const safeZoom = normalizePersistedZoom(
        Number.isFinite(Number(liveZoom)) ? Number(liveZoom) : (Number.isFinite(Number(mapViewport.zoom)) ? Number(mapViewport.zoom) : DEFAULT_MAP_VIEWPORT.zoom)
      )

      const res = await fetch(`${API_BASE_URL}/maps/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: eventDetails.name,
          eventType: eventDetails.eventType,
          center_lat: safeCenter.lat,
          center_lng: safeCenter.lng,
          zoom: safeZoom,
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
        isViewOnly={isViewOnly}
        viewOnlyMinZoom={viewOnlyMinZoom}
        viewOnlyMaxZoom={viewOnlyMaxZoom}
        onEnterViewOnly={handleEnterViewOnly}
        onExitViewOnly={handleExitViewOnly}
        onSave={handleSaveMap}
        onUnarchive={() => handleArchiveEvent(eventId, false)}
        onGoHome={() => {
          writeRouteState('home', null, { replace: false })
          setEventId(null)
          setCurrentView('home')
        }}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {!isViewOnly && (
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
        )}

        <MapCanvas
          drawMode={drawMode}
          onDrawMode={setDrawMode}
          selectedZoneType={selectedZoneType}
          layers={effectiveLayers}
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
          onViewportChange={handleViewportChange}
          initialView={mapViewport}
          isViewOnly={isViewOnly}
          viewOnlyMinZoom={viewOnlyMinZoom}
          viewOnlyMaxZoom={viewOnlyMaxZoom}
          measurementUnit={measurementUnit}
        />

        {!isViewOnly && (
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
        )}

      </div>

      <StatsBar zones={zones} assets={assets} annotations={annotations} selectedId={selectedId} measurementUnit={measurementUnit} />
    </div>
  )
}
