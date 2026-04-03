import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GoogleMap,
  useJsApiLoader,
  Polygon,
  Marker,
  OverlayView,
  Polyline,
} from '@react-google-maps/api'
import AssetGlyph from './AssetGlyph'
import { computeZoneCapacity, getAssetName, getZoneAllowedAssetTypes, isAssetAllowedInZone } from '../data/assets'
import { generateLayout } from '../utils/layouts'

const MAP_CENTER = { lat: 23.0225, lng: 72.5714 }
const LIBRARIES = ['drawing', 'geometry', 'places']
const MIN_ASSET_SIZE_M = 0.5
const MIN_ASSET_SIZE_PX = 28
const MIN_FLOOR_SIZE_PX = 80
const WHAT3WORDS_PATTERN = /^\s*([a-zA-Z]+\.[a-zA-Z]+\.[a-zA-Z]+)\s*$/

function computeArea(polygon, google) {
  try {
    const path = polygon.getPath()
    const areaM2 = google.maps.geometry.spherical.computeArea(path)
    let perimeterM = 0
    const coords = path.getArray()
    for (let i = 0; i < coords.length; i++) {
      const next = coords[(i + 1) % coords.length]
      perimeterM += google.maps.geometry.spherical.computeDistanceBetween(coords[i], next)
    }
    return { areaM2, perimeterM }
  } catch {
    return { areaM2: 0, perimeterM: 0 }
  }
}

function metersPerPixel(lat, zoom) {
  const clampedLat = Math.max(-85, Math.min(85, lat || 0))
  return 156543.03392 * Math.cos(clampedLat * Math.PI / 180) / Math.pow(2, zoom || 0)
}

function normalizeAngle(angle) {
  let normalized = angle % 360
  if (normalized < 0) normalized += 360
  return normalized
}

function shortestAngleDelta(fromAngle, toAngle) {
  let delta = toAngle - fromAngle
  while (delta > 180) delta -= 360
  while (delta < -180) delta += 360
  return delta
}

function projectScreenDelta(dx, dy, rotationDeg) {
  const radians = rotationDeg * Math.PI / 180
  return {
    localX: dx * Math.cos(radians) + dy * Math.sin(radians),
    localY: -dx * Math.sin(radians) + dy * Math.cos(radians),
  }
}

function getAssetSize(asset, zoom) {
  const widthM = asset.widthM ?? asset.assetDef?.defaultWidth ?? 4
  const lengthM = asset.lengthM ?? asset.assetDef?.defaultLength ?? widthM
  const scale = metersPerPixel(asset.lat, zoom)

  return {
    widthM,
    lengthM,
    widthPx: Math.max(MIN_ASSET_SIZE_PX, widthM / scale),
    lengthPx: Math.max(MIN_ASSET_SIZE_PX, lengthM / scale),
    metersPerPixel: scale,
  }
}

function latLngToContainerPoint(map, lat, lng) {
  const projection = map?.getProjection?.()
  const bounds = map?.getBounds?.()
  const googleApi = window.google

  if (!projection || !bounds || !googleApi) return null

  const scale = Math.pow(2, map.getZoom())
  const worldPoint = projection.fromLatLngToPoint(new googleApi.maps.LatLng(lat, lng))
  const topRight = projection.fromLatLngToPoint(bounds.getNorthEast())
  const bottomLeft = projection.fromLatLngToPoint(bounds.getSouthWest())

  return {
    x: (worldPoint.x - bottomLeft.x) * scale,
    y: (worldPoint.y - topRight.y) * scale,
  }
}

function clientPointToLatLng(map, clientX, clientY) {
  const projection = map?.getProjection?.()
  const bounds = map?.getBounds?.()
  const googleApi = window.google

  if (!projection || !bounds || !googleApi) return null

  const rect = map.getDiv().getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  const scale = Math.pow(2, map.getZoom())
  const topRight = projection.fromLatLngToPoint(bounds.getNorthEast())
  const bottomLeft = projection.fromLatLngToPoint(bounds.getSouthWest())
  const worldPoint = new googleApi.maps.Point(
    x / scale + bottomLeft.x,
    y / scale + topRight.y
  )

  return projection.fromPointToLatLng(worldPoint)
}

function isPointInsideFloorOverlay(map, floorPlan, clickPoint) {
  if (!map || !floorPlan?.bounds) return false
  const geometry = getFloorGeometry(map, floorPlan.bounds)
  if (!geometry) return false

  const localX = clickPoint.x - geometry.centerPoint.x
  const localY = clickPoint.y - geometry.centerPoint.y
  const radians = ((floorPlan.rotation || 0) * Math.PI) / 180
  const rotatedX = localX * Math.cos(-radians) - localY * Math.sin(-radians)
  const rotatedY = localX * Math.sin(-radians) + localY * Math.cos(-radians)

  return (
    Math.abs(rotatedX) <= geometry.widthPx / 2 &&
    Math.abs(rotatedY) <= geometry.heightPx / 2
  )
}

