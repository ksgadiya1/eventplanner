import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GoogleMap, useJsApiLoader, Polygon, Circle, OverlayView, Polyline, MarkerF } from '@react-google-maps/api'
import { computeZoneCapacity, getAssetName, getZoneAllowedAssetTypes, isAssetAllowedInZone } from '../data/assets'
import {
  metersPerPixel,
  normalizeAngle,
  shortestAngleDelta,
  projectScreenDelta,
  getAssetSize,
  latLngToContainerPoint,
  clientPointToLatLng,
  isPointInsideFloorOverlay,
  computeLineLength,
  computePolygonMetrics,
  extractPathFromOverlay,
  getDeepestParentZone,
  getFloorGeometry,
  getZoneAnchor,
  clientRectToBounds,
  localDeltaToScreen,
  buildViewportBounds,
  normalizeFloorPlanState,
  computeContentBounds,
  buildCirclePath,
  buildSquarePath,
  buildRectanglePath,
  getLinePatternIcons,
  getBoundsPreviewPath,
  instantiateZoneFromTemplate,
  snapToGrid,
  snapToZoneGrid,
  computeVisibleGridSpacing,
  computeRenderedGridSpacing,
} from '../utils/mapGeometry'
import { formatDistance, formatArea } from '../utils/units'
import { AssetOverlay, FloorPlanOverlay, AnnotationOverlay, MeasurementOverlay } from './MapOverlays'
import MapLayers from './MapLayers'
import GridLayer from './GridLayer'
import AssetGlyph from './AssetGlyph'

const MAP_CENTER = { lat: 23.0225, lng: 72.5714 }
const LIBRARIES = ['drawing', 'geometry', 'places']

