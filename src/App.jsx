import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import MapCanvas from './components/MapCanvas'
import PropertiesPanel from './components/PropertiesPanel'
import StatsBar from './components/StatsBar'
import { ZONE_TYPES, computeZoneCapacity } from './data/assets'

const PROJECT_STORAGE_KEY = 'eventwiz-project-v1'

const DEFAULT_LAYERS = {
  zones: { visible: true, locked: false },
  assets: { visible: true, locked: false },
  floor: { visible: true, locked: false },
  annotations: { visible: true, locked: false },
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

export default function App() {
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem('eventwiz-theme')
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  const [drawMode, setDrawMode] = useState('select')
  const [selectedZoneType, setSelectedZoneType] = useState(ZONE_TYPES[0])
  const [lineStyle, setLineStyle] = useState({
    color: '#f59e0b',
    weight: 4,
    pattern: 'dashed',
  })
  const [textStyle, setTextStyle] = useState({
    color: '#111827',
    backgroundColor: '#fff7d6',
    fontSize: 14,
    borderColor: 'rgba(15,23,42,0.18)',
    borderWidth: 1,
    borderRadius: 10,
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
    locationQuery: '',
    resolvedLocation: null,
  })
  const [mapViewMode, setMapViewMode] = useState('2d')
  const mapRef = useRef(null)
  const hasHydratedRef = useRef(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('eventwiz-theme', theme)
  }, [theme])

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

      setZones(Array.isArray(parsed.zones) ? parsed.zones : [])
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
      if (parsed.mapViewMode === '2d' || parsed.mapViewMode === '3d') {
        setMapViewMode(parsed.mapViewMode)
      }

      const storedZoneTypeId = parsed.selectedZoneType?.id
      const matchedZoneType = ZONE_TYPES.find(zone => zone.id === storedZoneTypeId)
      if (matchedZoneType) setSelectedZoneType(matchedZoneType)
    } catch {
      // ignore invalid storage and start fresh
    } finally {
      hasHydratedRef.current = true
    }
  }, [])

  useEffect(() => {
    if (!hasHydratedRef.current) return
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      zones,
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

  const selectedItem = useMemo(() => (
    [...zones, ...assets, ...lines, ...annotations].find(i => i.id === selectedId)
      || (selectedId === 'floor-plan' && floorPlan ? { id: 'floor-plan', type: 'floor', ...floorPlan } : null)
      || null
  ), [annotations, assets, floorPlan, lines, selectedId, zones])

  const snapshot = useCallback(() => ({ zones, assets, lines, annotations, floorPlan }), [zones, assets, lines, annotations, floorPlan])

  const pushHistory = useCallback(() => {
    setUndoStack(s => [...s.slice(-50), snapshot()])
    setRedoStack([])
  }, [snapshot])

  // Zone created by drawing
  const handleZoneCreate = useCallback((zone) => {
    pushHistory()
    setZones(prev => [...prev, { ...zone, capacity: computeZoneCapacity(zone) }])
    setLayers(prev => ({
      ...prev,
      grid: { ...prev.grid, visible: true },
    }))
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

  const handleAssetDragEnd = useCallback(() => {}, [])

  const handleAssetClickPlace = useCallback((assetDef) => {
    setPendingAssetDef(prev => (prev?.id === assetDef.id ? null : assetDef))
    setDrawMode('select')
  }, [])

  // Select item
  const handleSelect = useCallback((item) => {
    setPendingAssetDef(null)
    setSelectedId(item.id)
    setDrawMode('select')
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
      const nextZoneRecord = {
        ...updated,
        capacity: computeZoneCapacity(updated),
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

  const handleToggleMapViewMode = useCallback(() => {
    setMapViewMode(prev => prev === '3d' ? '2d' : '3d')
  }, [])

  const handleDrawMode = useCallback((mode) => {
    setDrawMode(mode)
    if (mode === 'route') {
      setLineStyle(prev => ({
        ...prev,
        color: '#2563eb',
        pattern: 'dashed',
        weight: 4,
      }))
    }
  }, [])

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
      label: selectedAsset.label ? `${selectedAsset.label} Copy` : selectedAsset.label,
    }

    setAssets(prev => [...prev, duplicated])
    setSelectedId(duplicated.id)
    setDrawMode('select')
  }, [assets, pushHistory, selectedId])

  const handleToggleLayer = useCallback((layerId) => {
    setLayers(prev => ({
      ...prev,
      [layerId]: { ...prev[layerId], visible: !prev[layerId].visible }
    }))
  }, [])

  const handleEraseAsset = useCallback((asset) => {
    if (!asset?.id) return
    pushHistory()
    setAssets(prev => prev.filter(a => a.id !== asset.id))
    if (selectedId === asset.id) setSelectedId(null)
  }, [pushHistory, selectedId])

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

  // Export current viewport as PNG map snapshot
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

    const map = mapRef.current
    const googleApi = window.google
    if (!map || !googleApi || !mapsApiKey) {
      window.alert('Map export is unavailable. Google Maps API key is missing.')
      return
    }

    const exportBounds = map?.getBounds?.()

    const withinViewport = (point) => {
      if (!exportBounds || !googleApi || !point) return true
      return exportBounds.contains(new googleApi.maps.LatLng(point.lat, point.lng))
    }

    const zoneIntersectsViewport = (zone) => {
      if (!exportBounds || !googleApi || !zone?.path?.length) return true
      if (zone.path.some(withinViewport)) return true
      const zoneBounds = new googleApi.maps.LatLngBounds()
      zone.path.forEach(point => zoneBounds.extend(point))
      return exportBounds.intersects(zoneBounds)
    }

    const lineIntersectsViewport = (line) => {
      if (!exportBounds || !googleApi || !line?.path?.length) return true
      if (line.path.some(withinViewport)) return true
      const lineBounds = new googleApi.maps.LatLngBounds()
      line.path.forEach(point => lineBounds.extend(point))
      return exportBounds.intersects(lineBounds)
    }

    const toStaticColor = (hex, alpha = 'ff') => {
      const cleaned = String(hex || '#3d8ef8').replace('#', '').trim()
      const normalized = cleaned.length === 3
        ? cleaned.split('').map(ch => ch + ch).join('')
        : cleaned.padStart(6, '0').slice(0, 6)
      return `0x${normalized}${alpha}`
    }

    const rect = map.getDiv().getBoundingClientRect()
    const scale = Math.min(640 / Math.max(rect.width, 1), 640 / Math.max(rect.height, 1), 1)
    const exportWidth = Math.max(220, Math.round(rect.width * scale))
    const exportHeight = Math.max(220, Math.round(rect.height * scale))
    const center = map.getCenter()
    const zoom = Math.round(map.getZoom() || 14)
    if (!center) return

    const exportZones = zones.filter(zoneIntersectsViewport)
    const exportAssets = assets.filter(asset => withinViewport({ lat: asset.lat, lng: asset.lng }))
    const exportLines = lines.filter(lineIntersectsViewport)
    const exportAnnotations = annotations.filter(annotation => withinViewport({ lat: annotation.lat, lng: annotation.lng }))
    const params = new URLSearchParams({
      center: `${center.lat()},${center.lng()}`,
      zoom: String(zoom),
      size: `${exportWidth}x${exportHeight}`,
      scale: '2',
      maptype: 'satellite',
      format: 'png',
      key: mapsApiKey,
    })

    exportZones.forEach(zone => {
      if (!zone.path?.length) return
      const stroke = toStaticColor(zone.zoneType?.color || '#3d8ef8', 'ff')
      const fill = toStaticColor(zone.zoneType?.color || '#3d8ef8', '33')
      const points = zone.path.map(point => `${point.lat},${point.lng}`).join('|')
      params.append('path', `fillcolor:${fill}|color:${stroke}|weight:2|${points}`)
    })

    exportLines.forEach(line => {
      if (!line.path?.length) return
      const stroke = toStaticColor(line.color || '#f59e0b', 'ff')
      const weight = Math.max(2, Math.round(line.strokeWeight || 4))
      const points = line.path.map(point => `${point.lat},${point.lng}`).join('|')
      params.append('path', `color:${stroke}|weight:${weight}|${points}`)
    })

    exportAssets.forEach(asset => {
      params.append('markers', `size:small|${asset.lat},${asset.lng}`)
    })

    exportAnnotations.forEach(annotation => {
      params.append('markers', `size:tiny|color:blue|${annotation.lat},${annotation.lng}`)
    })

    try {
      const staticUrl = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`
      const response = await fetch(staticUrl)
      if (!response.ok) throw new Error('Failed to generate map image.')
      const blob = await response.blob()

      if (format === 'pdf') {
        const imageUrl = URL.createObjectURL(blob)
        const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900')
        if (!printWindow) {
          URL.revokeObjectURL(imageUrl)
          window.alert('Popup blocked. Please allow popups to export PDF.')
          return
        }
        printWindow.document.write(`
          <!doctype html>
          <html>
            <head>
              <title>EventWiz Map Export</title>
              <style>
                html, body { margin: 0; padding: 0; background: #ffffff; }
                .wrap { display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 18px; box-sizing: border-box; }
                img { max-width: 100%; max-height: 96vh; border: 1px solid #e2e8f0; }
                @media print {
                  .wrap { padding: 0; }
                  img { border: none; width: 100%; max-height: none; }
                }
              </style>
            </head>
            <body>
              <div class="wrap">
                <img src="${imageUrl}" alt="EventWiz Export"/>
              </div>
            </body>
          </html>
        `)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => {
          printWindow.print()
          URL.revokeObjectURL(imageUrl)
        }, 300)
        return
      }

      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `eventwiz-map-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(downloadUrl)
    } catch {
      window.alert(`Could not export ${format.toUpperCase()}. Ensure Static Maps API is enabled for this key.`)
    }
  }, [annotations, assets, eventDetails, floorPlan, layers, lineStyle, lines, mapsApiKey, selectedZoneType, textStyle, zones])

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
        mapViewMode={mapViewMode}
        onToggleMapViewMode={handleToggleMapViewMode}
        locationQuery={eventDetails.locationQuery}
        onLocationQueryChange={(value) => {
          setEventDetails(prev => ({
            ...prev,
            locationQuery: value,
          }))
        }}
        onLocationSearch={handleLocationSearch}
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
          zones={zones}
          assets={assets}
          lines={lines}
          annotations={annotations}
          selectedId={selectedId}
          onSelectItem={handleSelect}
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
        />

      </div>

      <StatsBar zones={zones} assets={assets} annotations={annotations} selectedId={selectedId} />
    </div>
  )
}