function formatDistance(meters) {
  if (!meters) return '0 m'
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${meters.toFixed(1)} m`
}

function computeLineLength(path, google) {
  if (!google || !path || path.length < 2) return 0
  let total = 0
  for (let i = 1; i < path.length; i++) {
    total += google.maps.geometry.spherical.computeDistanceBetween(
      new google.maps.LatLng(path[i - 1].lat, path[i - 1].lng),
      new google.maps.LatLng(path[i].lat, path[i].lng)
    )
  }
  return total
}

function computePolygonMetrics(path, google) {
  if (!google || !path || path.length < 2) return { areaM2: 0, perimeterM: 0 }
  const perimeterM = computeLineLength([...path, path[0]], google)
  const areaM2 = path.length >= 3 ? google.maps.geometry.spherical.computeArea(path) : 0
  return { areaM2, perimeterM }
}

function extractPathFromOverlay(overlay) {
  return overlay?.getPath?.()?.getArray?.()?.map(point => ({
    lat: point.lat(),
    lng: point.lng(),
  })) || []
}

function getContainingZones(point, zones, google) {
  if (!google || !point) return []
  const targetPoint = new google.maps.LatLng(point.lat, point.lng)

  return zones.filter(zone => {
    if (!zone?.path?.length || zone.path.length < 3) return false
    const polygon = new google.maps.Polygon({ paths: zone.path })

    return (
      google.maps.geometry.poly.containsLocation(targetPoint, polygon)
      || google.maps.geometry.poly.isLocationOnEdge(targetPoint, polygon, 1e-9)
    )
  })
}

function getDeepestParentZone(point, zones, google, excludedZoneId = null) {
  const matches = getContainingZones(point, zones.filter(zone => zone.id !== excludedZoneId), google)
  if (!matches.length) return null
  return matches.sort((a, b) => (a.areaM2 || Infinity) - (b.areaM2 || Infinity))[0]
}

function getBoundsPreviewPath(points) {
  if (!points?.length) return []
  const first = points[0]
  const second = points[1] || points[0]
  const north = Math.max(first.lat, second.lat)
  const south = Math.min(first.lat, second.lat)
  const east = Math.max(first.lng, second.lng)
  const west = Math.min(first.lng, second.lng)

  return [
    { lat: north, lng: west },
    { lat: north, lng: east },
    { lat: south, lng: east },
    { lat: south, lng: west },
  ]
}

function getLinePatternIcons(pattern, color) {
  if (pattern === 'dotted') {
    return [{
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 2.2,
        fillOpacity: 1,
        fillColor: color,
        strokeOpacity: 0,
      },
      offset: '0',
      repeat: '12px',
    }]
  }

  if (pattern === 'dashed') {
    return [{
      icon: {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        strokeColor: color,
        scale: 4,
      },
      offset: '0',
      repeat: '16px',
    }]
  }

  return undefined
}

function getFloorGeometry(map, bounds) {
  if (!map || !bounds) return null
  const centerLat = (bounds.north + bounds.south) / 2
  const centerLng = (bounds.east + bounds.west) / 2
  const centerPoint = latLngToContainerPoint(map, centerLat, centerLng)
  const northWest = latLngToContainerPoint(map, bounds.north, bounds.west)
  const southEast = latLngToContainerPoint(map, bounds.south, bounds.east)

  if (!centerPoint || !northWest || !southEast) return null

  return {
    centerLat,
    centerLng,
    centerPoint,
    widthPx: Math.abs(southEast.x - northWest.x),
    heightPx: Math.abs(southEast.y - northWest.y),
  }
}

function clientRectToBounds(map, centerClient, widthPx, heightPx) {
  const northWest = clientPointToLatLng(map, centerClient.x - widthPx / 2, centerClient.y - heightPx / 2)
  const southEast = clientPointToLatLng(map, centerClient.x + widthPx / 2, centerClient.y + heightPx / 2)
  if (!northWest || !southEast) return null

  return {
    north: northWest.lat(),
    west: northWest.lng(),
    south: southEast.lat(),
    east: southEast.lng(),
  }
}

function localDeltaToScreen(deltaX, deltaY, rotationDeg) {
  const radians = rotationDeg * Math.PI / 180
  return {
    x: deltaX * Math.cos(radians) - deltaY * Math.sin(radians),
    y: deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
  }
}

function buildViewportBounds(google, points) {
  if (!google || !points?.length) return null
  const bounds = new google.maps.LatLngBounds()
  points.forEach(point => bounds.extend(point))
  return bounds
}

function computeContentBounds(google, { zones, assets, lines, annotations, floorPlan }) {
  const bounds = new google.maps.LatLngBounds()
  let hasContent = false

  zones.forEach(zone => {
    zone.path?.forEach(point => {
      bounds.extend(point)
      hasContent = true
    })
  })

  assets.forEach(asset => {
    bounds.extend({ lat: asset.lat, lng: asset.lng })
    hasContent = true
  })

  lines.forEach(line => {
    line.path?.forEach(point => {
      bounds.extend(point)
      hasContent = true
    })
  })

  annotations.forEach(annotation => {
    bounds.extend({ lat: annotation.lat, lng: annotation.lng })
    hasContent = true
  })

  if (floorPlan?.bounds) {
    bounds.extend({ lat: floorPlan.bounds.north, lng: floorPlan.bounds.west })
    bounds.extend({ lat: floorPlan.bounds.south, lng: floorPlan.bounds.east })
    hasContent = true
  }

  return hasContent ? bounds : null
}

function buildCirclePath(center, radiusM, google, steps = 256) {
  if (!google || !center) return []
  const origin = new google.maps.LatLng(center.lat, center.lng)
  return Array.from({ length: steps }, (_, idx) => {
    const angle = (idx * 360) / steps
    const point = google.maps.geometry.spherical.computeOffset(origin, radiusM, angle)
    return { lat: point.lat(), lng: point.lng() }
  })
}

function buildSquarePath(center, halfSideM, google) {
  if (!google || !center) return []
  const origin = new google.maps.LatLng(center.lat, center.lng)
  // Create axis-aligned square corners at 45°, 135°, 225°, 315° (NE, NW, SW, SE)
  // Distance to corner is halfSideM * sqrt(2)
  const cornerDistance = halfSideM * Math.sqrt(2)
  const ne = google.maps.geometry.spherical.computeOffset(origin, cornerDistance, 45)
  const nw = google.maps.geometry.spherical.computeOffset(origin, cornerDistance, 135)
  const sw = google.maps.geometry.spherical.computeOffset(origin, cornerDistance, 225)
  const se = google.maps.geometry.spherical.computeOffset(origin, cornerDistance, 315)
  return [
    { lat: ne.lat(), lng: ne.lng() },
    { lat: nw.lat(), lng: nw.lng() },
    { lat: sw.lat(), lng: sw.lng() },
    { lat: se.lat(), lng: se.lng() },
  ]
}

function limitGridSlots(slots, maxPoints = 450) {
  if (!slots?.length || slots.length <= maxPoints) return slots || []
  const step = Math.ceil(slots.length / maxPoints)
  return slots.filter((_, index) => index % step === 0)
}

function AssetOverlay({ asset, zoom, selected, locked, interactive, onSelect, onStartInteraction, drawMode, onEraseAsset }) {
  const { widthPx, lengthPx } = getAssetSize(asset, zoom)
  const rotationDeg = asset.rotationDeg || 0
  const color = asset.assetDef?.color || '#3d8ef8'
  const resizeHandles = [
    { key: 'nw', left: '-7px', top: '-7px', cursor: 'nwse-resize', xSign: -1, ySign: -1 },
    { key: 'ne', right: '-7px', top: '-7px', cursor: 'nesw-resize', xSign: 1, ySign: -1 },
    { key: 'sw', left: '-7px', bottom: '-7px', cursor: 'nesw-resize', xSign: -1, ySign: 1 },
    { key: 'se', right: '-7px', bottom: '-7px', cursor: 'nwse-resize', xSign: 1, ySign: 1 },
  ]

  return (
    <OverlayView
      position={{ lat: asset.lat, lng: asset.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={() => ({
        x: -Math.round(widthPx / 2),
        y: -Math.round(lengthPx / 2),
      })}
    >
      <div style={{ width: `${widthPx}px`, height: `${lengthPx}px`, position: 'relative', pointerEvents: 'auto', zIndex: 12 }}>
        <div style={{ position: 'absolute', inset: 0, transform: `rotate(${rotationDeg}deg)`, transformOrigin: 'center center' }}>
          <button
              type="button"
              onMouseDown={(event) => {
                if (drawMode === 'select') onStartInteraction(event, asset, 'move')
              }}
              onClick={(event) => {
                if (!interactive) return
                event.stopPropagation()
                if (drawMode === 'erase') {
                  onEraseAsset?.(asset)
                  return
                }
                onSelect(asset)
              }}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                borderRadius: '16px',
                border: selected ? '2px solid #38bdf8' : `2px solid ${color}`,
                background: selected ? `${color}33` : `${color}22`,
                boxShadow: selected ? '0 0 0 1px rgba(255,255,255,0.8)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: !interactive || locked ? 'default' : 'move',
                pointerEvents: !interactive || locked ? 'none' : 'auto',
                padding: 0,
              }}
            >
              <div
                style={{
                  width: `${Math.min(widthPx, lengthPx) * 0.56}px`,
                  height: `${Math.min(widthPx, lengthPx) * 0.56}px`,
                  minWidth: '26px',
                  minHeight: '26px',
                  borderRadius: '999px',
                  background: '#ffffff',
                  border: `2px solid ${color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `${Math.max(16, Math.min(widthPx, lengthPx) * 0.28)}px`,
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
                }}
              >
                <AssetGlyph
                  asset={asset.assetDef}
                  size={Math.max(16, Math.min(widthPx, lengthPx) * 0.28)}
                  color={asset.assetDef?.iconColor || color}
                />
              </div>
            </button>

          {selected && interactive && !locked && (
            <>
              <div style={{ position: 'absolute', top: '-34px', left: '50%', width: '2px', height: '24px', background: '#111827', transform: 'translateX(-50%)' }} />
              <button
                type="button"
                onMouseDown={(event) => onStartInteraction(event, asset, 'rotate')}
                style={{
                  position: 'absolute',
                  top: '-52px',
                  left: '50%',
                  width: '26px',
                  height: '26px',
                  borderRadius: '999px',
                  border: '2px solid #38bdf8',
                  background: '#ffffff',
                  color: '#0f172a',
                  transform: 'translateX(-50%)',
                  fontSize: '14px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'grab',
                  padding: 0,
                }}
              >
                R
              </button>
              {resizeHandles.map((handle) => (
                <button
                  key={handle.key}
                  type="button"
                  onMouseDown={(event) => onStartInteraction(event, asset, 'resize', handle)}
                  style={{
                    position: 'absolute',
                    width: '14px',
                    height: '14px',
                    borderRadius: '3px',
                    border: '2px solid #38bdf8',
                    background: '#ffffff',
                    cursor: handle.cursor,
                    padding: 0,
                    ...handle,
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </OverlayView>
  )
}

function FloorPlanOverlay({ floorPlan, selected, locked, onSelect, onStartInteraction, map }) {
  const geometry = getFloorGeometry(map, floorPlan?.bounds)
  if (!geometry) return null

  const rotation = floorPlan.rotation || 0
  const resizeHandles = [
    { key: 'nw', left: '-8px', top: '-8px', cursor: 'nwse-resize', xSign: -1, ySign: -1 },
    { key: 'ne', right: '-8px', top: '-8px', cursor: 'nesw-resize', xSign: 1, ySign: -1 },
    { key: 'sw', left: '-8px', bottom: '-8px', cursor: 'nesw-resize', xSign: -1, ySign: 1 },
    { key: 'se', right: '-8px', bottom: '-8px', cursor: 'nwse-resize', xSign: 1, ySign: 1 },
  ]

  return (
    <>
      <OverlayView
        position={{ lat: geometry.centerLat, lng: geometry.centerLng }}
        mapPaneName={OverlayView.OVERLAY_LAYER}
        getPixelPositionOffset={() => ({
          x: -Math.round(geometry.widthPx / 2),
          y: -Math.round(geometry.heightPx / 2),
        })}
      >
        <div style={{ width: `${geometry.widthPx}px`, height: `${geometry.heightPx}px`, position: 'relative', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, transform: `rotate(${rotation}deg)`, transformOrigin: 'center center' }}>
            <img
              src={floorPlan.imageUrl}
              alt="Floor plan"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                display: 'block',
                opacity: floorPlan.opacity ?? 0.7,
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </OverlayView>

      {selected && (
        <OverlayView
          position={{ lat: geometry.centerLat, lng: geometry.centerLng }}
          mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          getPixelPositionOffset={() => ({
            x: -Math.round(geometry.widthPx / 2),
            y: -Math.round(geometry.heightPx / 2),
          })}
        >
          <div style={{ width: `${geometry.widthPx}px`, height: `${geometry.heightPx}px`, position: 'relative', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, transform: `rotate(${rotation}deg)`, transformOrigin: 'center center' }}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onSelect({ id: 'floor-plan', type: 'floor', ...floorPlan })
              }}
              onMouseDown={(event) => !locked && onStartInteraction(event, floorPlan, 'move')}
              style={{
                position: 'absolute',
                inset: 0,
                padding: 0,
                border: selected ? '2px solid #38bdf8' : '2px solid rgba(255,255,255,0.42)',
                background: 'transparent',
                cursor: locked ? 'default' : 'move',
                borderRadius: '14px',
                overflow: 'hidden',
                boxShadow: selected ? '0 0 0 1px rgba(255,255,255,0.92)' : 'none',
                pointerEvents: 'auto',
              }}
            >
              <img
                src={floorPlan.imageUrl}
                alt="Floor plan"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                  display: 'block',
                  opacity: 0,
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
            </button>

            {selected && !locked && (
              <>
                <div style={{ position: 'absolute', top: '-32px', left: '50%', width: '2px', height: '24px', background: '#111827', transform: 'translateX(-50%)', pointerEvents: 'auto' }} />
                <button
                  type="button"
                  onMouseDown={(event) => onStartInteraction(event, floorPlan, 'rotate')}
                  style={{
                    position: 'absolute',
                    top: '-50px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '26px',
                    height: '26px',
                    borderRadius: '999px',
                    border: '2px solid #38bdf8',
                    background: '#ffffff',
                    cursor: 'grab',
                    fontSize: '13px',
                    fontWeight: 700,
                    padding: 0,
                    pointerEvents: 'auto',
                  }}
                >
                  R
                </button>
                {resizeHandles.map((handle) => (
                  <button
                    key={handle.key}
                    type="button"
                    onMouseDown={(event) => onStartInteraction(event, floorPlan, 'resize', handle)}
                    style={{
                      position: 'absolute',
                      width: '16px',
                      height: '16px',
                      borderRadius: '4px',
                      border: '2px solid #38bdf8',
                      background: '#ffffff',
                      cursor: handle.cursor,
                      padding: 0,
                      pointerEvents: 'auto',
                      ...handle,
                    }}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </OverlayView>
      )}
    </>
  )
}

function AnnotationOverlay({ annotation, selected, locked, interactive, onSelect, onStartInteraction, zoom }) {
  const zoomScale = Math.max(0.9, Math.min(1.06, (zoom || 14) / 14))
  const fontSize = Math.max(11, Math.round((annotation.fontSize || 14) * zoomScale))
  const paddingY = Math.max(6, Math.round(8 * zoomScale))
  const paddingX = Math.max(8, Math.round(11 * zoomScale))
  const borderRadius = Math.max(8, Number(annotation.borderRadius ?? 10))
  const borderWidth = Math.max(1, Number(annotation.borderWidth ?? 1))
  const borderColor = annotation.borderColor || 'rgba(15,23,42,0.18)'
  const backgroundColor = annotation.backgroundColor || '#fff7d6'
  const textColor = annotation.color || '#111827'

  return (
    <OverlayView
      position={{ lat: annotation.lat, lng: annotation.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={() => ({ x: 0, y: -Math.round(14 * zoomScale) })}
    >
      <button
        type="button"
        onClick={(event) => {
          if (!interactive) return
          event.stopPropagation()
          onSelect(annotation)
        }}
        onMouseDown={(event) => interactive && !locked && onStartInteraction(event, annotation, 'move')}
        style={{
          minWidth: '90px',
          maxWidth: '260px',
          padding: `${paddingY}px ${paddingX}px`,
          borderRadius: `${borderRadius}px`,
          border: selected ? '2px solid #2563eb' : `${borderWidth}px solid ${borderColor}`,
          background: backgroundColor,
          color: textColor,
          fontSize: `${fontSize}px`,
          fontWeight: 700,
          lineHeight: 1.4,
          letterSpacing: '0.01em',
          textAlign: 'left',
          boxShadow: selected ? '0 0 0 2px rgba(37,99,235,0.15), 0 16px 30px rgba(15,23,42,0.22)' : '0 10px 22px rgba(15,23,42,0.17)',
          cursor: !interactive || locked ? 'default' : 'move',
          pointerEvents: interactive ? 'auto' : 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {annotation.text || 'New annotation'}
      </button>
    </OverlayView>
  )
}

function MeasurementOverlay({ screenPosition, text }) {
  if (!screenPosition || !text) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: `${screenPosition.x + 14}px`,
        top: `${screenPosition.y - 44}px`,
        background: '#fff7d6',
        color: '#111827',
        border: '2px solid #f59e0b',
        borderRadius: '10px',
        padding: '6px 10px',
        fontSize: '12px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      {text}
    </div>
  )
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
  onZoneCreate,
  onLineCreate,
  onAnnotationCreate,
  onAssetDrop,
  onAssetUpdate,
  pendingAssetDef,
  onPendingAssetClear,
  onFloorPlanChange,
  onFloorPlacementChange,
  eventDetails,
  onEventDetailsChange,
  mapViewMode = '2d',
  lineStyle,
  textStyle,
  annotationDraftText,
  onMapRef,
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
  const lineOverlayRefs = useRef({})
  const linePathChangeTimeoutRef = useRef({})
  const [mapZoom, setMapZoom] = useState(14)
  const [tempFloorPoints, setTempFloorPoints] = useState([])
  const [lineDraft, setLineDraft] = useState(null)
  const [polygonDraft, setPolygonDraft] = useState(null)
  const [shapeDraft, setShapeDraft] = useState(null)
  const [lineMeasurement, setLineMeasurement] = useState(null)
  const [segmentMeasurement, setSegmentMeasurement] = useState(null)
  const [cursorScreenPosition, setCursorScreenPosition] = useState(null)
  const [cursorLatLng, setCursorLatLng] = useState(null)
  const [hoveredLine, setHoveredLine] = useState(null)
  const [hoverScreenPos, setHoverScreenPos] = useState(null)

  useEffect(() => {
    lineDraftRef.current = lineDraft
  }, [lineDraft])

  useEffect(() => {
    polygonDraftRef.current = polygonDraft
  }, [polygonDraft])

  useEffect(() => {
    shapeDraftRef.current = shapeDraft
  }, [shapeDraft])

  // Cleanup debounce timeouts
  useEffect(() => {
    return () => {
      Object.values(linePathChangeTimeoutRef.current).forEach(timeout => clearTimeout(timeout))
    }
  }, [])

  const selectedAsset = useMemo(
    () => assets.find(asset => asset.id === selectedId) || null,
    [assets, selectedId]
  )
  const selectedAnnotation = useMemo(
    () => annotations.find(annotation => annotation.id === selectedId) || null,
    [annotations, selectedId]
  )
  const floorSelected = selectedId === 'floor-plan'
  const zoneGridPoints = useMemo(() => {
    if (!window.google || !layers.grid?.visible) return []
    return zones.flatMap(zone => {
      const rawSlots = generateLayout(zone, window.google)
      return limitGridSlots(rawSlots).map(slot => ({
        id: slot.id,
        lat: slot.lat,
        lng: slot.lng,
        color: zone.zoneType?.color || '#3d8ef8',
      }))
    })
  }, [layers.grid?.visible, zones])

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

  const onLoad = useCallback((map) => {
    mapRef.current = map
    setMapZoom(map.getZoom() || 14)
    if (mapViewMode === '2d') {
      map.setMapTypeId('satellite')
    }
    if (onMapRef) onMapRef(map)
  }, [mapViewMode, onMapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (mapViewMode === '3d') {
      map.setMapTypeId('hybrid')
      const currentZoom = map.getZoom() || 14
      if (currentZoom < 18) map.setZoom(18)
      // 45-degree tilt is only available at high zoom in supported areas.
      map.setTilt(45)
      map.setHeading(35)
      return
    }
    map.setTilt(0)
    map.setHeading(0)
  }, [mapViewMode])

  useEffect(() => {
    if (!isLoaded || !window.google || !eventDetails?.locationQuery || eventDetails?.resolvedLocation?.query === eventDetails.locationQuery) return

    const query = eventDetails.locationQuery.trim()
    const w3wMatch = query.match(WHAT3WORDS_PATTERN)
    const applyResolvedLocation = (payload) => {
      onEventDetailsChange(prev => ({
        ...prev,
        resolvedLocation: {
          query: prev.locationQuery,
          ...payload,
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

  useEffect(() => {
    const handleMouseMove = (event) => {
      const interaction = interactionRef.current
      const map = mapRef.current
      if (!interaction || !map || !onAssetUpdate) return

      if (interaction.objectType === 'asset') {
        if (interaction.type === 'move') {
          const latLng = clientPointToLatLng(map, event.clientX, event.clientY)
          if (!latLng) return
          const movedAsset = buildAssetPlacement({
            ...interaction.object,
            lat: latLng.lat(),
            lng: latLng.lng(),
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
          const nextBounds = clientRectToBounds(map, { x: event.clientX, y: event.clientY }, interaction.startWidthPx, interaction.startHeightPx)
          if (!nextBounds) return
          onFloorPlanChange(prev => prev ? { ...prev, bounds: nextBounds } : prev)
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
          const nextBounds = clientRectToBounds(
            map,
            { x: interaction.center.x + screenShift.x, y: interaction.center.y + screenShift.y },
            widthPx,
            heightPx
          )
          if (!nextBounds) return
          onFloorPlanChange(prev => prev ? { ...prev, bounds: nextBounds } : prev)
          return
        }

        if (interaction.type === 'rotate') {
          const nextAngle = Math.atan2(event.clientY - interaction.center.y, event.clientX - interaction.center.x) * 180 / Math.PI
          const delta = shortestAngleDelta(interaction.startPointerAngle, nextAngle)
          onFloorPlanChange(prev => prev ? { ...prev, rotation: Number(normalizeAngle(interaction.startRotation + delta).toFixed(1)) } : prev)
        }
      }

      if (interaction.objectType === 'annotation') {
        if (interaction.type === 'move') {
          const latLng = clientPointToLatLng(map, event.clientX, event.clientY)
          if (!latLng) return
          const movedAnnotation = buildAnnotationPlacement({
            ...interaction.object,
            lat: latLng.lat(),
            lng: latLng.lng(),
          })
          onAssetUpdate(movedAnnotation)
        }
      }
    }

    const handleMouseUp = () => {
      if (!interactionRef.current) return
      interactionRef.current = null
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
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
      layoutType: zoneType?.layoutType || 'free',
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
    onAssetUpdate({
      ...zone,
      path,
      areaM2,
      perimeterM,
      parentId: zone.parentId || null,
      capacity: computeZoneCapacity({ ...zone, path, areaM2 }),
    })
  }, [onAssetUpdate, zones])

  const handleLinePathChange = useCallback((line) => {
    // Debounce to prevent duplicate updates from multiple event listeners
    if (linePathChangeTimeoutRef.current[line.id]) {
      clearTimeout(linePathChangeTimeoutRef.current[line.id])
    }
    
    linePathChangeTimeoutRef.current[line.id] = setTimeout(() => {
      const overlay = lineOverlayRefs.current[line.id]
      if (!window.google || !overlay) return
      const path = extractPathFromOverlay(overlay)
      if (path.length < 2) return
      
      // Get current line from state to avoid stale closures
      const currentLine = lines.find(l => l.id === line.id)
      if (!currentLine) return
      
      // Check if path actually changed to avoid unnecessary updates
      const pathChanged = !currentLine.path || 
        path.length !== currentLine.path.length ||
        path.some((p, i) => Math.abs(p.lat - currentLine.path[i]?.lat) > 1e-8 || Math.abs(p.lng - currentLine.path[i]?.lng) > 1e-8)
      
      if (!pathChanged) return
      
      const newLengthM = computeLineLength(path, window.google)
      const parentZone = getDeepestParentZone(path[0], zones, window.google)
      onAssetUpdate({
        ...currentLine,
        path,
        lengthM: newLengthM,
        parentId: parentZone?.id || null,
      })
      // keep hover tooltip in sync immediately
      setHoveredLine(prev => prev?.id === line.id ? { ...prev, path, lengthM: newLengthM } : prev)
    }, 100) // Wait 100ms to batch multiple calls
  }, [onAssetUpdate, zones, lines])

  function buildAssetPlacement(assetBase) {
    if (!window.google) return assetBase
    const parentZone = getDeepestParentZone({ lat: assetBase.lat, lng: assetBase.lng }, zones, window.google)

    if (parentZone?.contentLocked && !isAssetAllowedInZone(parentZone, assetBase.assetDef?.id)) {
      const allowed = getZoneAllowedAssetTypes(parentZone).map(getAssetName)
      window.alert(`Only ${allowed.join(', ')} can be placed inside ${parentZone.label || parentZone.zoneType?.name}.`)
      return null
    }

    return {
      ...assetBase,
      parentId: parentZone?.id || null,
    }
  }

  function buildAnnotationPlacement(annotationBase) {
    if (!window.google) return annotationBase
    const parentZone = getDeepestParentZone({ lat: annotationBase.lat, lng: annotationBase.lng }, zones, window.google)
    return {
      ...annotationBase,
      parentId: parentZone?.id || null,
    }
  }

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
        setCursorScreenPosition({
          x: event.domEvent.clientX - rect.left,
          y: event.domEvent.clientY - rect.top,
        })
      }
    }

    setCursorLatLng({ lat: event.latLng.lat(), lng: event.latLng.lng() })

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

    if ((drawMode === 'line' || drawMode === 'route') && activeLineDraft?.points?.length) {
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
    }
  }, [drawMode, placingFloor, tempFloorPoints])

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

  const handleMapClick = useCallback((event) => {
    if (!event.latLng) return
    if (event?.domEvent?.detail > 1) return

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
        path = buildCirclePath(currentDraft.center, radiusM, window.google, 256)
      }

      if (path.length >= 3) {
        const zoneType = selectedZoneType || { id: 'generic', name: 'Zone', color: '#3d8ef8', fillOpacity: 0.2, layoutType: 'free' }
        const defaultSubType = zoneType?.defaultSubTypeId
          ? zoneType.subTypes?.find(subType => subType.id === zoneType.defaultSubTypeId) || null
          : null
        const metrics = computePolygonMetrics(path, window.google)

        onZoneCreate({
          id: `zone_${Date.now()}`,
          type: 'zone',
          zoneType,
          layoutType: zoneType?.layoutType || 'free',
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
      onFloorPlanChange(prevPlan => prevPlan ? {
        ...prevPlan,
        bounds: nextBounds,
      } : prevPlan)
      setTempFloorPoints([])
      onFloorPlacementChange(false)
      onSelect({ id: 'floor-plan', type: 'floor', ...floorPlan, bounds: nextBounds })
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

    if ((drawMode === 'line' || drawMode === 'route') && !layers.zones?.locked && window.google) {
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

    if (drawMode === 'text' && !layers.annotations?.locked && layers.annotations?.visible) {
      const trimmedText = String(annotationDraftText || '').trim() || 'New annotation'

      onAnnotationCreate(buildAnnotationPlacement({
        id: `annotation_${Date.now()}`,
        type: 'annotation',
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
        text: trimmedText,
        label: trimmedText,
        color: textStyle?.color || '#111827',
        backgroundColor: textStyle?.backgroundColor || '#fff7d6',
        fontSize: textStyle?.fontSize || 14,
        borderColor: textStyle?.borderColor || 'rgba(15,23,42,0.18)',
        borderWidth: textStyle?.borderWidth || 1,
        borderRadius: textStyle?.borderRadius || 10,
        status: 'planned',
        notes: '',
      }))
    }
  }, [annotationDraftText, buildAnnotationPlacement, drawMode, floorPlan, layers.annotations, layers.zones, onAnnotationCreate, onFloorPlacementChange, onFloorPlanChange, onSelect, placePendingAssetAtLatLng, placingFloor, tempFloorPoints, textStyle])

  const handleMapDoubleClick = useCallback((event) => {
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
        // label: drawMode === 'route' ? 'Route Path' : 'Measured Line',
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
  }, [drawMode, finalizePolygon, lineStyle, onLineCreate])

  const handleMapRightClick = useCallback((event) => {
    if (drawMode === 'line' || drawMode === 'route') {
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
    }
  }, [drawMode])

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
      const floorGeometry = getFloorGeometry(map, object.bounds)
      const rect = map.getDiv().getBoundingClientRect()
      if (!floorGeometry) return

      interactionRef.current = {
        objectType: 'floor',
        type,
        startX: event.clientX,
        startY: event.clientY,
        center: { x: rect.left + floorGeometry.centerPoint.x, y: rect.top + floorGeometry.centerPoint.y },
        startWidthPx: floorGeometry.widthPx,
        startHeightPx: floorGeometry.heightPx,
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

    if (object.type === 'annotation') {
      if (layers.annotations?.locked) return
      interactionRef.current = {
        objectType: 'annotation',
        type,
        object,
      }
      document.body.style.userSelect = 'none'
      onSelect(object)
      return
    }

    if (layers.assets?.locked) return

    const rect = map.getDiv().getBoundingClientRect()
    const center = latLngToContainerPoint(map, object.lat, object.lng)
    const { widthPx, lengthPx, metersPerPixel: scale } = getAssetSize(object, map.getZoom())
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
      startPointerAngle: Math.atan2(event.clientY - centerClient.y, event.clientX - centerClient.x) * 180 / Math.PI,
      metersPerPixel: scale,
    }

    document.body.style.userSelect = 'none'
    onSelect(object)
  }, [layers.annotations, layers.assets, layers.floor, onSelect])

  const mapOptions = useMemo(() => ({
    clickableIcons: false,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: window.google?.maps?.MapTypeControlStyle?.HORIZONTAL_BAR,
      position: window.google?.maps?.ControlPosition?.BOTTOM_LEFT,
      mapTypeIds: ['roadmap', 'satellite', 'hybrid'],
    },
    streetViewControl: false,
    fullscreenControl: false,
    rotateControl: true,
    zoomControl: true,
    scaleControl: true,
    disableDoubleClickZoom: drawMode === 'line' || drawMode === 'route' || drawMode === 'polygon',
    gestureHandling: 'auto',
    draggableCursor: drawMode === 'polygon' || drawMode === 'line' || drawMode === 'route' || drawMode === 'text' || placingFloor || !!pendingAssetDef ? 'crosshair' : undefined,
  }), [drawMode, pendingAssetDef, placingFloor])

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
        center={eventDetails?.resolvedLocation?.center || MAP_CENTER}
        zoom={14}
        onLoad={onLoad}
        onClick={handleMapClick}
        onDblClick={handleMapDoubleClick}
        onRightClick={handleMapRightClick}
        onMouseMove={handleMapMouseMove}
        onZoomChanged={() => setMapZoom(mapRef.current?.getZoom?.() || 14)}
        options={mapOptions}
      >
        {layers.floor?.visible && floorPlan?.bounds && (
          <FloorPlanOverlay
            floorPlan={floorPlan}
            selected={floorSelected}
            locked={!!layers.floor?.locked}
            onSelect={onSelect}
            onStartInteraction={handleStartInteraction}
            map={mapRef.current}
          />
        )}

        {layers.zones?.visible && zones.map(zone => (
          <Polygon
            key={zone.id}
            paths={zone.path}
            options={{
              fillColor: zone.zoneType?.color || '#3d8ef8',
              fillOpacity: selectedId === zone.id ? 0.22 : (zone.zoneType?.fillOpacity || 0.2),
              strokeColor: zone.zoneType?.color || '#3d8ef8',
              strokeWeight: selectedId === zone.id ? 3 : 2,
              editable: selectedId === zone.id && !layers.zones?.locked,
              draggable: selectedId === zone.id && !layers.zones?.locked,
              clickable: drawMode === 'select',
              zIndex: selectedId === zone.id ? 1 : 0,
            }}
            onClick={(event) => {
              if (placePendingAssetAtLatLng(event?.latLng)) return
              if (drawMode !== 'select') return
              onSelect(zone)
            }}
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
        ))}

        {layers.grid?.visible && zoneGridPoints.map(point => (
          <Marker
            key={point.id}
            position={{ lat: point.lat, lng: point.lng }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 1.8,
              fillColor: point.color,
              fillOpacity: 0.32,
              strokeColor: point.color,
              strokeOpacity: 0.45,
              strokeWeight: 1,
            }}
            clickable={false}
          />
        ))}

        {lines.map(line => (
          <React.Fragment key={line.id}>
            <Polyline
              key={`${line.id}-${line.path?.length || 0}`}
              path={line.path}
              options={{
                strokeColor: selectedId === line.id ? '#38bdf8' : (line.color || '#f59e0b'),
                strokeWeight: selectedId === line.id ? Math.max((line.strokeWeight || 4) + 1, 5) : (line.strokeWeight || 4),
                strokeOpacity: line.pattern === 'solid' ? 0.95 : 0.28,
                clickable: drawMode === 'select',
                editable: selectedId === line.id && !layers.zones?.locked,
                draggable: selectedId === line.id && !layers.zones?.locked,
                icons: getLinePatternIcons(line.pattern || 'dashed', selectedId === line.id ? '#38bdf8' : (line.color || '#f59e0b')),
              }}
              onClick={() => {
                if (drawMode !== 'select') return
                onSelect(line)
              }}
              onMouseOver={(e) => {
                if (drawMode !== 'select') return
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
              onLoad={(polyline) => {
                lineOverlayRefs.current[line.id] = polyline
                // listen to vertex drag so lengthM updates live
                const path = polyline.getPath()
                path.addListener('set_at', () => handleLinePathChange(line))
                path.addListener('insert_at', () => handleLinePathChange(line))
                path.addListener('remove_at', () => handleLinePathChange(line))
              }}
              onUnmount={() => { delete lineOverlayRefs.current[line.id] }}
            />
            {line.label && line.path?.length >= 2 && (
              <OverlayView
                position={line.path[Math.floor(line.path.length / 2)]}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={() => ({ x: 6, y: -22 })}
              >
                <div style={{
                  background: 'rgba(0,0,0,0.72)',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  border: `1px solid ${line.color || '#f59e0b'}`,
                }}>
                  {line.label} · {line.lengthM >= 1000 ? `${(line.lengthM / 1000).toFixed(2)} km` : `${line.lengthM?.toFixed(0)} m`}
                </div>
              </OverlayView>
            )}
          </React.Fragment>
        ))}

        {lineDraft?.points?.length > 0 && (
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
                  <Marker
                    position={point}
                    icon={{
                      path: window.google.maps.SymbolPath.CIRCLE,
                      scale: index === 0 ? 6 : 4,
                      fillColor: index === 0 ? (lineStyle?.color || '#38bdf8') : '#ffffff',
                      fillOpacity: 1,
                      strokeColor: lineStyle?.color || '#38bdf8',
                      strokeWeight: 2,
                    }}
                    clickable={false}
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
                        {formatDistance(segDist)}
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
              <Marker
                key={`polygon-draft-${index}`}
                position={point}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 5,
                  fillColor: '#ffffff',
                  fillOpacity: 1,
                  strokeColor: selectedZoneType?.color || '#3d8ef8',
                  strokeWeight: 2,
                }}
                clickable={false}
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
                  Perimeter: {formatDistance(lineMeasurement)}
                </div>
              </OverlayView>
            )}
          </>
        )}

        {shapeDraft?.center && lineMeasurement !== null && window.google && (
          <>
            <Polygon
              key="shape-draft"
              paths={shapeDraft.type === 'circle'
                ? buildCirclePath(shapeDraft.center, lineMeasurement, window.google, 256)
                : buildSquarePath(shapeDraft.center, lineMeasurement, window.google)}
              options={{
                fillColor: shapeDraft.type === 'circle' ? 'rgba(60, 130, 240, 0.2)' : 'rgba(120, 210, 120, 0.2)',
                strokeColor: shapeDraft.type === 'circle' ? '#3d8ef8' : '#22c55e',
                strokeOpacity: 0.7,
                strokeWeight: 2,
                clickable: false,
              }}
            />
            <Marker
              position={shapeDraft.center}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: '#ffffff',
                fillOpacity: 1,
                strokeColor: '#000',
                strokeWeight: 2,
              }}
              clickable={false}
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
                {shapeDraft.type === 'circle' ? 'Radius' : 'Half-side'}: {formatDistance(lineMeasurement)}
              </div>
            </OverlayView>
          </>
        )}

        {placingFloor && tempFloorPoints.length > 0 && (
          <>
            <Marker
              position={tempFloorPoints[0]}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: '#ffffff',
                fillOpacity: 1,
                strokeColor: '#38bdf8',
                strokeWeight: 2,
              }}
              clickable={false}
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

        {layers.assets?.visible && assets.map(asset => (
          <AssetOverlay
            key={asset.id}
            asset={asset}
            zoom={mapZoom}
            selected={selectedId === asset.id}
            locked={!!layers.assets?.locked}
            interactive={drawMode === 'select' || drawMode === 'erase'}
            drawMode={drawMode}
            onEraseAsset={onEraseAsset}
            onSelect={onSelect}
            onStartInteraction={handleStartInteraction}
          />
        ))}

        {layers.annotations?.visible && annotations.filter(annotation => annotation.id !== selectedAnnotation?.id).map(annotation => (
          <AnnotationOverlay
            key={annotation.id}
            annotation={annotation}
            selected={false}
            locked={!!layers.annotations?.locked}
            interactive={drawMode === 'select'}
            onSelect={onSelect}
            onStartInteraction={handleStartInteraction}
            zoom={mapZoom}
          />
        ))}

        {layers.annotations?.visible && selectedAnnotation && (
          <AnnotationOverlay
            annotation={selectedAnnotation}
            selected
            locked={!!layers.annotations?.locked}
            interactive={drawMode === 'select'}
            onSelect={onSelect}
            onStartInteraction={handleStartInteraction}
            zoom={mapZoom}
          />
        )}

      </GoogleMap>

      <MeasurementOverlay
        screenPosition={cursorScreenPosition}
        text={
          ((drawMode === 'line' || drawMode === 'route') && lineDraft?.points?.length)
            ? `Total: ${formatDistance(lineMeasurement)} | +${formatDistance(
                lineDraft.hoverPoint && lineDraft.points.length
                  ? window.google?.maps?.geometry?.spherical?.computeDistanceBetween(
                      new window.google.maps.LatLng(lineDraft.points[lineDraft.points.length - 1].lat, lineDraft.points[lineDraft.points.length - 1].lng),
                      new window.google.maps.LatLng(lineDraft.hoverPoint.lat, lineDraft.hoverPoint.lng)
                    ) : 0
              )} | dbl-click finish | right-click undo`
            : (drawMode === 'polygon' && polygonDraft?.points?.length)
            ? `Perimeter: ${formatDistance(lineMeasurement)} | dbl-click finish | right-click undo`
            : null
        }
      />

      {hoveredLine && hoverScreenPos && drawMode === 'select' && (
        <div style={{
          position: 'absolute',
          left: `${hoverScreenPos.x + 14}px`,
          top: `${hoverScreenPos.y - 56}px`,
          background: 'rgba(15,23,42,0.92)',
          color: '#fff',
          border: `1.5px solid ${hoveredLine.color || '#f59e0b'}`,
          borderRadius: '10px',
          padding: '7px 12px',
          fontSize: '12px',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 25,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          lineHeight: 1.6,
        }}>
          <div style={{ color: hoveredLine.color || '#f59e0b', marginBottom: '2px' }}>{hoveredLine.label || 'Line'}</div>
          <div>📏 {hoveredLine.lengthM >= 1000 ? `${(hoveredLine.lengthM / 1000).toFixed(2)} km` : `${hoveredLine.lengthM?.toFixed(1)} m`}</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>{hoveredLine.path?.length} pts · {hoveredLine.pattern || 'dashed'} · {hoveredLine.strokeWeight || 4}px · {hoveredLine.status || 'planned'}</div>
        </div>
      )}

      {pendingAssetDef && drawMode === 'select' && cursorScreenPosition && (
        <div
          style={{
            position: 'absolute',
            left: `${cursorScreenPosition.x + 14}px`,
            top: `${cursorScreenPosition.y + 14}px`,
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

      {placingFloor && floorPlan?.imageUrl && (
        <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,15,20,0.9)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: '8px 16px', fontSize: '12px', color: 'var(--accent)', pointerEvents: 'none', backdropFilter: 'blur(8px)' }}>
          Click the top-left corner, then the bottom-right corner to place the floor plan
        </div>
      )}

    </div>
  )
}