const CircleDot = React.memo(function CircleDot({ position, scale = 4, fillColor = '#fff', fillOpacity = 1, strokeColor = '#000', strokeWeight = 2 }) {
  const size = scale * 2 + strokeWeight
  return (
    <OverlayView
      position={position}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={() => ({ x: -size / 2, y: -size / 2 })}
    >
      <svg width={size} height={size} style={{ pointerEvents: 'none', display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={scale} fill={fillColor} fillOpacity={fillOpacity} stroke={strokeColor} strokeWidth={strokeWeight} />
      </svg>
    </OverlayView>
  )
})
const MIN_ASSET_SIZE_M = 0.5
const MIN_ASSET_SIZE_PX = 28
const MIN_FLOOR_SIZE_PX = 80
const MIN_ZONE_SIZE_M = 1
const MIN_ZONE_SIZE_PX = 24
const WHAT3WORDS_PATTERN = /^\s*([a-zA-Z]+\.[a-zA-Z]+\.[a-zA-Z]+)\s*$/
function getMapLabelStyle(accentColor = '#64748b', compact = false) {
  return {
    background: 'rgba(255,255,255,0.9)',
    color: '#0f172a',
    padding: compact ? '2px 7px' : '4px 10px',
    borderRadius: '999px',
    fontSize: compact ? '10px' : '12px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    border: `1px solid ${accentColor}`,
    boxShadow: '0 4px 12px rgba(15,23,42,0.1)',
    backdropFilter: 'blur(3px)',
    maxWidth: '220px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
}

function getZoneNameStyle(accentColor = '#2563eb', maxWidthPx = 140, compact = false) {
  return {
    display: 'inline-block',
    color: '#111111',
    fontSize: compact ? '12px' : '15px',
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    textAlign: 'center',
    padding: '0',
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    maxWidth: `${Math.max(64, Math.floor(maxWidthPx))}px`,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textShadow: '0 0 2px rgba(255,255,255,0.95), 0 0 6px rgba(255,255,255,0.9)',
  }
}

function getZoneDisplayName(zone) {
  const customLabel = typeof zone?.label === 'string' ? zone.label.trim() : ''
  return customLabel || zone?.zoneType?.name || 'Zone'
}

function getPathCenter(path = []) {
  if (!Array.isArray(path) || !path.length) return null
  const totals = path.reduce((sum, point) => ({
    lat: sum.lat + (point.lat || 0),
    lng: sum.lng + (point.lng || 0),
  }), { lat: 0, lng: 0 })

  return {
    lat: totals.lat / path.length,
    lng: totals.lng / path.length,
  }
}

function getRectangleZoneDimensions(zone, google) {
  const widthM = Number(zone?.widthM)
  const lengthM = Number(zone?.lengthM)
  if (Number.isFinite(widthM) && widthM > 0 && Number.isFinite(lengthM) && lengthM > 0) {
    return { widthM, lengthM }
  }

  if (!google?.maps?.geometry?.spherical || !Array.isArray(zone?.path) || zone.path.length < 4) {
    return { widthM: null, lengthM: null }
  }

  const p0 = zone.path[0]
  const p1 = zone.path[1]
  const p2 = zone.path[2]
  if (!p0 || !p1 || !p2) return { widthM: null, lengthM: null }

  return {
    widthM: google.maps.geometry.spherical.computeDistanceBetween(
      new google.maps.LatLng(p0.lat, p0.lng),
      new google.maps.LatLng(p1.lat, p1.lng)
    ),
    lengthM: google.maps.geometry.spherical.computeDistanceBetween(
      new google.maps.LatLng(p1.lat, p1.lng),
      new google.maps.LatLng(p2.lat, p2.lng)
    ),
  }
}

function buildZoneGridOverlay(zone, map, zoom) {
  if (!map || !Array.isArray(zone?.path) || zone.path.length < 3) return null

  const screenPoints = zone.path
    .map(point => latLngToContainerPoint(map, point.lat, point.lng))
    .filter(Boolean)

  if (screenPoints.length < 3) return null

  const minX = Math.min(...screenPoints.map(point => point.x))
  const maxX = Math.max(...screenPoints.map(point => point.x))
  const minY = Math.min(...screenPoints.map(point => point.y))
  const maxY = Math.max(...screenPoints.map(point => point.y))
  const width = Math.max(24, Math.ceil(maxX - minX))
  const height = Math.max(24, Math.ceil(maxY - minY))
  const bboxCenterPoint = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  }

  const center = (zone.shapeType === 'circle' || zone.shapeType === 'square') && zone.center
    ? zone.center
    : getPathCenter(zone.path)
  if (!center) return null

  const mapRect = map.getDiv?.()?.getBoundingClientRect?.()
  if (!mapRect) return null
  const bboxCenterLatLng = clientPointToLatLng(
    map,
    mapRect.left + bboxCenterPoint.x,
    mapRect.top + bboxCenterPoint.y
  )
  if (!bboxCenterLatLng) return null

  const centerPoint = latLngToContainerPoint(map, center.lat, center.lng, zoom)
  if (!centerPoint) return null

  const rawSpacingM = Math.max(1, Number(zone.gridSize || zone.rowSpacing || 3) || 3)
  const visibleSpacingM = computeVisibleGridSpacing(rawSpacingM, center.lat, zoom || map.getZoom?.() || 15)
  const cellPx = visibleSpacingM / Math.max(0.0001, metersPerPixel(center.lat, zoom || map.getZoom?.() || 15))

  const clipPoints = screenPoints
    .map(point => `${(((point.x - minX) / width) * 100).toFixed(2)}% ${(((point.y - minY) / height) * 100).toFixed(2)}%`)
    .join(', ')

  return {
    id: `${zone.id}-grid-overlay`,
    position: { lat: bboxCenterLatLng.lat(), lng: bboxCenterLatLng.lng() },
    offsetX: 0,
    offsetY: 0,
    width,
    height,
    cellPx: Math.max(12, Math.round(cellPx)),
    gridSizeM: visibleSpacingM,
    color: zone.strokeColor || zone.zoneType?.color || '#3d8ef8',
    opacity: zone.gridOpacity ?? 0.22,
    rotationDeg: Number(zone.gridRotation || 0),
    anchorX: Math.round(centerPoint.x - minX),
    anchorY: Math.round(centerPoint.y - minY),
    clipPath: `polygon(${clipPoints})`,
  }
}

export default function MapCanvas({
  drawMode,
  onDrawMode,
  onEraseAsset,
  selectedZoneType,
  layers,
  zones,
  assets,
  lines,
  annotations,
  floorPlan,
  placingFloor,
  selectedId,
  onSelect,
  onClearSelection,
  onZoneCreate,
  onLineCreate,
  onAnnotationCreate,
  onAssetDrop,
  onAssetUpdate,
  pendingAssetDef,
  onPendingAssetClear,
  pendingZoneTemplate,
  onPendingZoneTemplateClear,
  onFloorPlanChange,
  onFloorPlacementChange,
  eventDetails,
  onEventDetailsChange,
  mapViewMode = 'roadmap',
  lineStyle,
  textStyle,
  annotationDraftText,
  onMapRef,
  onViewportChange,
  initialView = null,
  isViewOnly = false,
  viewOnlyMinZoom,
  viewOnlyMaxZoom,
  measurementUnit = 'meters',
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  const what3wordsKey = import.meta.env.VITE_WHAT3WORDS_API_KEY || ''
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  })

  const mapRef = useRef(null)
  const interactionRef = useRef(null)
  const lineDraftRef = useRef(null)
  const polygonDraftRef = useRef(null)
  const shapeDraftRef = useRef(null)
  const zoneOverlayRefs = useRef({})
  const zoneCircleRefs = useRef({})
  const lastCircleSnapshotRef = useRef({})
  const lineOverlayRefs = useRef({})
  const lastLineSnapshotRef = useRef({})
  const [mapZoom, setMapZoom] = useState(14)
  const [tempFloorPoints, setTempFloorPoints] = useState([])
  const [lineDraft, setLineDraft] = useState(null)
  const [polygonDraft, setPolygonDraft] = useState(null)
  const [shapeDraft, setShapeDraft] = useState(null)
  const [lineMeasurement, setLineMeasurement] = useState(null)
  const [segmentMeasurement, setSegmentMeasurement] = useState(null)
  const cursorScreenPositionRef = useRef(null)
  const cursorLatLngRef = useRef(null)
  const [cursorTick, setCursorTick] = useState(0)
  const [hoveredLine, setHoveredLine] = useState(null)
  const [hoverScreenPos, setHoverScreenPos] = useState(null)
  const [hoveredItem, setHoveredItem] = useState(null) // Track any hovered item with tooltips
  const [measurePoints, setMeasurePoints] = useState([])
  const [measureHover, setMeasureHover] = useState(null)
  const measurePointsRef = useRef([])

  useEffect(() => {
    lineDraftRef.current = lineDraft
  }, [lineDraft])

  useEffect(() => {
    polygonDraftRef.current = polygonDraft
  }, [polygonDraft])

  useEffect(() => {
    shapeDraftRef.current = shapeDraft
  }, [shapeDraft])

  useEffect(() => {
    measurePointsRef.current = measurePoints
  }, [measurePoints])

  // Clear drafts when switching away from drawing modes
  useEffect(() => {
    if (drawMode === 'select') {
      setLineDraft(null)
      setPolygonDraft(null)
      setShapeDraft(null)
      setLineMeasurement(null)
      setSegmentMeasurement(null)
      setMeasurePoints([])
      setMeasureHover(null)
    }
    if (drawMode !== 'measure') {
      setMeasurePoints([])
      setMeasureHover(null)
    }
  }, [drawMode])

  // Clear line draft when selecting a line for editing (prevents overlap)
  useEffect(() => {
    if (selectedId && drawMode !== 'select') {
      const selectedLine = lines.find(l => l.id === selectedId)
      if (selectedLine && selectedLine.type === 'line') {
        setLineDraft(null)
      }
    }
  }, [selectedId, drawMode, lines])

  useEffect(() => {
    if (layers.lines?.visible === false && (drawMode === 'line' || drawMode === 'route')) {
      setLineDraft(null)
      setLineMeasurement(null)
      setHoveredLine(null)
      setHoverScreenPos(null)
    }
  }, [drawMode, layers.lines?.visible])

  const zoneById = useMemo(() => new Map(zones.map(zone => [zone.id, zone])), [zones])

  // Check if zone or any of its parent zones are hidden
  const isZoneOrParentHidden = useCallback(function checkZone(zone) {
    if (!zone) return false
    if (zone.visible === false) return true
    if (zone.parentId) {
      const parent = zoneById.get(zone.parentId)
      if (parent) return checkZone(parent)
    }
    return false
  }, [zoneById])

  const selectedAsset = useMemo(
    () => assets.find(asset => asset.id === selectedId) || null,
    [assets, selectedId]
  )
  const selectedAnnotation = useMemo(
    () => annotations.find(annotation => annotation.id === selectedId) || null,
    [annotations, selectedId]
  )
  const zoneGridOverlays = useMemo(() => {
    const map = mapRef.current
    if (!isLoaded || !map || layers.zones?.visible === false) return []

    const currentZoom = map.getZoom() || mapZoom || 15
    return zones.flatMap(zone => {
      if (isZoneOrParentHidden(zone)) return []
      const gridEnabled = zone.showGrid ?? ['grid', 'rows'].includes(zone.layoutType)
      if (!gridEnabled) return []

      const overlay = buildZoneGridOverlay(zone, map, currentZoom)
      return overlay ? [overlay] : []
    })
  }, [isLoaded, isZoneOrParentHidden, layers.zones?.visible, mapZoom, zones])
  const floorSelected = selectedId === 'floor-plan'
  const visibleAssets = useMemo(() => {
    if (layers.assets?.visible === false) return []

    return assets.filter((asset) => {
      if (!asset.parentId) return true
      const parentZone = zoneById.get(asset.parentId)
      return !(parentZone && isZoneOrParentHidden(parentZone))
    })
  }, [assets, isZoneOrParentHidden, layers.assets?.visible, zoneById])

  const visibleAnnotations = useMemo(() => {
    if (layers.annotations?.visible === false) return []
    return annotations.filter(annotation => annotation.id !== selectedAnnotation?.id)
  }, [annotations, layers.annotations?.visible, selectedAnnotation?.id])

  const defaultCenter = initialView?.center || eventDetails?.resolvedLocation?.center || MAP_CENTER
  const defaultZoom = Number.isFinite(Number(initialView?.zoom)) ? Number(initialView.zoom) : 14
  const viewOnlyRestrictionBounds = useMemo(() => {
    if (!isViewOnly || !window.google) return null
    return eventDetails?.resolvedLocation?.restrictionBounds
      || computeContentBounds(window.google, { zones, assets, lines, annotations, floorPlan })
      || null
  }, [annotations, assets, eventDetails?.resolvedLocation?.restrictionBounds, floorPlan, isViewOnly, lines, zones])

  const hoveredTooltipPosition = useMemo(() => {
    if (!hoveredItem || drawMode !== 'select') return null

    const map = mapRef.current
    const mapRect = map?.getDiv?.()?.getBoundingClientRect?.()
    const fallbackX = cursorScreenPositionRef.current?.x
    const fallbackY = cursorScreenPositionRef.current?.y

    const clampX = (x) => {
      if (!mapRect) return x
      const safeMargin = Math.min(170, Math.max(80, mapRect.width / 4))
      return Math.min(Math.max(x, safeMargin), Math.max(safeMargin, mapRect.width - safeMargin))
    }

    let anchorPoint = null
    const data = hoveredItem.data || {}

    if (map && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
      anchorPoint = latLngToContainerPoint(map, data.lat, data.lng)
    } else if (map && Array.isArray(data.path) && data.path.length) {
      const center = data.path.reduce(
        (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
        { lat: 0, lng: 0 }
      )
      anchorPoint = latLngToContainerPoint(map, center.lat / data.path.length, center.lng / data.path.length)
    }

    const x = anchorPoint?.x ?? fallbackX
    const y = anchorPoint?.y ?? fallbackY

    if (!Number.isFinite(x) || !Number.isFinite(y)) return null

    let verticalOffset = 18
    if (hoveredItem.type === 'asset') {
      const { lengthPx } = getAssetSize(data, mapZoom)
      verticalOffset = Math.max(20, Math.round(lengthPx / 2) + 12)
    } else if (hoveredItem.type === 'annotation') {
      verticalOffset = mapZoom >= 15 ? 44 : 34
    }

    return {
      x: clampX(x),
      y: Math.max(16, y - verticalOffset),
    }
  }, [cursorTick, drawMode, hoveredItem, mapZoom])

  const updateMapViewport = useCallback(() => {
    if (!mapRef.current || !window.google) return
    const contentBounds = computeContentBounds(window.google, { zones, assets, lines, annotations, floorPlan })
    if (contentBounds) {
      mapRef.current.fitBounds(contentBounds, 80)
      return
    }
    const locationBounds = eventDetails?.resolvedLocation?.restrictionBounds
    if (locationBounds) mapRef.current.fitBounds(locationBounds, 60)
  }, [annotations, assets, eventDetails, floorPlan, lines, zones])

  const rafRef = useRef(null)

  const onLoad = useCallback((map) => {
    mapRef.current = map
    const initialZoom = map.getZoom() || 14
    setMapZoom(initialZoom)

    const nextMapType = ['roadmap', 'terrain', 'hybrid', 'satellite'].includes(mapViewMode)
      ? mapViewMode
      : 'roadmap'
    map.setMapTypeId(nextMapType)

    map.addListener('bounds_changed', () => {
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const z = map.getZoom()
        const center = map.getCenter()
        if (z != null) {
          setMapZoom((prev) => (prev !== z ? z : prev))
        }
        if (isViewOnly && center && onViewportChange) {
          onViewportChange({
            center: { lat: center.lat(), lng: center.lng() },
            zoom: z ?? 14,
          })
        }
      })
    })

    if (onMapRef) onMapRef(map)
    if (isViewOnly && onViewportChange) {
      const center = map.getCenter()
      onViewportChange({
        center: center ? { lat: center.lat(), lng: center.lng() } : defaultCenter,
        zoom: map.getZoom() || defaultZoom,
      })
    }
  }, [defaultCenter, defaultZoom, isViewOnly, mapViewMode, onMapRef, onViewportChange])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const nextMapType = ['roadmap', 'terrain', 'hybrid', 'satellite'].includes(mapViewMode)
      ? mapViewMode
      : 'roadmap'

    map.setMapTypeId(nextMapType)
    map.setTilt(0)
    map.setHeading(0)
  }, [mapViewMode])



  useEffect(() => {
    if (!isLoaded || !window.google || !eventDetails?.locationQuery || eventDetails?.resolvedLocation?.query === eventDetails.locationQuery) return

    const query = eventDetails.locationQuery.trim()
    const w3wMatch = query.match(WHAT3WORDS_PATTERN)
    const applyResolvedLocation = (payload) => {
      const center = payload?.center || null
      onEventDetailsChange(prev => ({
        ...prev,
        resolvedLocation: {
          query: prev.locationQuery,
          ...payload,
          lat: payload?.lat ?? center?.lat ?? null,
          lng: payload?.lng ?? center?.lng ?? null,
        },
      }))
    }

    const geocoder = new window.google.maps.Geocoder()
    const runGoogleGeocode = () => {
      geocoder.geocode({ address: query }, (results, status) => {
        if (status !== 'OK' || !results?.length) return
        const result = results[0]
        const location = result.geometry?.location
        if (!location) return

        const viewport = result.geometry.viewport
        const restrictionBounds = viewport || buildViewportBounds(window.google, [
          { lat: location.lat() + 0.03, lng: location.lng() - 0.03 },
          { lat: location.lat() - 0.03, lng: location.lng() + 0.03 },
        ])

        applyResolvedLocation({
          formattedAddress: result.formatted_address,
          center: { lat: location.lat(), lng: location.lng() },
          restrictionBounds,
        })
      })
    }

    if (w3wMatch && what3wordsKey) {
      const words = w3wMatch[1].toLowerCase()
      fetch(`https://api.what3words.com/v3/convert-to-coordinates?words=${encodeURIComponent(words)}&key=${encodeURIComponent(what3wordsKey)}`)
        .then(response => response.json())
        .then(data => {
          const lat = Number(data?.coordinates?.lat)
          const lng = Number(data?.coordinates?.lng)
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            runGoogleGeocode()
            return
          }
          const restrictionBounds = buildViewportBounds(window.google, [
            { lat: lat + 0.0025, lng: lng - 0.0025 },
            { lat: lat - 0.0025, lng: lng + 0.0025 },
          ])
          applyResolvedLocation({
            formattedAddress: data.nearestPlace ? `${words} (${data.nearestPlace})` : words,
            center: { lat, lng },
            restrictionBounds,
          })
        })
        .catch(() => {
          runGoogleGeocode()
        })
      return
    }

    runGoogleGeocode()
  }, [eventDetails?.locationQuery, eventDetails?.resolvedLocation?.query, isLoaded, onEventDetailsChange, what3wordsKey])

  useEffect(() => {
    const map = mapRef.current
    const resolved = eventDetails?.resolvedLocation
    if (!map || !resolved) return

    map.setCenter(resolved.center)
    if (resolved.restrictionBounds) map.fitBounds(resolved.restrictionBounds, 60)
  }, [eventDetails?.resolvedLocation])

  function buildAssetPlacement(assetBase) {
    if (!window.google) return assetBase
    const parentZone = getDeepestParentZone({ lat: assetBase.lat, lng: assetBase.lng }, zones, window.google)

    if (parentZone?.contentLocked && !isAssetAllowedInZone(parentZone, assetBase.assetDef?.id)) {
      const allowed = getZoneAllowedAssetTypes(parentZone).map(getAssetName)
      window.alert(`Only ${allowed.join(', ')} can be placed inside ${parentZone.label || parentZone.zoneType?.name}.`)
      return null
    }

    const placement = {
      ...assetBase,
      parentId: parentZone?.id || null,
    }

    const baseGridSnap = Boolean(layers.grid?.visible && layers.grid?.snap)
    const baseGridSizeRaw = Number(layers.grid?.size || 3)
    const baseCenterLat = mapRef.current?.getCenter?.()?.lat?.() ?? assetBase.lat
    const baseGridSize = computeRenderedGridSpacing(baseGridSizeRaw, baseCenterLat, mapZoom, mapRef.current?.getBounds?.())
    const zoneGridEnabled = Boolean(parentZone?.showGrid ?? ['grid', 'rows'].includes(parentZone?.layoutType))
    const zoneGridSnap = Boolean(parentZone?.snapToGrid && zoneGridEnabled)
    const rawZoneGridSize = Number(parentZone?.gridSize || parentZone?.rowSpacing || 3)
    const zoneAnchor = parentZone ? getZoneAnchor(parentZone) : null
    const zoneAnchorLat = zoneAnchor?.lat ?? assetBase.lat
    const zoneGridSize = computeVisibleGridSpacing(rawZoneGridSize, zoneAnchorLat, mapZoom)

    if (zoneGridSnap && Number.isFinite(assetBase.lat) && Number.isFinite(assetBase.lng)) {
      const snapped = snapToZoneGrid(assetBase.lat, assetBase.lng, parentZone, mapZoom, assetBase.widthM, assetBase.lengthM)
      return {
        ...placement,
        lat: snapped.lat,
        lng: snapped.lng,
      }
    }

    if (baseGridSnap && Number.isFinite(assetBase.lat) && Number.isFinite(assetBase.lng)) {
      const snapped = snapToGrid(assetBase.lat, assetBase.lng, baseGridSize, baseCenterLat, assetBase.widthM, assetBase.lengthM)
      return {
        ...placement,
        lat: snapped.lat,
        lng: snapped.lng,
      }
    }

    return placement
  }

  const buildAnnotationPlacement = useCallback((annotationBase) => {
    if (!window.google) return annotationBase
    const parentZone = getDeepestParentZone({ lat: annotationBase.lat, lng: annotationBase.lng }, zones, window.google)
    return {
      ...annotationBase,
      parentId: parentZone?.id || null,
    }
  }, [zones])

  useEffect(() => {
    const handleInteractionMove = (event) => {
      const interaction = interactionRef.current
      const map = mapRef.current
      if (!interaction || !map || !onAssetUpdate) return

      if (interaction.objectType === 'asset') {
        if (interaction.type === 'move') {
          const latLng = clientPointToLatLng(map, event.clientX, event.clientY)
          if (!latLng) return
          const movedAsset = buildAssetPlacement({
            ...interaction.object,
            lat: latLng.lat() - (interaction.latOffset || 0),
            lng: latLng.lng() - (interaction.lngOffset || 0),
          })
          if (!movedAsset) return
          onAssetUpdate(movedAsset)
          return
        }

        if (interaction.type === 'resize') {
          const dx = event.clientX - interaction.startX
          const dy = event.clientY - interaction.startY
          const { localX, localY } = projectScreenDelta(dx, dy, interaction.startRotationDeg)
          const handle = interaction.resizeHandle || { xSign: 1, ySign: 1 }
          const rawWidth = interaction.startWidthPx + (localX * handle.xSign)
          const rawLength = interaction.startLengthPx + (localY * handle.ySign)
          const widthPx = Math.max(MIN_ASSET_SIZE_PX, rawWidth)
          const lengthPx = Math.max(MIN_ASSET_SIZE_PX, rawLength)
          const appliedWidthDelta = widthPx - interaction.startWidthPx
          const appliedLengthDelta = lengthPx - interaction.startLengthPx
          const localCenterShift = {
            x: (appliedWidthDelta / 2) * handle.xSign,
            y: (appliedLengthDelta / 2) * handle.ySign,
          }
          const screenShift = localDeltaToScreen(localCenterShift.x, localCenterShift.y, interaction.startRotationDeg)
          const nextCenterLatLng = clientPointToLatLng(
            map,
            interaction.center.x + screenShift.x,
            interaction.center.y + screenShift.y
          )
          if (!nextCenterLatLng) return

          onAssetUpdate({
            ...interaction.object,
            lat: nextCenterLatLng.lat(),
            lng: nextCenterLatLng.lng(),
            widthM: Number(Math.max(MIN_ASSET_SIZE_M, widthPx * interaction.metersPerPixel).toFixed(2)),
            lengthM: Number(Math.max(MIN_ASSET_SIZE_M, lengthPx * interaction.metersPerPixel).toFixed(2)),
          })
          return
        }

        if (interaction.type === 'rotate') {
          const nextAngle = Math.atan2(event.clientY - interaction.center.y, event.clientX - interaction.center.x) * 180 / Math.PI
          const delta = shortestAngleDelta(interaction.startPointerAngle, nextAngle)
          onAssetUpdate({
            ...interaction.object,
            rotationDeg: Number(normalizeAngle(interaction.startRotationDeg + delta).toFixed(1)),
          })
        }
        return
      }

      if (interaction.objectType === 'floor') {
        if (interaction.type === 'move') {
          const nextCenter = clientPointToLatLng(map, event.clientX, event.clientY)
          if (!nextCenter) return

          onFloorPlanChange(prev => prev ? normalizeFloorPlanState({
            ...prev,
            center: {
              lat: nextCenter.lat() - (interaction.latOffset || 0),
              lng: nextCenter.lng() - (interaction.lngOffset || 0)
            },
            widthM: interaction.startWidthM,
            heightM: interaction.startHeightM,
            rotation: interaction.startRotation,
          }) : prev)
          return
        }

        if (interaction.type === 'resize') {
          const dx = event.clientX - interaction.startX
          const dy = event.clientY - interaction.startY
          const { localX, localY } = projectScreenDelta(dx, dy, interaction.startRotation)
          const handle = interaction.resizeHandle || { xSign: 1, ySign: 1 }
          const rawWidth = interaction.startWidthPx + (localX * handle.xSign)
          const rawHeight = interaction.startHeightPx + (localY * handle.ySign)
          const widthPx = Math.max(MIN_FLOOR_SIZE_PX, rawWidth)
          const heightPx = Math.max(MIN_FLOOR_SIZE_PX, rawHeight)
          const appliedWidthDelta = widthPx - interaction.startWidthPx
          const appliedHeightDelta = heightPx - interaction.startHeightPx
          const localCenterShift = {
            x: (appliedWidthDelta / 2) * handle.xSign,
            y: (appliedHeightDelta / 2) * handle.ySign,
          }
          const screenShift = localDeltaToScreen(localCenterShift.x, localCenterShift.y, interaction.startRotation)
          const nextCenter = clientPointToLatLng(
            map,
            interaction.center.x + screenShift.x,
            interaction.center.y + screenShift.y
          )
          if (!nextCenter) return

          onFloorPlanChange(prev => prev ? normalizeFloorPlanState({
            ...prev,
            center: { lat: nextCenter.lat(), lng: nextCenter.lng() },
            widthM: Number(Math.max(1, widthPx * interaction.metersPerPixel).toFixed(2)),
            heightM: Number(Math.max(1, heightPx * interaction.metersPerPixel).toFixed(2)),
            rotation: interaction.startRotation,
          }) : prev)
          return
        }

        if (interaction.type === 'rotate') {
          const nextAngle = Math.atan2(event.clientY - interaction.center.y, event.clientX - interaction.center.x) * 180 / Math.PI
          const delta = shortestAngleDelta(interaction.startPointerAngle, nextAngle)
          onFloorPlanChange(prev => prev ? normalizeFloorPlanState({
            ...prev,
            center: interaction.startCenter,
            widthM: interaction.startWidthM,
            heightM: interaction.startHeightM,
            rotation: Number(normalizeAngle(interaction.startRotation + delta).toFixed(1)),
          }) : prev)
        }
      }

      if (interaction.objectType === 'zone' && interaction.type === 'rotate') {
        if (!Array.isArray(interaction.startPath) || interaction.startPath.length < 3) return

        const center = interaction.startPath.reduce(
          (acc, point) => ({
            lat: acc.lat + Number(point.lat || 0),
            lng: acc.lng + Number(point.lng || 0),
          }),
          { lat: 0, lng: 0 }
        )
        center.lat /= interaction.startPath.length
        center.lng /= interaction.startPath.length

        const rect = map.getDiv().getBoundingClientRect()
        const centerPoint = latLngToContainerPoint(map, center.lat, center.lng)
        if (!centerPoint) return

        const centerClient = { x: rect.left + centerPoint.x, y: rect.top + centerPoint.y }
        const startAngle = Math.atan2(interaction.startY - centerClient.y, interaction.startX - centerClient.x)
        const currentAngle = Math.atan2(event.clientY - centerClient.y, event.clientX - centerClient.x)
        const delta = startAngle - currentAngle
        const cos = Math.cos(delta)
        const sin = Math.sin(delta)

        const rotatedPath = interaction.startPath.map((point) => {
          // const dx = Number(point.lng || 0) - center.lng
          // const dy = Number(point.lat || 0) - center.lat
          // return {
          //   lat: center.lat + (dy * cos - dx * sin),
          //   lng: center.lng + (dx * cos + dy * sin),
          // }
          const screenPoint = latLngToContainerPoint(map, point.lat, point.lng)
          if (!screenPoint) return point
          const localX = screenPoint.x - centerPoint.x
          const localY = screenPoint.y - centerPoint.y
          const rotatedX = localX * cos - localY * sin
          const rotatedY = localX * sin + localY * cos
          const nextClientX = rect.left + centerPoint.x + rotatedX
          const nextClientY = rect.top + centerPoint.y + rotatedY
          const nextLatLng = clientPointToLatLng(map, nextClientX, nextClientY)
          return nextLatLng ? { lat: nextLatLng.lat(), lng: nextLatLng.lng() } : point
        })

        onAssetUpdate({
          ...interaction.object,
          path: rotatedPath,
          rotation: Number(normalizeAngle((interaction.startRotation || 0) + (delta * 180) / Math.PI).toFixed(1)),
        })
        return
      }

      if (interaction.objectType === 'zone' && interaction.type === 'resize') {
        const dx = event.clientX - interaction.startX
        const dy = event.clientY - interaction.startY
        const { localX, localY } = projectScreenDelta(dx, dy, interaction.startRotation)
        const handle = interaction.resizeHandle || { xSign: 1, ySign: 1 }
        const rawWidth = interaction.startWidthPx + (localX * handle.xSign)
        const rawLength = interaction.startLengthPx + (localY * handle.ySign)
        const widthPx = Math.max(MIN_ZONE_SIZE_PX, rawWidth)
        const lengthPx = Math.max(MIN_ZONE_SIZE_PX, rawLength)
        const appliedWidthDelta = widthPx - interaction.startWidthPx
        const appliedLengthDelta = lengthPx - interaction.startLengthPx
        const localCenterShift = {
          x: (appliedWidthDelta / 2) * handle.xSign,
          y: (appliedLengthDelta / 2) * handle.ySign,
        }
        const screenShift = localDeltaToScreen(localCenterShift.x, localCenterShift.y, interaction.startRotation)
        const nextCenter = clientPointToLatLng(
          map,
          interaction.center.x + screenShift.x,
          interaction.center.y + screenShift.y
        )
        if (!nextCenter) return

        const nextWidthM = Number(Math.max(MIN_ZONE_SIZE_M, widthPx * interaction.metersPerPixel).toFixed(2))
        const nextLengthM = Number(Math.max(MIN_ZONE_SIZE_M, lengthPx * interaction.metersPerPixel).toFixed(2))
        const nextCenterLatLng = { lat: nextCenter.lat(), lng: nextCenter.lng() }

        onAssetUpdate({
          ...interaction.object,
          center: nextCenterLatLng,
          widthM: nextWidthM,
          lengthM: nextLengthM,
          path: buildRectanglePath(
            nextCenterLatLng,
            nextWidthM / 2,
            nextLengthM / 2,
            window.google,
            interaction.object.rotation || 0
          ),
        })
        return
      }

      if (interaction.objectType === 'annotation') {
        if (interaction.type === 'move') {
          const latLng = clientPointToLatLng(map, event.clientX, event.clientY)
          if (!latLng) return
          const movedAnnotation = buildAnnotationPlacement({
            ...interaction.object,
            lat: latLng.lat() - (interaction.latOffset || 0),
            lng: latLng.lng() - (interaction.lngOffset || 0),
          })
          onAssetUpdate(movedAnnotation)
        }
      }
    }

    const handleInteractionUp = () => {
      if (!interactionRef.current) return
      interactionRef.current = null
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleInteractionMove)
    window.addEventListener('mouseup', handleInteractionUp)
    window.addEventListener('pointermove', handleInteractionMove)
    window.addEventListener('pointerup', handleInteractionUp)
    window.addEventListener('pointercancel', handleInteractionUp)

    return () => {
      window.removeEventListener('mousemove', handleInteractionMove)
      window.removeEventListener('mouseup', handleInteractionUp)
      window.removeEventListener('pointermove', handleInteractionMove)
      window.removeEventListener('pointerup', handleInteractionUp)
      window.removeEventListener('pointercancel', handleInteractionUp)
    }
  }, [buildAnnotationPlacement, buildAssetPlacement, onAssetUpdate, onFloorPlanChange])

  const finalizePolygon = useCallback((path) => {
    if (!window.google || !path || path.length < 3) return
    const { areaM2, perimeterM } = computePolygonMetrics(path, window.google)
    const isInsideExistingZone = path.some(point => getDeepestParentZone(point, zones, window.google))
    if (isInsideExistingZone) {
      window.alert('Zones can contain elements and assets, but not another zone inside them.')
      return
    }
    const zoneType = selectedZoneType || { id: 'generic', name: 'Zone', color: '#3d8ef8', fillOpacity: 0.2 }
    const defaultSubType = zoneType?.defaultSubTypeId
      ? zoneType.subTypes?.find(subType => subType.id === zoneType.defaultSubTypeId) || null
      : null

    onZoneCreate({
      id: `zone_${Date.now()}`,
      type: 'zone',
      zoneType,
      layoutType: 'free',
      showGrid: false,
      gridSize: 3,
      gridRotation: 0,
      subType: defaultSubType,
      parentId: null,
      path,
      areaM2,
      perimeterM,
      capacity: null,
      label: zoneType?.name || 'Zone',
      allowedAssetTypes: zoneType?.allowedAssetTypes || [],
      contentLocked: !!zoneType?.allowedAssetTypes?.length,
      status: 'planned',
      notes: '',
    })
  }, [onZoneCreate, selectedZoneType, zones])

  const handleZonePathChange = useCallback((zone) => {
    const overlay = zoneOverlayRefs.current[zone.id]
    if (!window.google || !overlay) return
    const path = extractPathFromOverlay(overlay)
    if (path.length < 3) return
    const { areaM2, perimeterM } = computePolygonMetrics(path, window.google)

    const updateData = {
      ...zone,
      path,
      areaM2,
      perimeterM,
      parentId: zone.parentId || null,
      capacity: computeZoneCapacity({ ...zone, path, areaM2 }),
    }

    // For square zones, synchronize center and dimensions with the new path
    if (zone.shapeType === 'square') {
      const center = getPathCenter(path)
      const dimensions = getRectangleZoneDimensions({ path }, window.google)
      updateData.center = center
      if (dimensions.widthM) updateData.widthM = Number(dimensions.widthM.toFixed(2))
      if (dimensions.lengthM) updateData.lengthM = Number(dimensions.lengthM.toFixed(2))
    }

    onAssetUpdate(updateData)
  }, [onAssetUpdate, zones])

  const handleCircleZoneChange = useCallback((zone) => {
    const circle = zoneCircleRefs.current[zone.id]
    if (!window.google || !circle) return

    const center = circle.getCenter()
    const radiusM = circle.getRadius()
    if (!center || !Number.isFinite(radiusM) || radiusM <= 0) return

    const nextCenter = { lat: center.lat(), lng: center.lng() }
    const centerChanged = !zone.center
      || Math.abs((zone.center.lat || 0) - nextCenter.lat) > 1e-9
      || Math.abs((zone.center.lng || 0) - nextCenter.lng) > 1e-9
    const radiusChanged = Math.abs((zone.radiusM || 0) - radiusM) > 0.05

    const lastSnapshot = lastCircleSnapshotRef.current[zone.id]
    const alreadySaved = lastSnapshot
      && Math.abs(lastSnapshot.lat - nextCenter.lat) <= 1e-9
      && Math.abs(lastSnapshot.lng - nextCenter.lng) <= 1e-9
      && Math.abs(lastSnapshot.radiusM - radiusM) <= 0.05

    if ((!centerChanged && !radiusChanged) || alreadySaved) return

    lastCircleSnapshotRef.current[zone.id] = {
      lat: nextCenter.lat,
      lng: nextCenter.lng,
      radiusM,
    }

    const path = buildCirclePath(nextCenter, radiusM, window.google, 72)
    const areaM2 = Math.PI * radiusM * radiusM
    const perimeterM = 2 * Math.PI * radiusM

    onAssetUpdate({
      ...zone,
      center: nextCenter,
      radiusM,
      path,
      areaM2,
      perimeterM,
      parentId: zone.parentId || null,
      capacity: computeZoneCapacity({ ...zone, center: nextCenter, radiusM, path, areaM2 }),
    })
  }, [onAssetUpdate])

  const handleLineGeometryChange = useCallback((line) => {
    const overlay = lineOverlayRefs.current[line.id]
    if (!overlay || !window.google) return

    const path = extractPathFromOverlay(overlay)
    if (path.length < 2) return

    const isSameAsCurrent = Array.isArray(line.path)
      && line.path.length === path.length
      && line.path.every((point, index) => (
        Math.abs((point.lat || 0) - (path[index]?.lat || 0)) <= 1e-9
        && Math.abs((point.lng || 0) - (path[index]?.lng || 0)) <= 1e-9
      ))

    const lastSnapshot = lastLineSnapshotRef.current[line.id]
    const isSameAsLast = Array.isArray(lastSnapshot)
      && lastSnapshot.length === path.length
      && lastSnapshot.every((point, index) => (
        Math.abs((point.lat || 0) - (path[index]?.lat || 0)) <= 1e-9
        && Math.abs((point.lng || 0) - (path[index]?.lng || 0)) <= 1e-9
      ))

    if (isSameAsCurrent || isSameAsLast) return

    lastLineSnapshotRef.current[line.id] = path
    onAssetUpdate({
      ...line,
      path,
      lengthM: computeLineLength(path, window.google),
    })
  }, [onAssetUpdate])

  const handleDrop = useCallback((event) => {
    event.preventDefault()
    if (!mapRef.current || !window.google) return

    const data = event.dataTransfer.getData('application/eventwiz-asset')
    if (!data) return

    const asset = JSON.parse(data)
    const latLng = clientPointToLatLng(mapRef.current, event.clientX, event.clientY)
    if (!latLng) return

    const placedAsset = buildAssetPlacement({
      id: `asset_${Date.now()}`,
      type: 'asset',
      assetDef: asset,
      lat: latLng.lat(),
      lng: latLng.lng(),
      widthM: asset.defaultWidth || 4,
      lengthM: asset.defaultLength || asset.defaultWidth || 4,
      rotationDeg: 0,
      label: asset.name,
      status: 'planned',
      notes: '',
    })
    if (!placedAsset) return
    onAssetDrop(placedAsset)
  }, [buildAssetPlacement, onAssetDrop])

  const handleDragOver = useCallback((event) => {
    event.preventDefault()
  }, [])

  const handleMapMouseMove = useCallback((event) => {
    if (!window.google || !event.latLng) return

    if (event.domEvent) {
      const rect = mapRef.current?.getDiv?.().getBoundingClientRect?.()
      if (rect) {
        cursorScreenPositionRef.current = {
          x: event.domEvent.clientX - rect.left,
          y: event.domEvent.clientY - rect.top,
        }
      }
    }

    cursorLatLngRef.current = { lat: event.latLng.lat(), lng: event.latLng.lng() }
    // Only trigger re-render when we actually need the cursor tooltip
    // (drawing modes, pending asset placement, or measure mode)
    if (drawMode !== 'select' || pendingAssetDef || pendingZoneTemplate) {
      setCursorTick(t => t + 1)
    }

    const activeShape = shapeDraftRef.current
    if (activeShape?.center && (activeShape.type === 'circle' || activeShape.type === 'square')) {
      const centerLatLng = new window.google.maps.LatLng(activeShape.center.lat, activeShape.center.lng)
      const currentDist = window.google.maps.geometry.spherical.computeDistanceBetween(centerLatLng, event.latLng)
      setLineMeasurement(currentDist)
    }


    const hoverPoint = { lat: event.latLng.lat(), lng: event.latLng.lng() }
    const activeLineDraft = lineDraftRef.current
    const activePolygonDraft = polygonDraftRef.current

    if (placingFloor && tempFloorPoints.length === 1) {
      setTempFloorPoints([tempFloorPoints[0], hoverPoint])
      return
    }

    if ((drawMode === 'line' || drawMode === 'route') && layers.lines?.visible !== false && !layers.lines?.locked && activeLineDraft?.points?.length) {
      const previewPath = [...activeLineDraft.points, hoverPoint]
      setLineDraft(prev => prev ? { ...prev, hoverPoint } : prev)
      // lineMeasurement = total including rubber-band, used for live cursor tooltip
      setLineMeasurement(computeLineLength(previewPath, window.google))
      return
    }

    if (drawMode === 'polygon' && activePolygonDraft?.points?.length) {
      const previewPath = [...activePolygonDraft.points, hoverPoint]
      setPolygonDraft(prev => prev ? { ...prev, hoverPoint } : prev)
      setLineMeasurement(computeLineLength(previewPath, window.google))
      return
    }

    if (drawMode === 'measure' && measurePointsRef.current.length > 0) {
      setMeasureHover(hoverPoint)
      const previewPath = [...measurePointsRef.current, hoverPoint]
      setLineMeasurement(computeLineLength(previewPath, window.google))
    }
  }, [drawMode, layers.lines, pendingAssetDef, pendingZoneTemplate, placingFloor, tempFloorPoints])

  const placePendingAssetAtLatLng = useCallback((latLng) => {
    if (!latLng) return false
    if (drawMode !== 'select' || !pendingAssetDef || layers.assets?.locked || !layers.assets?.visible) return false

    const placedAsset = buildAssetPlacement({
      id: `asset_${Date.now()}`,
      type: 'asset',
      assetDef: pendingAssetDef,
      lat: latLng.lat(),
      lng: latLng.lng(),
      widthM: pendingAssetDef.defaultWidth || 4,
      lengthM: pendingAssetDef.defaultLength || pendingAssetDef.defaultWidth || 4,
      rotationDeg: 0,
      label: pendingAssetDef.name,
      status: 'planned',
      notes: '',
    })

    if (!placedAsset) return true

    onAssetDrop(placedAsset)
    onPendingAssetClear?.()
    return true
  }, [buildAssetPlacement, drawMode, layers.assets, onAssetDrop, onPendingAssetClear, pendingAssetDef])

  const placePendingZoneTemplateAtLatLng = useCallback((latLng) => {
    if (!latLng || !window.google) return false
    if (drawMode !== 'select' || !pendingZoneTemplate || layers.zones?.locked || layers.zones?.visible === false) return false

    const placedZone = instantiateZoneFromTemplate(
      pendingZoneTemplate,
      { lat: latLng.lat(), lng: latLng.lng() },
      window.google
    )

    if (!placedZone) {
      window.alert('Could not place this saved area.')
      onPendingZoneTemplateClear?.()
      return true
    }

    const isInsideExistingZone = placedZone.path.some(point => getDeepestParentZone(point, zones, window.google))
    if (isInsideExistingZone) {
      window.alert('Saved areas cannot be placed inside another zone.')
      return true
    }

    onZoneCreate(placedZone)
    onPendingZoneTemplateClear?.()
    return true
  }, [drawMode, layers.zones, onPendingZoneTemplateClear, onZoneCreate, pendingZoneTemplate, zones])

  const handleMapClick = useCallback((event) => {
    if (!event.latLng) return
    if (event?.domEvent?.detail > 1) return

    if (placePendingZoneTemplateAtLatLng(event.latLng)) return

    if ((drawMode === 'square' || drawMode === 'circle') && !layers.zones?.locked && window.google) {
      const point = { lat: event.latLng.lat(), lng: event.latLng.lng() }
      const currentDraft = shapeDraftRef.current

      if (!currentDraft?.center) {
        setShapeDraft({ type: drawMode, center: point, radiusM: 0 })
        setLineMeasurement(0)
        return
      }

      const originLatLng = new window.google.maps.LatLng(currentDraft.center.lat, currentDraft.center.lng)
      const targetLatLng = new window.google.maps.LatLng(point.lat, point.lng)
      const radiusM = window.google.maps.geometry.spherical.computeDistanceBetween(originLatLng, targetLatLng)

      let path = []
      if (drawMode === 'square') {
        path = buildSquarePath(currentDraft.center, radiusM, window.google)
      } else {
        path = buildCirclePath(currentDraft.center, radiusM, window.google, 72)
      }

      if (path.length >= 3) {
        const zoneType = selectedZoneType || { id: 'generic', name: 'Zone', color: '#3d8ef8', fillOpacity: 0.2, layoutType: 'free' }
        const defaultSubType = zoneType?.defaultSubTypeId
          ? zoneType.subTypes?.find(subType => subType.id === zoneType.defaultSubTypeId) || null
          : null
        const metrics = drawMode === 'circle'
          ? { areaM2: Math.PI * radiusM * radiusM, perimeterM: 2 * Math.PI * radiusM }
          : computePolygonMetrics(path, window.google)

        onZoneCreate({
          id: `zone_${Date.now()}`,
          type: 'zone',
          shapeType: drawMode,
          // center: drawMode === 'circle' ? currentDraft.center : undefined,
          center: currentDraft.center,
          radiusM: drawMode === 'circle' ? radiusM : undefined,
          zoneType,
          layoutType: 'free',
          showGrid: false,
          gridSize: 3,
          gridRotation: 0,
          subType: defaultSubType,
          parentId: null,
          path,
          areaM2: metrics.areaM2,
          perimeterM: metrics.perimeterM,
          capacity: null,
          label: zoneType?.name || 'Zone',
          allowedAssetTypes: zoneType?.allowedAssetTypes || [],
          contentLocked: !!zoneType?.allowedAssetTypes?.length,
          status: 'planned',
          notes: '',
          widthM: drawMode === 'square' ? Number((radiusM * Math.SQRT2).toFixed(2)) : undefined,
          lengthM: drawMode === 'square' ? Number((radiusM * Math.SQRT2).toFixed(2)) : undefined,
        })
      }

      setShapeDraft(null)
      setLineMeasurement(null)
      onDrawMode?.('select')
      return
    }

    if (placingFloor && floorPlan?.imageUrl) {
      const point = { lat: event.latLng.lat(), lng: event.latLng.lng() }

      if (tempFloorPoints.length === 0) {
        setTempFloorPoints([point])
        return
      }

      const firstPoint = tempFloorPoints[0]
      const nextBounds = {
        north: Math.max(firstPoint.lat, point.lat),
        south: Math.min(firstPoint.lat, point.lat),
        east: Math.max(firstPoint.lng, point.lng),
        west: Math.min(firstPoint.lng, point.lng),
      }
      const nextFloorPlan = normalizeFloorPlanState({
        ...floorPlan,
        bounds: nextBounds,
      })
      onFloorPlanChange(nextFloorPlan)
      setTempFloorPoints([])
      onFloorPlacementChange(false)
      onSelect({ id: 'floor-plan', type: 'floor', ...nextFloorPlan })
      return
    }

    if (drawMode === 'select' && floorPlan?.bounds && event.domEvent && mapRef.current) {
      const rect = mapRef.current.getDiv().getBoundingClientRect()
      const clickPoint = {
        x: event.domEvent.clientX - rect.left,
        y: event.domEvent.clientY - rect.top,
      }
      if (isPointInsideFloorOverlay(mapRef.current, floorPlan, clickPoint)) {
        onSelect({ id: 'floor-plan', type: 'floor', ...floorPlan })
        return
      }
    }

    if (placePendingAssetAtLatLng(event.latLng)) {
      return
    }

    if ((drawMode === 'line' || drawMode === 'route') && layers.lines?.visible !== false && !layers.lines?.locked && window.google) {
      const point = { lat: event.latLng.lat(), lng: event.latLng.lng() }
      const activeLineDraft = lineDraftRef.current

      if (!activeLineDraft?.points?.length) {
        setLineDraft({ points: [point], hoverPoint: null })
        setLineMeasurement(0)
        return
      }

      const nextPoints = [...activeLineDraft.points, point]
      setLineDraft({ points: nextPoints, hoverPoint: null })
      setLineMeasurement(computeLineLength(nextPoints, window.google))
      return
    }

    if (drawMode === 'polygon' && !layers.zones?.locked && window.google) {
      const point = { lat: event.latLng.lat(), lng: event.latLng.lng() }
      const activePolygonDraft = polygonDraftRef.current

      if (!activePolygonDraft?.points?.length) {
        setPolygonDraft({ points: [point], hoverPoint: null })
        setLineMeasurement(0)
        return
      }

      const nextPoints = [...activePolygonDraft.points, point]
      setPolygonDraft({ points: nextPoints, hoverPoint: null })
      setLineMeasurement(computeLineLength(nextPoints, window.google))
      return
    }

    if (drawMode === 'measure' && window.google) {
      const point = { lat: event.latLng.lat(), lng: event.latLng.lng() }
      const currentMeasure = measurePointsRef.current
      const nextPoints = [...currentMeasure, point]
      setMeasurePoints(nextPoints)
      setMeasureHover(null)
      setLineMeasurement(computeLineLength(nextPoints, window.google))
      return
    }

    if (drawMode === 'text' && !layers.annotations?.locked && layers.annotations?.visible) {
      const trimmedText = String(annotationDraftText || '').trim() || 'New annotation'

      onAnnotationCreate(buildAnnotationPlacement({
        id: `annotation_${Date.now()}`,
        type: 'annotation',
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
        text: trimmedText,
        label: trimmedText,
        pinColor: textStyle?.pinColor || '#ea4335',
        color: textStyle?.color || '#111827',
        backgroundColor: textStyle?.backgroundColor || '#fff7d6',
        fontSize: textStyle?.fontSize || 14,
        fontWeight: textStyle?.fontWeight || 700,
        borderColor: textStyle?.borderColor || '#334155',
        borderWidth: textStyle?.borderWidth || 1,
        borderRadius: textStyle?.borderRadius || 12,
        status: 'planned',
        notes: '',
      }))
      return
    }

    if (drawMode === 'select') {
      onClearSelection?.()
    }
  }, [annotationDraftText, buildAnnotationPlacement, drawMode, floorPlan, layers.annotations, layers.lines, layers.zones, onAnnotationCreate, onClearSelection, onFloorPlacementChange, onFloorPlanChange, onSelect, placePendingAssetAtLatLng, placePendingZoneTemplateAtLatLng, placingFloor, tempFloorPoints, textStyle])

  const handleMapDoubleClick = useCallback((event) => {
    if (drawMode === 'select') {
      event?.domEvent?.preventDefault?.()
      event?.domEvent?.stopPropagation?.()
      onClearSelection?.()
      return
    }

    if (drawMode === 'measure') {
      event?.domEvent?.preventDefault?.()
      event?.domEvent?.stopPropagation?.()
      setMeasurePoints([])
      setMeasureHover(null)
      setLineMeasurement(null)
      return
    }
    if ((drawMode === 'line' || drawMode === 'route') && (layers.lines?.visible === false || layers.lines?.locked)) {
      setLineDraft(null)
      setLineMeasurement(null)
      return
    }
    if ((drawMode !== 'line' && drawMode !== 'route' && drawMode !== 'polygon') || !window.google) return
    event?.domEvent?.preventDefault?.()
    event?.domEvent?.stopPropagation?.()

    if (drawMode === 'line' || drawMode === 'route') {
      const activeLineDraft = lineDraftRef.current
      if (!activeLineDraft?.points?.length) {
        setLineDraft(null)
        setLineMeasurement(null)
        return
      }

      // Use the already-committed points only (ignore the hover preview point)
      const finalPath = activeLineDraft.points

      if (finalPath.length < 2) {
        setLineDraft(null)
        setLineMeasurement(null)
        return
      }

      onLineCreate({
        id: `line_${Date.now()}`,
        type: 'line',
        path: finalPath,
        lengthM: computeLineLength(finalPath, window.google),
        label: drawMode === 'route' ? (lineStyle?.label || 'Route') : (lineStyle?.label || 'Line'),
        routeType: drawMode === 'route' ? (lineStyle?.routeType || 'pedestrian') : null,
        color: lineStyle?.color || '#f59e0b',
        strokeWeight: lineStyle?.weight || 4,
        pattern: lineStyle?.pattern || 'dashed',
        status: 'planned',
        notes: '',
      })

      setLineDraft(null)
      setLineMeasurement(null)
      return
    }

    const activePolygonDraft = polygonDraftRef.current
    if (!activePolygonDraft?.points?.length) {
      setPolygonDraft(null)
      setLineMeasurement(null)
      return
    }

    const dblPoint = event?.latLng ? { lat: event.latLng.lat(), lng: event.latLng.lng() } : null
    const currentTail = activePolygonDraft.points[activePolygonDraft.points.length - 1]
    const finalPath = dblPoint && (!currentTail || currentTail.lat !== dblPoint.lat || currentTail.lng !== dblPoint.lng)
      ? [...activePolygonDraft.points, dblPoint]
      : activePolygonDraft.points

    if (finalPath.length < 3) {
      setPolygonDraft(null)
      setLineMeasurement(null)
      return
    }

    finalizePolygon(finalPath)
    setPolygonDraft(null)
    setLineMeasurement(null)
  }, [drawMode, finalizePolygon, layers.lines, lineStyle, onClearSelection, onLineCreate])

  const handleMapRightClick = useCallback((event) => {
    if (drawMode === 'line' || drawMode === 'route') {
      if (layers.lines?.visible === false || layers.lines?.locked) {
        setLineDraft(null)
        setLineMeasurement(null)
        return
      }
      const activeLineDraft = lineDraftRef.current
      if (!activeLineDraft?.points?.length) return
      event?.domEvent?.preventDefault?.()
      const nextPoints = activeLineDraft.points.slice(0, -1)
      if (!nextPoints.length) {
        setLineDraft(null)
        setLineMeasurement(null)
        return
      }
      setLineDraft(prev => prev ? { ...prev, points: nextPoints } : prev)
      setLineMeasurement(computeLineLength(nextPoints, window.google))
      return
    }

    if (drawMode === 'polygon') {
      const activePolygonDraft = polygonDraftRef.current
      if (!activePolygonDraft?.points?.length) return
      event?.domEvent?.preventDefault?.()
      const nextPoints = activePolygonDraft.points.slice(0, -1)
      if (!nextPoints.length) {
        setPolygonDraft(null)
        setLineMeasurement(null)
        return
      }
      setPolygonDraft(prev => prev ? { ...prev, points: nextPoints } : prev)
      setLineMeasurement(computeLineLength(nextPoints, window.google))
      return
    }

    if (drawMode === 'measure') {
      const currentMeasure = measurePointsRef.current
      if (!currentMeasure.length) return
      event?.domEvent?.preventDefault?.()
      const nextPoints = currentMeasure.slice(0, -1)
      if (!nextPoints.length) {
        setMeasurePoints([])
        setMeasureHover(null)
        setLineMeasurement(null)
        return
      }
      setMeasurePoints(nextPoints)
      setLineMeasurement(computeLineLength(nextPoints, window.google))
    }
  }, [drawMode, layers.lines])

  useEffect(() => {
    if (!placingFloor) setTempFloorPoints([])
  }, [placingFloor])

  const handleStartInteraction = useCallback((event, object, type, resizeHandle = null) => {
    event.preventDefault()
    event.stopPropagation()

    const map = mapRef.current
    if (!map) return

    if (object.type === 'floor' || object.id === 'floor-plan') {
      if (layers.floor?.locked || !object.bounds) return
      const floorGeometry = getFloorGeometry(map, object)
      const rect = map.getDiv().getBoundingClientRect()
      if (!floorGeometry) return

      const clickLatLng = clientPointToLatLng(map, event.clientX, event.clientY)
      const latOffset = clickLatLng ? clickLatLng.lat() - floorGeometry.centerLat : 0
      const lngOffset = clickLatLng ? clickLatLng.lng() - floorGeometry.centerLng : 0

      interactionRef.current = {
        objectType: 'floor',
        type,
        startX: event.clientX,
        startY: event.clientY,
        center: { x: rect.left + floorGeometry.centerPoint.x, y: rect.top + floorGeometry.centerPoint.y },
        startCenter: { lat: floorGeometry.centerLat, lng: floorGeometry.centerLng },
        latOffset,
        lngOffset,
        startWidthPx: floorGeometry.widthPx,
        startHeightPx: floorGeometry.heightPx,
        startWidthM: floorGeometry.widthM,
        startHeightM: floorGeometry.heightM,
        metersPerPixel: floorGeometry.metersPerPixel,
        startRotation: object.rotation || 0,
        resizeHandle,
        startPointerAngle: Math.atan2(
          event.clientY - (rect.top + floorGeometry.centerPoint.y),
          event.clientX - (rect.left + floorGeometry.centerPoint.x)
        ) * 180 / Math.PI,
      }

      document.body.style.userSelect = 'none'
      onSelect({ id: 'floor-plan', type: 'floor', ...object })
      return
    }

    if (object.type === 'zone' && type === 'rotate') {
      if (layers.zones?.locked || !Array.isArray(object.path) || object.path.length < 3) return
      interactionRef.current = {
        objectType: 'zone',
        type,
        object,
        startX: event.clientX,
        startY: event.clientY,
        startPath: object.path.map((point) => ({ lat: Number(point.lat || 0), lng: Number(point.lng || 0) })),
        startRotation: Number.isFinite(object.rotation) ? object.rotation : 0,
      }
      document.body.style.userSelect = 'none'
      onSelect(object)
      return
    }

    if (object.type === 'zone' && type === 'resize') {
      if (layers.zones?.locked || object.shapeType !== 'square') return
      const rect = map.getDiv().getBoundingClientRect()
      const center = getPathCenter(object.path)
      const centerPoint = center ? latLngToContainerPoint(map, center.lat, center.lng) : null
      const zoneSize = getRectangleZoneDimensions(object, window.google)
      const widthM = Number(zoneSize.widthM)
      const lengthM = Number(zoneSize.lengthM)
      const scale = center ? metersPerPixel(center.lat, map.getZoom()) : null
      if (!center || !centerPoint || !Number.isFinite(widthM) || !Number.isFinite(lengthM) || !Number.isFinite(scale)) return

      interactionRef.current = {
        objectType: 'zone',
        type,
        object,
        startX: event.clientX,
        startY: event.clientY,
        center: { x: rect.left + centerPoint.x, y: rect.top + centerPoint.y },
        startWidthPx: widthM / scale,
        startLengthPx: lengthM / scale,
        startRotation: Number.isFinite(object.rotation) ? object.rotation : 0,
        metersPerPixel: scale,
        resizeHandle,
      }
      document.body.style.userSelect = 'none'
      onSelect(object)
      return
    }

    if (object.type === 'annotation') {
      if (layers.annotations?.locked) return

      const clickLatLng = clientPointToLatLng(map, event.clientX, event.clientY)
      const latOffset = clickLatLng ? clickLatLng.lat() - object.lat : 0
      const lngOffset = clickLatLng ? clickLatLng.lng() - object.lng : 0

      interactionRef.current = {
        objectType: 'annotation',
        type,
        object,
        latOffset,
        lngOffset,
      }
      document.body.style.userSelect = 'none'
      onSelect(object)
      return
    }

    if (layers.assets?.locked) return

    const rect = map.getDiv().getBoundingClientRect()
    const center = latLngToContainerPoint(map, object.lat, object.lng)
    const { widthPx, lengthPx, metersPerPixel: scale } = getAssetSize(object, map.getZoom())
    const clickLatLng = clientPointToLatLng(map, event.clientX, event.clientY)
    if (!center) return

    const centerClient = { x: rect.left + center.x, y: rect.top + center.y }
    interactionRef.current = {
      objectType: 'asset',
      type,
      object,
      startX: event.clientX,
      startY: event.clientY,
      center: centerClient,
      startWidthPx: widthPx,
      startLengthPx: lengthPx,
      startRotationDeg: object.rotationDeg || 0,
      resizeHandle,
      latOffset: clickLatLng ? clickLatLng.lat() - object.lat : 0,
      lngOffset: clickLatLng ? clickLatLng.lng() - object.lng : 0,
      startPointerAngle: Math.atan2(event.clientY - centerClient.y, event.clientX - centerClient.x) * 180 / Math.PI,
      metersPerPixel: scale,
    }

    document.body.style.userSelect = 'none'
    onSelect(object)
  }, [layers.annotations, layers.assets, layers.floor, onSelect])

  const mapOptions = useMemo(() => ({
    clickableIcons: false,
    isFractionalZoomEnabled: true,
    keyboardShortcuts: true,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: window.google?.maps?.MapTypeControlStyle?.HORIZONTAL_BAR,
      position: window.google?.maps?.ControlPosition?.TOP_RIGHT,
      mapTypeIds: ['roadmap', 'terrain', 'hybrid', 'satellite'],
    },
    streetViewControl: false,
    fullscreenControl: false,
    rotateControl: true,
    zoomControl: true,
    zoomControlOptions: {
      position: window.google?.maps?.ControlPosition?.RIGHT_BOTTOM,
    },
    scaleControl: false,
    draggable: true,
    minZoom: isViewOnly && Number.isFinite(viewOnlyMinZoom) ? viewOnlyMinZoom : undefined,
    maxZoom: isViewOnly && Number.isFinite(viewOnlyMaxZoom) ? Math.max(viewOnlyMinZoom ?? 0, viewOnlyMaxZoom) : undefined,
    restriction: isViewOnly && viewOnlyRestrictionBounds
      ? { latLngBounds: viewOnlyRestrictionBounds, strictBounds: false }
      : undefined,
    disableDoubleClickZoom: isViewOnly ? false : drawMode === 'line' || drawMode === 'route' || drawMode === 'polygon' || drawMode === 'measure',
    gestureHandling: 'greedy',
    draggableCursor: isViewOnly
      ? 'grab'
      : drawMode === 'polygon' || drawMode === 'line' || drawMode === 'route' || drawMode === 'text' || drawMode === 'measure' || placingFloor || !!pendingAssetDef ? 'crosshair' : 'grab',
    draggingCursor: isViewOnly
      ? 'grabbing'
      : drawMode === 'polygon' || drawMode === 'line' || drawMode === 'route' || drawMode === 'text' || drawMode === 'measure' || placingFloor || !!pendingAssetDef ? 'crosshair' : 'grabbing',
  }), [drawMode, isViewOnly, pendingAssetDef, placingFloor, viewOnlyMaxZoom, viewOnlyMinZoom, viewOnlyRestrictionBounds])

  if (!apiKey) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', flexDirection: 'column', gap: '16px', color: 'var(--text-dim)' }}>
        <div style={{ fontSize: '40px' }}>Map</div>
        <div style={{ fontSize: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Add your Google Maps API key to the Vite environment
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)', maxWidth: '360px', textAlign: 'center', lineHeight: 1.7 }}>
          Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in your <code>.env</code> or <code>.env.local</code> file.
          You need a Google Maps JavaScript API key with the Maps, Drawing, Geometry, and Places libraries enabled.
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
        Error loading Google Maps. Check <code>VITE_GOOGLE_MAPS_API_KEY</code>.
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
        Loading map...
      </div>
    )
  }

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }} onDrop={handleDrop} onDragOver={handleDragOver}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={defaultCenter}
        zoom={defaultZoom}
        onLoad={onLoad}
        onClick={handleMapClick}
        onDblClick={handleMapDoubleClick}
        onRightClick={handleMapRightClick}
        onMouseMove={handleMapMouseMove}
        /* zoom updates are handled via bounds_changed RAF listener in onLoad */
        options={mapOptions}
      >
        {eventDetails?.resolvedLocation?.center && (
          <MarkerF
            position={eventDetails.resolvedLocation.center}
            title={eventDetails.resolvedLocation.formattedAddress || eventDetails.locationQuery || 'Selected location'}
            zIndex={450}
            options={{
              clickable: false,
              optimized: true,
            }}
          />
        )}

        {layers.floor?.visible && floorPlan?.bounds && (
          <FloorPlanOverlay
            floorPlan={floorPlan}
            selected={floorSelected}
            locked={!!layers.floor?.locked}
            onSelect={onSelect}
            onStartInteraction={handleStartInteraction}
            map={mapRef.current}
            zoom={mapZoom}
          />
        )}

        {layers.zones?.visible && zones.map(zone => {
          // Skip rendering zone if it or any parent zone is hidden
          if (isZoneOrParentHidden(zone)) return null

          const derivedCircleCenter = zone.shapeType === 'circle'
            ? (zone.center || getPathCenter(zone.path))
            : null
          const derivedCircleRadius = zone.shapeType === 'circle'
            ? (
              Number(zone.radiusM)
              || (
                derivedCircleCenter
                  && Array.isArray(zone.path)
                  && zone.path.length > 0
                  && window.google?.maps?.geometry?.spherical
                  ? window.google.maps.geometry.spherical.computeDistanceBetween(
                    new window.google.maps.LatLng(derivedCircleCenter.lat, derivedCircleCenter.lng),
                    new window.google.maps.LatLng(zone.path[0].lat, zone.path[0].lng)
                  )
                  : null
              )
            )
            : null

          // Calculate zone center and on-screen size for label positioning
          const zoneCenter = (zone.shapeType === 'circle' && derivedCircleCenter) || zone.center
            ? (derivedCircleCenter || zone.center)
            : zone.path && zone.path.length > 0
              ? getPathCenter(zone.path)
              : null

          const zoneScreenPoints = mapRef.current && zone.path?.length
            ? zone.path
              .map(point => latLngToContainerPoint(mapRef.current, point.lat, point.lng))
              .filter(Boolean)
            : []

          const zoneLabelWidthPx = zoneScreenPoints.length
            ? Math.max(...zoneScreenPoints.map(point => point.x)) - Math.min(...zoneScreenPoints.map(point => point.x))
            : 0

          const zoneLabelHeightPx = zoneScreenPoints.length
            ? Math.max(...zoneScreenPoints.map(point => point.y)) - Math.min(...zoneScreenPoints.map(point => point.y))
            : 0

          const zoneDisplayName = getZoneDisplayName(zone)
          const currentLiveZoom = mapRef.current?.getZoom?.() || mapZoom || 15
          const zoneLabelMaxWidthPx = Math.min(180, Math.max(64, zoneLabelWidthPx - 14))
          const canShowZoneLabel = !!zoneCenter
            && !!zoneDisplayName
            && zoneLabelWidthPx >= 36
            && zoneLabelHeightPx >= 14
            && (currentLiveZoom >= 15 || selectedId === zone.id)

          return (
            <React.Fragment key={zone.id}>
              {zone.shapeType === 'circle' && derivedCircleCenter && derivedCircleRadius ? (
                <Circle
                  center={derivedCircleCenter}
                  radius={derivedCircleRadius}
                  options={{
                    fillColor: zone.fillColor || zone.zoneType?.color || '#3d8ef8',
                    fillOpacity: selectedId === zone.id
                      ? Math.min((zone.fillOpacity ?? zone.zoneType?.fillOpacity ?? 0.2) + 0.08, 1)
                      : (zone.fillOpacity ?? zone.zoneType?.fillOpacity ?? 0.2),
                    strokeColor: zone.strokeColor || zone.zoneType?.color || '#3d8ef8',
                    strokeWeight: selectedId === zone.id ? (zone.strokeWeight || 2) + 1 : (zone.strokeWeight || 2),
                    editable: selectedId === zone.id && !layers.zones?.locked,
                    draggable: selectedId === zone.id && !layers.zones?.locked,
                    clickable: drawMode === 'select' || drawMode === 'erase',
                    zIndex: selectedId === zone.id ? 1 : 0,
                  }}
                  onClick={(event) => {
                    if (placePendingZoneTemplateAtLatLng(event?.latLng)) return
                    if (placePendingAssetAtLatLng(event?.latLng)) return
                    if (drawMode === 'erase') {
                      onEraseAsset(zone, 'zone')
                      return
                    }
                    if (drawMode !== 'select') return
                    onSelect(zone)
                  }}
                  onMouseOver={() => {
                    if (drawMode !== 'select') return
                    setHoveredItem({
                      type: 'zone',
                      data: zone,
                    })
                  }}
                  onMouseOut={() => setHoveredItem(null)}
                  onMouseUp={() => handleCircleZoneChange(zone)}
                  onLoad={(circle) => {
                    const previousCircle = zoneCircleRefs.current[zone.id]
                    if (previousCircle && previousCircle !== circle) {
                      previousCircle.setMap?.(null)
                    }
                    zoneCircleRefs.current[zone.id] = circle
                  }}
                  onUnmount={(circle) => {
                    circle?.setMap?.(null)
                    delete zoneCircleRefs.current[zone.id]
                    delete lastCircleSnapshotRef.current[zone.id]
                  }}
                />
              ) : (
                <Polygon
                  paths={zone.path}
                  options={{
                    fillColor: zone.fillColor || zone.zoneType?.color || '#3d8ef8',
                    fillOpacity: selectedId === zone.id
                      ? Math.min((zone.fillOpacity ?? zone.zoneType?.fillOpacity ?? 0.2) + 0.08, 1)
                      : (zone.fillOpacity ?? zone.zoneType?.fillOpacity ?? 0.2),
                    strokeColor: zone.strokeColor || zone.zoneType?.color || '#3d8ef8',
                    strokeWeight: selectedId === zone.id ? (zone.strokeWeight || 2) + 1 : (zone.strokeWeight || 2),
                    editable: selectedId === zone.id && !layers.zones?.locked,
                    draggable: selectedId === zone.id && !layers.zones?.locked,
                    clickable: drawMode === 'select' || drawMode === 'erase',
                    zIndex: selectedId === zone.id ? 1 : 0,
                  }}
                  onClick={(event) => {
                    if (placePendingZoneTemplateAtLatLng(event?.latLng)) return
                    if (placePendingAssetAtLatLng(event?.latLng)) return
                    if (drawMode === 'erase') {
                      onEraseAsset(zone, 'zone')
                      return
                    }
                    if (drawMode !== 'select') return
                    onSelect(zone)
                  }}
                  onMouseOver={() => {
                    if (drawMode !== 'select') return
                    setHoveredItem({
                      type: 'zone',
                      data: zone,
                    })
                  }}
                  onMouseOut={() => setHoveredItem(null)}
                  onMouseUp={() => handleZonePathChange(zone)}
                  onDragEnd={() => handleZonePathChange(zone)}
                  onLoad={(polygon) => {
                    zoneOverlayRefs.current[zone.id] = polygon
                    if (selectedId === zone.id && !layers.zones?.locked) {
                      const path = polygon.getPath()
                      path.addListener('set_at', () => handleZonePathChange(zone))
                      path.addListener('insert_at', () => handleZonePathChange(zone))
                      path.addListener('remove_at', () => handleZonePathChange(zone))
                    }
                  }}
                  onUnmount={() => {
                    delete zoneOverlayRefs.current[zone.id]
                  }}
                />
              )}
              {canShowZoneLabel && (
                <OverlayView
                  position={zoneCenter}
                  mapPaneName={OverlayView.FLOAT_PANE}
                  getPixelPositionOffset={() => ({ x: -Math.round(zoneLabelMaxWidthPx / 2), y: -12 })}
                >
                  <div
                    style={getZoneNameStyle(
                      zone.strokeColor || zone.zoneType?.color || '#3d8ef8',
                      zoneLabelMaxWidthPx,
                      mapZoom < 16
                    )}
                    title={zoneDisplayName}
                  >
                    {zoneDisplayName}
                  </div>
                </OverlayView>
              )}

            </React.Fragment>
          )
        })}

        {zoneGridOverlays.map(overlay => (
          <OverlayView
            key={overlay.id}
            position={overlay.position}
            mapPaneName={OverlayView.OVERLAY_LAYER}
            getPixelPositionOffset={() => ({ x: overlay.offsetX, y: overlay.offsetY })}
          >
            <div
              style={{
                width: `${overlay.width}px`,
                height: `${overlay.height}px`,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                clipPath: overlay.clipPath,
                WebkitClipPath: overlay.clipPath,
                overflow: 'hidden',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                }}
              >
                {(() => {
                  const bleed = Math.ceil(Math.max(overlay.width, overlay.height) * 0.75)
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${-bleed}px`,
                        top: `${-bleed}px`,
                        width: `${overlay.width + bleed * 2}px`,
                        height: `${overlay.height + bleed * 2}px`,
                        opacity: overlay.opacity,
                        backgroundImage: `linear-gradient(to right, ${overlay.color} 1px, transparent 1px), linear-gradient(to bottom, ${overlay.color} 1px, transparent 1px)`,
                        backgroundSize: `${overlay.cellPx}px ${overlay.cellPx}px`,
                        backgroundPosition: `${bleed + overlay.anchorX}px ${bleed + overlay.anchorY}px`,
                        transform: `rotate(${overlay.rotationDeg || 0}deg)`,
                        transformOrigin: `${bleed + overlay.anchorX}px ${bleed + overlay.anchorY}px`,
                        willChange: 'transform',
                      }}
                    />
                  )
                })()}
              </div>
            </div>
          </OverlayView>
        ))}

        {layers.lines?.visible && lines.map(line => {
          if (line.visible === false) return null

          const parentZone = line.parentId ? zones.find(zone => zone.id === line.parentId) : null
          if (parentZone && isZoneOrParentHidden(parentZone)) return null

          return (
            <React.Fragment key={line.id}>
              <Polyline
                path={line.path}
                options={{
                  strokeColor: line.color || '#f59e0b',
                  strokeWeight: line.strokeWeight || 4,
                  strokeOpacity: (line.pattern || 'dashed') === 'solid' ? 1 : 0,
                  clickable: drawMode === 'select' || drawMode === 'erase',
                  editable: selectedId === line.id && !layers.lines?.locked,
                  draggable: selectedId === line.id && !layers.lines?.locked,
                  icons: getLinePatternIcons(line.pattern || 'dashed', line.color || '#f59e0b'),
                  zIndex: selectedId === line.id ? 10 : 1,
                }}
                onClick={() => {
                  if (drawMode === 'erase') {
                    onEraseAsset(line.id, 'line')
                    return
                  }
                  if (drawMode !== 'select') return
                  onSelect(line)
                }}
                onMouseOver={(e) => {
                  if (drawMode !== 'select' && drawMode !== 'erase') return
                  setHoveredLine(line)
                  const rect = mapRef.current?.getDiv?.().getBoundingClientRect?.()
                  if (rect && e.domEvent) setHoverScreenPos({ x: e.domEvent.clientX - rect.left, y: e.domEvent.clientY - rect.top })
                }}
                onMouseMove={(e) => {
                  if (!hoveredLine) return
                  const rect = mapRef.current?.getDiv?.().getBoundingClientRect?.()
                  if (rect && e.domEvent) setHoverScreenPos({ x: e.domEvent.clientX - rect.left, y: e.domEvent.clientY - rect.top })
                }}
                onMouseOut={() => setHoveredLine(null)}
                onDragEnd={() => handleLineGeometryChange(line)}
                onLoad={(polyline) => {
                  const previousLine = lineOverlayRefs.current[line.id]
                  if (previousLine && previousLine !== polyline) {
                    previousLine.setMap?.(null)
                  }

                  lineOverlayRefs.current[line.id] = polyline
                  if (selectedId === line.id && !layers.lines?.locked) {
                    const path = polyline.getPath()
                    const sync = () => handleLineGeometryChange(line)
                    path.addListener('set_at', sync)
                    path.addListener('insert_at', sync)
                    path.addListener('remove_at', sync)
                  }
                }}
                onUnmount={(polyline) => {
                  polyline?.setMap?.(null)
                  delete lineOverlayRefs.current[line.id]
                  delete lastLineSnapshotRef.current[line.id]
                }}
              />
            </React.Fragment>
          )
        })}

        {layers.lines?.visible !== false && lineDraft?.points?.length > 0 && (
          <>
            <Polyline
              path={lineDraft.hoverPoint ? [...lineDraft.points, lineDraft.hoverPoint] : lineDraft.points}
              options={{
                strokeColor: lineStyle?.color || '#38bdf8',
                strokeWeight: lineStyle?.weight || 4,
                clickable: false,
                strokeOpacity: (lineStyle?.pattern || 'dashed') === 'solid' ? 0.9 : 0,
                icons: getLinePatternIcons(lineStyle?.pattern || 'dashed', lineStyle?.color || '#38bdf8'),
              }}
            />
            {lineDraft.points.map((point, index) => {
              const segDist = index === 0 ? null : window.google.maps.geometry.spherical.computeDistanceBetween(
                new window.google.maps.LatLng(lineDraft.points[index - 1].lat, lineDraft.points[index - 1].lng),
                new window.google.maps.LatLng(point.lat, point.lng)
              )
              const showLabel = segDist !== null && (lineDraft.points.length <= 6 || index % 2 === 0)
              return (
                <React.Fragment key={`line-draft-${index}`}>
                  <CircleDot
                    position={point}
                    scale={index === 0 ? 6 : 4}
                    fillColor={index === 0 ? (lineStyle?.color || '#38bdf8') : '#ffffff'}
                    strokeColor={lineStyle?.color || '#38bdf8'}
                    strokeWeight={2}
                  />
                  {showLabel && (
                    <OverlayView
                      position={point}
                      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                      getPixelPositionOffset={() => ({ x: 8, y: -26 })}
                    >
                      <div style={{
                        background: 'rgba(0,0,0,0.72)',
                        color: '#fff',
                        padding: '2px 7px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        border: `1px solid ${lineStyle?.color || '#38bdf8'}`,
                      }}>
                        {formatDistance(segDist, measurementUnit)}
                      </div>
                    </OverlayView>
                  )}
                </React.Fragment>
              )
            })}
          </>
        )}

        {polygonDraft?.points?.length > 0 && (
          <>
            <Polyline
              path={polygonDraft.hoverPoint ? [...polygonDraft.points, polygonDraft.hoverPoint] : polygonDraft.points}
              options={{
                strokeColor: selectedZoneType?.color || '#3d8ef8',
                strokeOpacity: 0.95,
                strokeWeight: 3,
                clickable: false,
              }}
            />
            {polygonDraft.points.length >= 3 && (
              <Polygon
                paths={polygonDraft.hoverPoint ? [...polygonDraft.points, polygonDraft.hoverPoint] : polygonDraft.points}
                options={{
                  fillColor: selectedZoneType?.color || '#3d8ef8',
                  fillOpacity: 0.16,
                  strokeOpacity: 0,
                  clickable: false,
                }}
              />
            )}
            {polygonDraft.points.map((point, index) => (
              <CircleDot
                key={`polygon-draft-${index}`}
                position={point}
                scale={5}
                fillColor="#ffffff"
                strokeColor={selectedZoneType?.color || '#3d8ef8'}
                strokeWeight={2}
              />
            ))}
            {lineMeasurement !== null && polygonDraft.points.length > 2 && (
              <OverlayView
                position={polygonDraft.points[polygonDraft.points.length - 1]}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div style={{
                  background: 'rgba(0,0,0,0.8)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  transform: 'translateY(-100%)',
                }}>
                  Perimeter: {formatDistance(lineMeasurement, measurementUnit)}
                </div>
              </OverlayView>
            )}
          </>
        )}

        {shapeDraft?.center && lineMeasurement !== null && window.google && (
          <>
            {shapeDraft.type === 'circle' ? (
              <Circle
                center={shapeDraft.center}
                radius={lineMeasurement}
                options={{
                  fillColor: 'rgba(60, 130, 240, 0.2)',
                  strokeColor: '#3d8ef8',
                  strokeOpacity: 0.7,
                  strokeWeight: 2,
                  clickable: false,
                }}
              />
            ) : (
              <Polygon
                key="shape-draft"
                paths={buildSquarePath(shapeDraft.center, lineMeasurement, window.google)}
                options={{
                  fillColor: 'rgba(120, 210, 120, 0.2)',
                  strokeColor: '#22c55e',
                  strokeOpacity: 0.7,
                  strokeWeight: 2,
                  clickable: false,
                }}
              />
            )}
            <CircleDot
              position={shapeDraft.center}
              scale={6}
              fillColor="#ffffff"
              strokeColor="#000"
              strokeWeight={2}
            />
            <OverlayView
              position={shapeDraft.center}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            >
              <div style={{
                background: 'rgba(0,0,0,0.75)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                transform: 'translateY(-120%)',
              }}>
                {shapeDraft.type === 'circle' ? 'Radius' : 'Half-side'}: {formatDistance(lineMeasurement, measurementUnit)}
              </div>
            </OverlayView>
          </>
        )}

        {placingFloor && tempFloorPoints.length > 0 && (
          <>
            <CircleDot
              position={tempFloorPoints[0]}
              scale={6}
              fillColor="#ffffff"
              strokeColor="#38bdf8"
              strokeWeight={2}
            />
            {tempFloorPoints.length >= 2 && (
              <Polygon
                paths={getBoundsPreviewPath(tempFloorPoints)}
                options={{
                  fillColor: '#38bdf8',
                  fillOpacity: 0.12,
                  strokeColor: '#38bdf8',
                  strokeOpacity: 0.95,
                  strokeWeight: 2,
                  clickable: false,
                }}
              />
            )}
          </>
        )}

        {measurePoints.length > 0 && (
          <>
            <Polyline
              path={measureHover ? [...measurePoints, measureHover] : measurePoints}
              options={{
                strokeColor: '#ef4444',
                strokeWeight: 3,
                strokeOpacity: 0.9,
                clickable: false,
                icons: [{
                  icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeWeight: 3, strokeColor: '#ef4444', scale: 3 },
                  offset: '0',
                  repeat: '16px',
                }],
              }}
            />
            {measurePoints.map((point, index) => {
              const segDist = index === 0 ? null : window.google.maps.geometry.spherical.computeDistanceBetween(
                new window.google.maps.LatLng(measurePoints[index - 1].lat, measurePoints[index - 1].lng),
                new window.google.maps.LatLng(point.lat, point.lng)
              )
              return (
                <React.Fragment key={`measure-${index}`}>
                  <CircleDot
                    position={point}
                    scale={index === 0 ? 6 : 4}
                    fillColor={index === 0 ? '#ef4444' : '#ffffff'}
                    strokeColor="#ef4444"
                    strokeWeight={2}
                  />
                  {segDist !== null && (
                    <OverlayView
                      position={point}
                      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                      getPixelPositionOffset={() => ({ x: 8, y: -26 })}
                    >
                      <div style={{
                        background: 'rgba(0,0,0,0.78)',
                        color: '#fff',
                        padding: '2px 7px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        border: '1px solid #ef4444',
                      }}>
                        {formatDistance(segDist, measurementUnit)}
                      </div>
                    </OverlayView>
                  )}
                </React.Fragment>
              )
            })}
          </>
        )}

        <GridLayer
          map={mapRef.current}
          visible={layers.grid?.visible}
          size={layers.grid?.size || 3}
          opacity={layers.grid?.opacity}
          color={layers.grid?.color}
        />

        {visibleAssets.map(asset => {
          const baseGridSnap = Boolean(layers.grid?.visible && layers.grid?.snap)
          const baseGridSizeRaw = Number(layers.grid?.size || 3)
          const baseCenterLat = mapRef.current?.getCenter?.()?.lat?.() ?? asset.lat
          const baseGridSize = computeRenderedGridSpacing(baseGridSizeRaw, baseCenterLat, mapZoom, mapRef.current?.getBounds?.())
          const parentZone = getDeepestParentZone({ lat: asset.lat, lng: asset.lng }, zones, window.google)
          const zoneGridEnabled = Boolean(parentZone?.showGrid ?? ['grid', 'rows'].includes(parentZone?.layoutType))
          const zoneGridSnap = Boolean(parentZone?.snapToGrid && zoneGridEnabled)
          const zoneGridSizeRaw = Number(parentZone?.gridSize || parentZone?.rowSpacing || 3)
          const zoneAnchor = parentZone ? getZoneAnchor(parentZone) : null
          const zoneAnchorLat = zoneAnchor?.lat ?? asset.lat
          const zoneGridSize = computeVisibleGridSpacing(zoneGridSizeRaw, zoneAnchorLat, mapZoom)
          const resolvedGridZone = zoneGridSnap && parentZone
            ? {
              ...parentZone,
              gridSize: zoneGridSize,
              rowSpacing: zoneGridSize,
            }
            : null

          return (
            <AssetOverlay
              key={`${asset.id}-${asset.fillColor}-${asset.strokeColor}-${asset.strokeWeight}`}
              asset={asset}
              zoom={mapZoom}
              selected={selectedId === asset.id}
              locked={!!layers.assets?.locked}
              interactive={drawMode === 'select' || drawMode === 'erase'}
              drawMode={drawMode}
              onEraseAsset={onEraseAsset}
              onSelect={onSelect}
              onStartInteraction={handleStartInteraction}
              onHover={setHoveredItem}
              map={mapRef.current}
              onAssetUpdate={onAssetUpdate}
              gridSnap={baseGridSnap || zoneGridSnap}
              gridSize={baseGridSnap ? baseGridSize : zoneGridSize}
              gridZone={resolvedGridZone}
              gridReferenceLat={baseCenterLat}
              vertexSnapZone={parentZone?.shapeType === 'square' ? parentZone : null}
            />
          )
        })}

        {visibleAnnotations.map(annotation => (
          <AnnotationOverlay
            key={annotation.id}
            annotation={annotation}
            selected={false}
            locked={!!layers.annotations?.locked}
            interactive={drawMode === 'select' || drawMode === 'erase'}
            onSelect={onSelect}
            onStartInteraction={handleStartInteraction}
            onUpdate={onAssetUpdate}
            drawMode={drawMode}
            onEraseAsset={onEraseAsset}
            zoom={mapZoom}
            onHover={setHoveredItem}
          />
        ))}

        {layers.annotations?.visible && selectedAnnotation && (
          <AnnotationOverlay
            annotation={selectedAnnotation}
            selected
            locked={!!layers.annotations?.locked}
            interactive={drawMode === 'select' || drawMode === 'erase'}
            onSelect={onSelect}
            onStartInteraction={handleStartInteraction}
            onUpdate={onAssetUpdate}
            drawMode={drawMode}
            onEraseAsset={onEraseAsset}
            zoom={mapZoom}
            onHover={setHoveredItem}
          />
        )}

      </GoogleMap>

      <MeasurementOverlay
        screenPosition={cursorScreenPositionRef.current}
        text={
          (drawMode === 'measure' && measurePoints.length)
            ? `Total: ${formatDistance(lineMeasurement, measurementUnit)} | +${formatDistance(
              measureHover && measurePoints.length
                ? window.google?.maps?.geometry?.spherical?.computeDistanceBetween(
                  new window.google.maps.LatLng(measurePoints[measurePoints.length - 1].lat, measurePoints[measurePoints.length - 1].lng),
                  new window.google.maps.LatLng(measureHover.lat, measureHover.lng)
                ) : 0, measurementUnit
            )} | dbl-click clear | right-click undo`
            : ((drawMode === 'line' || drawMode === 'route') && lineDraft?.points?.length)
              ? `Total: ${formatDistance(lineMeasurement, measurementUnit)} | +${formatDistance(
                lineDraft.hoverPoint && lineDraft.points.length
                  ? window.google?.maps?.geometry?.spherical?.computeDistanceBetween(
                    new window.google.maps.LatLng(lineDraft.points[lineDraft.points.length - 1].lat, lineDraft.points[lineDraft.points.length - 1].lng),
                    new window.google.maps.LatLng(lineDraft.hoverPoint.lat, lineDraft.hoverPoint.lng)
                  ) : 0
              )} | dbl-click finish | right-click undo`
              : (drawMode === 'polygon' && polygonDraft?.points?.length)
                ? `Perimeter: ${formatDistance(lineMeasurement, measurementUnit)} | dbl-click finish | right-click undo`
                : null
        }
      />

      {hoveredLine && hoverScreenPos && drawMode === 'select' && (
        <div style={{
          position: 'absolute',
          left: `${hoverScreenPos.x + 14}px`,
          top: `${hoverScreenPos.y - 56}px`,
          background: 'rgba(255,255,255,0.97)',
          color: '#1a1a1a',
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: '10px',
          padding: '9px 11px',
          fontSize: '12px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 25,
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          lineHeight: 1.4,
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: hoveredLine.color || '#f59e0b' }}>
            {hoveredLine.label || 'Line'}
          </div>
          <div style={{ fontSize: '11px', color: '#666', lineHeight: 1.65 }}>
            <div><span style={{ fontWeight: 600, color: '#333' }}>Length:</span> {formatDistance(hoveredLine.lengthM, measurementUnit)}</div>
            <div><span style={{ fontWeight: 600, color: '#333' }}>Points:</span> {hoveredLine.path?.length}</div>
            <div><span style={{ fontWeight: 600, color: '#333' }}>Style:</span> {hoveredLine.pattern || 'Dashed'} · {hoveredLine.strokeWeight || 4}px</div>
          </div>
        </div>
      )}

      {pendingAssetDef && drawMode === 'select' && cursorScreenPositionRef.current && (
        <div
          style={{
            position: 'absolute',
            left: `${cursorScreenPositionRef.current.x + 14}px`,
            top: `${cursorScreenPositionRef.current.y + 14}px`,
            background: 'rgba(15,23,42,0.94)',
            color: '#ffffff',
            border: `1px solid ${pendingAssetDef.color || '#3d8ef8'}`,
            borderRadius: '12px',
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            pointerEvents: 'none',
            zIndex: 22,
            boxShadow: '0 12px 24px rgba(2,6,23,0.35)',
            whiteSpace: 'nowrap',
          }}
        >
          <AssetGlyph asset={pendingAssetDef} size={16} color={pendingAssetDef.iconColor || pendingAssetDef.color} />
          <span>Click map to place {pendingAssetDef.name}</span>
        </div>
      )}

      {pendingZoneTemplate && drawMode === 'select' && cursorScreenPositionRef.current && (
        <div
          style={{
            position: 'absolute',
            left: `${cursorScreenPositionRef.current.x + 14}px`,
            top: `${cursorScreenPositionRef.current.y + 14}px`,
            background: 'rgba(15,23,42,0.94)',
            color: '#ffffff',
            border: `1px solid ${pendingZoneTemplate.strokeColor || pendingZoneTemplate.fillColor || pendingZoneTemplate.zoneType?.color || '#3d8ef8'}`,
            borderRadius: '12px',
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            pointerEvents: 'none',
            zIndex: 22,
            boxShadow: '0 12px 24px rgba(2,6,23,0.35)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: pendingZoneTemplate.strokeColor || pendingZoneTemplate.fillColor || pendingZoneTemplate.zoneType?.color || '#3d8ef8' }} />
          <span>Click map to place {pendingZoneTemplate.name}</span>
        </div>
      )}

      {placingFloor && floorPlan?.imageUrl && (
        <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,15,20,0.9)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: '8px 16px', fontSize: '12px', color: 'var(--accent)', pointerEvents: 'none', backdropFilter: 'blur(8px)' }}>
          Click the top-left corner, then the bottom-right corner to place the floor plan
        </div>
      )}

      {/* Generic tooltip for hovered items */}
      {hoveredItem && hoveredTooltipPosition && drawMode === 'select' && (
        <div style={{
          position: 'absolute',
          left: `${hoveredTooltipPosition.x}px`,
          top: `${hoveredTooltipPosition.y}px`,
          transform: 'translate(-50%, -100%)',
          background: 'rgba(255,255,255,0.97)',
          color: '#1a1a1a',
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: '10px',
          padding: '9px 11px',
          fontSize: '12px',
          fontWeight: 500,
          pointerEvents: 'none',
          zIndex: 26,
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          lineHeight: 1.4,
          maxWidth: '260px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          {hoveredItem.type === 'asset' && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: hoveredItem.data.assetDef?.color || '#3d8ef8' }}>
                {hoveredItem.data.label || hoveredItem.data.assetDef?.name || 'Asset'}
              </div>
              <div style={{ fontSize: '11px', color: '#666', lineHeight: 1.65 }}>
                <div><span style={{ fontWeight: 600, color: '#333' }}>Type:</span> {hoveredItem.data.assetDef?.category || 'Asset'}</div>
                {hoveredItem.data.widthM && hoveredItem.data.lengthM && (
                  <div><span style={{ fontWeight: 600, color: '#333' }}>Size:</span> {hoveredItem.data.widthM}m × {hoveredItem.data.lengthM}m</div>
                )}
                {hoveredItem.data.rotationDeg !== undefined && (
                  <div><span style={{ fontWeight: 600, color: '#333' }}>Rotation:</span> {hoveredItem.data.rotationDeg}°</div>
                )}
                <div><span style={{ fontWeight: 600, color: '#333' }}>Status:</span> {hoveredItem.data.status || 'Planned'}</div>
                <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #e0e0e0', fontSize: '11px', color: '#999' }}>
                  {hoveredItem.data.lat?.toFixed(5)}, {hoveredItem.data.lng?.toFixed(5)}
                </div>
              </div>
            </>
          )}
          {hoveredItem.type === 'annotation' && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: hoveredItem.data.pinColor || '#2563eb' }}>
                {hoveredItem.data.label || hoveredItem.data.text || 'Drop Pin'}
              </div>
              <div style={{ fontSize: '11px', color: '#666', lineHeight: 1.65 }}>
                <div><span style={{ fontWeight: 600, color: '#333' }}>Type:</span> Drop point</div>
                <div><span style={{ fontWeight: 600, color: '#333' }}>Status:</span> {hoveredItem.data.status || 'Planned'}</div>
                {hoveredItem.data.text && hoveredItem.data.text !== hoveredItem.data.label && (
                  <div><span style={{ fontWeight: 600, color: '#333' }}>Label:</span> {hoveredItem.data.text}</div>
                )}
                {hoveredItem.data.notes && (
                  <div style={{ marginTop: '4px', wordBreak: 'break-word' }}><span style={{ fontWeight: 600, color: '#333' }}>Details:</span> {hoveredItem.data.notes}</div>
                )}
                <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #e0e0e0', fontSize: '11px', color: '#999' }}>
                  {hoveredItem.data.lat?.toFixed(5)}, {hoveredItem.data.lng?.toFixed(5)}
                </div>
              </div>
            </>
          )}
          {hoveredItem.type === 'line' && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: hoveredItem.data.color || '#f59e0b' }}>
                {hoveredItem.data.label || 'Line'}
              </div>
              <div style={{ fontSize: '11px', color: '#666', lineHeight: 1.65 }}>
                <div><span style={{ fontWeight: 600, color: '#333' }}>Length:</span> {formatDistance(hoveredItem.data.lengthM, measurementUnit)}</div>
                <div><span style={{ fontWeight: 600, color: '#333' }}>Points:</span> {hoveredItem.data.path?.length}</div>
                <div><span style={{ fontWeight: 600, color: '#333' }}>Style:</span> {hoveredItem.data.pattern || 'Dashed'} · {hoveredItem.data.strokeWeight || 4}px</div>
                <div><span style={{ fontWeight: 600, color: '#333' }}>Status:</span> {hoveredItem.data.status || 'Planned'}</div>
              </div>
            </>
          )}
          {hoveredItem.type === 'zone' && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: hoveredItem.data.zoneType?.color || '#3d8ef8' }}>
                {hoveredItem.data.label || 'Zone'}
              </div>
              <div style={{ fontSize: '11px', color: '#666', lineHeight: 1.65 }}>
                <div><span style={{ fontWeight: 600, color: '#333' }}>Type:</span> {hoveredItem.data.zoneType?.name || 'Zone'}</div>
                {hoveredItem.data.areaM2 && (
                  <div><span style={{ fontWeight: 600, color: '#333' }}>Area:</span> {formatArea(hoveredItem.data.areaM2, measurementUnit)}</div>
                )}
                {hoveredItem.data.perimeterM && (
                  <div><span style={{ fontWeight: 600, color: '#333' }}>Perimeter:</span> {formatDistance(hoveredItem.data.perimeterM, measurementUnit)}</div>
                )}
                <div><span style={{ fontWeight: 600, color: '#333' }}>Status:</span> {hoveredItem.data.status || 'Planned'}</div>
              </div>
            </>
          )}
          <div
            style={{
              position: 'absolute',
              bottom: '-6px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid rgba(255,255,255,0.97)',
            }}
          />
        </div>
      )}

    </div>
  )
}
