import React, { useCallback, useRef, useEffect, useState } from 'react'
import { MarkerF, OverlayView } from '@react-google-maps/api'
import AssetGlyph from './AssetGlyph'
import {
  getAssetSize,
  getFloorGeometry,
  projectScreenDelta,
  localDeltaToScreen,
  clientPointToLatLng,
  latLngToContainerPoint,
  normalizeAngle,
  shortestAngleDelta,
  buildRectanglePath,
} from '../utils/mapGeometry'

const MIN_ASSET_SIZE_PX = 28
const MIN_ASSET_SIZE_M = 0.5

const RESIZE_HANDLES = [
  { key: 'nw', left: '-7px', top: '-7px', cursor: 'nwse-resize', xSign: -1, ySign: -1 },
  { key: 'ne', right: '-7px', top: '-7px', cursor: 'nesw-resize', xSign: 1, ySign: -1 },
  { key: 'sw', left: '-7px', bottom: '-7px', cursor: 'nesw-resize', xSign: -1, ySign: 1 },
  { key: 'se', right: '-7px', bottom: '-7px', cursor: 'nwse-resize', xSign: 1, ySign: 1 },
]

function getStatusColor(status) {
  switch (status) {
    case 'confirmed':
    case 'installed':
      return '#10b981'
    case 'planned':
      return '#f59e0b'
    case 'removed':
      return '#ef4444'
    default:
      return '#6b7280'
  }
}

function hexToRgba(hex, opacity) {
  try {
    const h = hex.replace('#', '')
    if (h.length !== 6) return hex
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${opacity})`
  } catch (e) {
    return hex
  }
}

export const AssetOverlay = React.memo(function AssetOverlay({ asset, zoom, selected, locked, interactive, onSelect, onStartInteraction, drawMode, onEraseAsset, onHover, map, onAssetUpdate }) {
  const ASSET_MIN_ZOOM = 11
  const liveZoom = Number.isFinite(map?.getZoom?.()) ? map.getZoom() : (Number.isFinite(zoom) ? zoom : 15)
  if (liveZoom < ASSET_MIN_ZOOM) return null

  const { widthPx, lengthPx, metersPerPixel: mpp, widthM, lengthM } = getAssetSize(asset, liveZoom)

  const rotationDeg = asset.rotationDeg || 0
  const fillColor = asset.fillColor || asset.assetDef?.color || '#3d8ef8'
  const fillOpacity = asset.fillOpacity !== undefined ? asset.fillOpacity : 0.85
  const strokeColor = asset.strokeColor || asset.assetDef?.color || '#3d8ef8'
  const strokeWeight = asset.strokeWeight || 2
  const color = asset.assetDef?.color || '#3d8ef8'
  const renderedShortSidePx = Math.max(18, Math.min(widthPx, lengthPx))
  const assetBorderWidth = Math.max(1, Math.min(2, Number(strokeWeight || 2)))
  const selectedBorderWidth = Math.max(1.5, Math.min(2.5, assetBorderWidth + 0.5))
  const assetCornerRadius = Math.max(6, Math.min(10, Math.round(renderedShortSidePx * 0.14)))
  const statusDotSize = Math.max(8, Math.min(16, Math.round(renderedShortSidePx * 0.24)))
  const statusDotInset = Math.max(2, Math.round(statusDotSize * 0.24))
  const statusDotBorder = Math.max(1.5, Math.round(statusDotSize * 0.16))
  const useMarkerMode = !selected && liveZoom <= 13.5 && !!window.google?.maps

  if (useMarkerMode) {
    const markerLabelText = String(asset.label || asset.assetDef?.name || 'A').trim().charAt(0).toUpperCase()
    return (
      <MarkerF
        position={{ lat: asset.lat, lng: asset.lng }}
        title={asset.label || asset.assetDef?.name || 'Asset'}
        icon={{
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 0.96,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: liveZoom <= 12 ? 6 : 7,
        }}
        label={{
          text: markerLabelText,
          color: '#ffffff',
          fontWeight: '700',
          fontSize: liveZoom <= 12 ? '9px' : '10px',
        }}
        zIndex={450}
        options={{
          clickable: interactive,
          cursor: !interactive || locked ? 'default' : drawMode === 'erase' ? 'not-allowed' : 'pointer',
          optimized: true,
        }}
        onClick={(event) => {
          if (!interactive) return
          event?.domEvent?.stopPropagation?.()
          if (drawMode === 'erase') {
            onEraseAsset?.(asset)
            return
          }
          onSelect(asset)
        }}
        onMouseOver={() => onHover?.({ type: 'asset', data: asset })}
        onMouseOut={() => onHover?.(null)}
      />
    )
  }

  // Keep latest refs so native listeners always see current values
  const assetRef = useRef(asset)
  const mapRef = useRef(map)
  const onAssetUpdateRef = useRef(onAssetUpdate)
  useEffect(() => { assetRef.current = asset }, [asset])
  useEffect(() => { mapRef.current = map }, [map])
  useEffect(() => { onAssetUpdateRef.current = onAssetUpdate }, [onAssetUpdate])

  const dragState = useRef(null)

  const resizeHandles = RESIZE_HANDLES

  // ── Native pointer event handlers (used via addEventListener for reliable capture) ──

  const onPointerMoveFn = useCallback((e) => {
    const ds = dragState.current
    if (!ds) return
    const m = mapRef.current
    if (!m) return

    if (ds.type === 'resize') {
      const dx = e.clientX - ds.startX
      const dy = e.clientY - ds.startY
      const { localX, localY } = projectScreenDelta(dx, dy, ds.startRotationDeg)
      const rawWidth = ds.startWidthPx + (localX * ds.handle.xSign)
      const rawLength = ds.startLengthPx + (localY * ds.handle.ySign)
      const newWidthPx = Math.max(MIN_ASSET_SIZE_PX, rawWidth)
      const newLengthPx = Math.max(MIN_ASSET_SIZE_PX, rawLength)
      const appliedWidthDelta = newWidthPx - ds.startWidthPx
      const appliedLengthDelta = newLengthPx - ds.startLengthPx
      const shift = localDeltaToScreen(
        (appliedWidthDelta / 2) * ds.handle.xSign,
        (appliedLengthDelta / 2) * ds.handle.ySign,
        ds.startRotationDeg
      )
      const nextCenter = clientPointToLatLng(m, ds.center.x + shift.x, ds.center.y + shift.y)
      if (!nextCenter) return
      onAssetUpdateRef.current({
        ...ds.snapshotAsset,
        lat: nextCenter.lat(),
        lng: nextCenter.lng(),
        widthM: Number(Math.max(MIN_ASSET_SIZE_M, newWidthPx * ds.metersPerPixel).toFixed(2)),
        lengthM: Number(Math.max(MIN_ASSET_SIZE_M, newLengthPx * ds.metersPerPixel).toFixed(2)),
      })
    } else if (ds.type === 'rotate') {
      const nextAngle = Math.atan2(e.clientY - ds.center.y, e.clientX - ds.center.x) * 180 / Math.PI
      const delta = shortestAngleDelta(ds.startPointerAngle, nextAngle)
      onAssetUpdateRef.current({
        ...ds.snapshotAsset,
        rotationDeg: Number(normalizeAngle(ds.startRotationDeg + delta).toFixed(1)),
      })
    } else if (ds.type === 'move') {
      const latLng = clientPointToLatLng(m, e.clientX, e.clientY)
      if (!latLng) return
      onAssetUpdateRef.current({
        ...assetRef.current,
        lat: latLng.lat() - (ds.latOffset || 0),
        lng: latLng.lng() - (ds.lngOffset || 0),
      })
    }
  }, [])

  const onPointerUpFn = useCallback((e) => {
    if (!dragState.current) return
    try { e.target.releasePointerCapture(e.pointerId) } catch { }
    e.target.removeEventListener('pointermove', onPointerMoveFn)
    e.target.removeEventListener('pointerup', onPointerUpFn)
    dragState.current = null
    document.body.style.userSelect = ''
  }, [onPointerMoveFn])

  const startCapture = useCallback((el, pointerId) => {
    el.setPointerCapture(pointerId)
    el.addEventListener('pointermove', onPointerMoveFn)
    el.addEventListener('pointerup', onPointerUpFn)
    document.body.style.userSelect = 'none'
  }, [onPointerMoveFn, onPointerUpFn])

  // ── Resize ──
  const handleResizePointerDown = useCallback((e, handle) => {
    e.preventDefault()
    e.stopPropagation()
    const m = mapRef.current
    if (!m) return

    const rect = m.getDiv().getBoundingClientRect()
    const center = latLngToContainerPoint(m, assetRef.current.lat, assetRef.current.lng)
    if (!center) return

    dragState.current = {
      type: 'resize',
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startWidthPx: widthPx,
      startLengthPx: lengthPx,
      startRotationDeg: rotationDeg,
      center: { x: rect.left + center.x, y: rect.top + center.y },
      metersPerPixel: mpp,
      snapshotAsset: { ...assetRef.current },
    }
    startCapture(e.target, e.pointerId)
  }, [widthPx, lengthPx, rotationDeg, mpp, startCapture])

  // ── Rotate ──
  const handleRotatePointerDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const m = mapRef.current
    if (!m) return

    const rect = m.getDiv().getBoundingClientRect()
    const center = latLngToContainerPoint(m, assetRef.current.lat, assetRef.current.lng)
    if (!center) return
    const centerClient = { x: rect.left + center.x, y: rect.top + center.y }

    dragState.current = {
      type: 'rotate',
      startRotationDeg: rotationDeg,
      center: centerClient,
      startPointerAngle: Math.atan2(e.clientY - centerClient.y, e.clientX - centerClient.x) * 180 / Math.PI,
      snapshotAsset: { ...assetRef.current },
    }
    startCapture(e.target, e.pointerId)
  }, [rotationDeg, startCapture])

  // ── Move ──
  const handleMovePointerDown = useCallback((e) => {
    if (!interactive || locked || drawMode !== 'select' || !mapRef.current) return
    e.preventDefault()
    e.stopPropagation()

    const clickLatLng = clientPointToLatLng(mapRef.current, e.clientX, e.clientY)
    const latOffset = clickLatLng ? clickLatLng.lat() - asset.lat : 0
    const lngOffset = clickLatLng ? clickLatLng.lng() - asset.lng : 0

    dragState.current = {
      type: 'move',
      latOffset,
      lngOffset
    }
    startCapture(e.target, e.pointerId)
    onSelect(asset)
  }, [interactive, locked, drawMode, asset, onSelect, startCapture])

  return (
    <OverlayView
      position={{ lat: asset.lat, lng: asset.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={() => ({
        x: -(widthPx / 2),
        y: -(lengthPx / 2),
      })}
    >
      <div style={{
        width: `${widthPx}px`,
        height: `${lengthPx}px`,
        position: 'relative',
        pointerEvents: 'auto',
        zIndex: 12,
      }}>
        <div style={{ position: 'absolute', inset: 0, transform: `translateZ(0) rotate(${rotationDeg}deg)`, transformOrigin: 'center center', transition: 'transform 120ms linear', willChange: 'transform' }}>
          <button
            type="button"
            onPointerDown={handleMovePointerDown}
            onMouseOver={() => onHover?.({ type: 'asset', data: asset })}
            onMouseOut={() => onHover?.(null)}
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
              borderRadius: `${assetCornerRadius}px`,
              border: selected ? `${selectedBorderWidth}px solid #38bdf8` : `${assetBorderWidth}px solid ${strokeColor}`,
              background: selected ? `${fillColor}33` : hexToRgba(fillColor, fillOpacity),
              boxShadow: selected ? '0 0 0 1px rgba(255,255,255,0.8)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: !interactive ? 'default' : drawMode === 'erase' ? 'not-allowed' : locked ? 'pointer' : 'grab',
              pointerEvents: interactive ? 'auto' : 'none',
              padding: 0,
              boxSizing: 'border-box',
              touchAction: locked ? 'auto' : 'none',
              transition: 'border-color 120ms linear, background 120ms linear, box-shadow 120ms linear',
              backfaceVisibility: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(widthPx, lengthPx) * 0.56}px`,
                height: `${Math.min(widthPx, lengthPx) * 0.56}px`,
                borderRadius: '999px',
                background: '#ffffff',
                border: `2px solid ${color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: `${Math.max(8, Math.min(widthPx, lengthPx) * 0.28)}px`,
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
                pointerEvents: 'none',
              }}
            >
              {widthPx > 6 && (
                <AssetGlyph
                  asset={asset.assetDef}
                  size={Math.max(8, Math.min(widthPx, lengthPx) * 0.28)}
                  color={asset.assetDef?.iconColor || color}
                />
              )}
            </div>
          </button>

          {selected && interactive && !locked && (
            <>
              {/* Rotation Handle - Anchored relative to asset center with LatLng offset for stability */}
              {(() => {
                if (!window.google) return null
                const origin = new window.google.maps.LatLng(asset.lat, asset.lng)
                const centerRotation = rotationDeg
                const renderedLengthPx = Math.max(1, lengthPx)
                const rotateHandleOffsetPx = (renderedLengthPx / 2) + 22
                const offsetMeters = rotateHandleOffsetPx * (mpp || 0.5)
                const rotationPos = window.google.maps.geometry.spherical.computeOffset(origin, Math.max(2, offsetMeters), centerRotation)

                return (
                  <OverlayView
                    position={{ lat: rotationPos.lat(), lng: rotationPos.lng() }}
                    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                    getPixelPositionOffset={() => ({ x: -13, y: -13 })}
                  >
                    <div style={{ width: '26px', height: '26px', position: 'relative' }}>
                      <button
                        type="button"
                        onPointerDown={handleRotatePointerDown}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '999px',
                          border: '2px solid #38bdf8',
                          background: '#ffffff',
                          color: '#0f172a',
                          fontSize: '14px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'grab',
                          padding: 0,
                          touchAction: 'none',
                          boxShadow: '0 4px 10px rgba(15,23,42,0.18)',
                        }}
                      >
                        R
                      </button>
                      <div
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '26px',
                          width: '2px',
                          height: '14px',
                          transform: 'translateX(-50%)',
                          background: '#38bdf8',
                          pointerEvents: 'none',
                        }}
                      />
                    </div>
                  </OverlayView>
                )
              })()}

              {/* Resize Handles - Anchored directly to corner LatLngs */}
              {(() => {
                if (!window.google) return null
                // Keep handles anchored to the exact rendered rectangle footprint,
                // including min on-screen size at lower zoom levels.
                const corners = buildRectanglePath(
                  { lat: asset.lat, lng: asset.lng },
                  (widthPx * mpp) / 2,
                  (lengthPx * mpp) / 2,
                  window.google,
                  rotationDeg
                )
                if (corners.length < 4) return null

                // ne:0, nw:1, sw:2, se:3 based on buildRectanglePath order
                return RESIZE_HANDLES.map((handle) => {
                  let pos = null
                  if (handle.key === 'ne') pos = corners[0]
                  else if (handle.key === 'nw') pos = corners[1]
                  else if (handle.key === 'sw') pos = corners[2]
                  else if (handle.key === 'se') pos = corners[3]

                  if (!pos) return null

                  return (
                    <OverlayView
                      key={handle.key}
                      position={pos}
                      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                      getPixelPositionOffset={() => ({ x: -7, y: -7 })}
                    >
                      <button
                        type="button"
                        onPointerDown={(e) => handleResizePointerDown(e, handle)}
                        style={{
                          width: '14px',
                          height: '14px',
                          borderRadius: '3px',
                          border: '2px solid #38bdf8',
                          background: '#ffffff',
                          cursor: handle.cursor,
                          padding: 0,
                          touchAction: 'none',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          display: 'block',
                        }}
                      />
                    </OverlayView>
                  )
                })
              })()}
            </>
          )}

          {/* Status indicator dot — scales with zoom/asset size like native map markers */}
          {!selected && (
            <div
              style={{
                position: 'absolute',
                bottom: `${statusDotInset}px`,
                right: `${statusDotInset}px`,
                width: `${statusDotSize}px`,
                height: `${statusDotSize}px`,
                borderRadius: '50%',
                backgroundColor: getStatusColor(asset.status || 'planned'),
                border: `${statusDotBorder}px solid white`,
                boxShadow: `0 1px ${Math.max(3, Math.round(statusDotSize * 0.32))}px rgba(0,0,0,0.3)`,
                pointerEvents: 'none',
                zIndex: 13,
              }}
            />
          )}
        </div>
      </div>
    </OverlayView>
  )
})

export const FloorPlanOverlay = React.memo(function FloorPlanOverlay({ floorPlan, selected, locked, onSelect, onStartInteraction, map, zoom }) {
  const baseZoom = 18
  const liveZoom = Number.isFinite(map?.getZoom?.()) ? map.getZoom() : (Number.isFinite(zoom) ? zoom : 15)
  const geometry = getFloorGeometry(map, floorPlan, baseZoom)
  if (!geometry) return null
  const scale = Math.max(0.01, Math.pow(2, liveZoom - baseZoom))

  const rotation = floorPlan.rotation || 0
  const resizeHandles = [
    { key: 'nw', left: '-8px', top: '-8px', cursor: 'nwse-resize', xSign: -1, ySign: -1 },
    { key: 'ne', right: '-8px', top: '-8px', cursor: 'nesw-resize', xSign: 1, ySign: -1 },
    { key: 'sw', left: '-8px', bottom: '-8px', cursor: 'nesw-resize', xSign: -1, ySign: 1 },
    { key: 'se', right: '-8px', bottom: '-8px', cursor: 'nwse-resize', xSign: 1, ySign: 1 },
  ]

  return (
    <OverlayView
      position={{ lat: geometry.centerLat, lng: geometry.centerLng }}
      mapPaneName={selected ? OverlayView.OVERLAY_MOUSE_TARGET : OverlayView.OVERLAY_LAYER}
      getPixelPositionOffset={() => ({
        x: -(geometry.widthPx / 2),
        y: -(geometry.heightPx / 2),
      })}
    >
      <div style={{
        width: `${geometry.widthPx}px`,
        height: `${geometry.heightPx}px`,
        position: 'relative',
        pointerEvents: 'none',
        transformOrigin: 'center center',
      }}>
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${scale}) rotate(${rotation}deg)`, transformOrigin: 'center center', willChange: 'transform' }}>
          <img
            src={floorPlan.imageUrl}
            alt="Floor plan"
            onPointerDown={(e) => onStartInteraction(e, floorPlan, 'move')}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              display: 'block',
              opacity: floorPlan.opacity ?? 0.7,
              border: selected ? '2px solid #38bdf8' : 'none',
              boxSizing: 'border-box',
              pointerEvents: 'auto',
              cursor: locked ? 'default' : 'grab',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          />
        </div>
      </div>

      {selected && !locked && (
        <>
          {/* Floor Plan Resize Handles - Anchored directly to corners for stability */}
          {(() => {
            if (!window.google) return null
            const corners = buildRectanglePath(
              { lat: geometry.centerLat, lng: geometry.centerLng },
              geometry.widthM / 2,
              geometry.heightM / 2,
              window.google,
              rotation
            )
            if (corners.length < 4) return null

            return [
              { key: 'ne', pos: corners[0], cursor: 'nesw-resize' },
              { key: 'nw', pos: corners[1], cursor: 'nwse-resize' },
              { key: 'sw', pos: corners[2], cursor: 'nesw-resize' },
              { key: 'se', pos: corners[3], cursor: 'nwse-resize' }
            ].map((handle) => (
              <OverlayView
                key={handle.key}
                position={handle.pos}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={() => ({ x: -8, y: -8 })}
              >
                <button
                  type="button"
                  onPointerDown={(e) => onStartInteraction(e, floorPlan, 'resize', handle)}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    border: '2px solid #38bdf8',
                    background: '#ffffff',
                    cursor: handle.cursor,
                    padding: 0,
                    touchAction: 'none',
                    boxShadow: '0 4px 10px rgba(15,23,42,0.18)',
                    display: 'block',
                  }}
                />
              </OverlayView>
            ))
          })()}

          {/* Floor Plan Rotation Handle */}
          {(() => {
            if (!window.google) return null
            const origin = new window.google.maps.LatLng(geometry.centerLat, geometry.centerLng)
            const rotationDeg = rotation
            const offsetMeters = 50 * (metersPerPixel(geometry.centerLat, liveZoom) || 0.5)
            const rotationPos = window.google.maps.geometry.spherical.computeOffset(origin, Math.max(10, offsetMeters), rotationDeg)

            return (
              <OverlayView
                position={{ lat: rotationPos.lat(), lng: rotationPos.lng() }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={() => ({ x: -14, y: -14 })}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '2px', height: '18px', background: '#38bdf8', marginTop: '14px' }} />
                  <button
                    type="button"
                    onPointerDown={(e) => onStartInteraction(e, floorPlan, 'rotate')}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border: '2px solid #38bdf8',
                      background: '#ffffff',
                      color: '#0f172a',
                      fontSize: '14px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'grab',
                      padding: 0,
                      touchAction: 'none',
                      boxShadow: '0 4px 10px rgba(15,23,42,0.18)',
                    }}
                  >
                    ↻
                  </button>
                </div>
              </OverlayView>
            )
          })()}
        </>
      )}
    </OverlayView>
  )
})

export const AnnotationOverlay = React.memo(function AnnotationOverlay({ annotation, selected, locked, interactive, onSelect, onStartInteraction, onUpdate, drawMode = 'select', onEraseAsset, zoom, onHover }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftText, setDraftText] = useState(annotation.text || '')
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (!isEditing) {
      setDraftText(annotation.text || '')
    }
  }, [annotation.id, annotation.text, isEditing])

  const isSelected = Boolean(selected)
  const zoomValue = Number(zoom || 15)
  const minVisibleZoom = isEditing || isSelected ? 0 : 10

  if (!isSelected && zoomValue < minVisibleZoom) {
    return null
  }

  const pinLabel = String(annotation.label || annotation.text || 'Drop Pin').trim() || 'Drop Pin'
  const pinColor = annotation.pinColor || '#ea4335'
  const textColor = annotation.color || '#202124'
  const fontSize = Math.max(12, Number(annotation.fontSize || 13))
  const fontWeight = Math.max(500, Number(annotation.fontWeight ?? 600))
  const selectedColor = '#1a73e8'
  const boxBackground = '#ffffff'
  const boxBorder = 'rgba(15,23,42,0.12)'
  const boxBorderWidth = 1
  const useCompactMarker = !isSelected && !isEditing && zoomValue < 13
  const markerScale = isSelected ? 1.18 : zoomValue >= 17 ? 0.96 : zoomValue >= 15 ? 0.88 : zoomValue >= 13 ? 0.78 : 0.68
  const markerIsDraggable = interactive && !locked && drawMode === 'select' && !isEditing
  const showStaticLabel = !isHovered && !isEditing && !useCompactMarker && (zoomValue >= 15 || isSelected)

  const markerIcon = window.google?.maps
    ? (useCompactMarker
      ? {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: pinColor,
        fillOpacity: 0.95,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: zoomValue < 12 ? 4 : 5,
        anchor: new window.google.maps.Point(0, 0),
      }
      : {
        path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
        fillColor: pinColor,
        fillOpacity: 1,
        strokeColor: isSelected ? selectedColor : '#ffffff',
        strokeWeight: isSelected ? 2 : 1.5,
        scale: markerScale,
        anchor: new window.google.maps.Point(12, 24),
        labelOrigin: new window.google.maps.Point(12, 9),
      })
    : undefined

  const markerLabel = useCompactMarker
    ? undefined
    : {
      text: pinLabel.charAt(0).toUpperCase(),
      color: '#ffffff',
      fontWeight: '700',
      fontSize: `${Math.max(8, Math.round(9 * markerScale))}px`,
    }

  const staticLabelStyle = {
    position: 'absolute',
    left: '50%',
    bottom: '26px',
    transform: 'translateX(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '180px',
    padding: '3px 8px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.96)',
    color: '#0f172a',
    fontSize: `${Math.max(11, fontSize - 1)}px`,
    fontWeight: 700,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    boxShadow: '0 4px 12px rgba(15,23,42,0.12)',
    border: '1px solid rgba(15,23,42,0.08)',
    pointerEvents: 'none',
  }

  const labelOverlayStyle = {
    position: 'relative',
    width: 0,
    height: 0,
    pointerEvents: 'none',
  }

  const editorStyle = {
    minWidth: '160px',
    maxWidth: '300px',
    padding: '10px 12px',
    borderRadius: '12px',
    border: `${boxBorderWidth}px solid ${isSelected ? selectedColor : boxBorder}`,
    background: boxBackground,
    color: textColor,
    boxShadow: '0 10px 22px rgba(15,23,42,0.14)',
    transform: 'translate(-50%, calc(-100% - 18px))',
    transformOrigin: 'bottom center',
  }

  const editorTailStyle = {
    position: 'absolute',
    left: '50%',
    bottom: '-6px',
    width: '12px',
    height: '12px',
    background: boxBackground,
    borderRight: `${boxBorderWidth}px solid ${isSelected ? selectedColor : boxBorder}`,
    borderBottom: `${boxBorderWidth}px solid ${isSelected ? selectedColor : boxBorder}`,
    transform: 'translateX(-50%) rotate(45deg)',
    boxSizing: 'border-box',
    zIndex: -1,
  }

  const saveDraft = () => {
    const normalizedText = String(draftText || '').trimEnd() || 'New annotation'
    setIsEditing(false)

    if (normalizedText === (annotation.text || '')) return

    const nextLabel = !annotation.label || annotation.label === annotation.text
      ? normalizedText
      : annotation.label

    onUpdate?.({
      ...annotation,
      text: normalizedText,
      label: nextLabel,
    })
  }

  return (
    <>
      <MarkerF
        position={{ lat: annotation.lat, lng: annotation.lng }}
        title={pinLabel}
        icon={markerIcon}
        label={markerLabel}
        draggable={markerIsDraggable}
        zIndex={isSelected ? 900 : 500}
        options={{
          clickable: interactive,
          cursor: !interactive || locked ? 'default' : drawMode === 'erase' ? 'not-allowed' : markerIsDraggable ? 'grab' : 'pointer',
          optimized: true,
        }}
        onClick={(event) => {
          if (!interactive) return
          event?.domEvent?.stopPropagation?.()
          if (drawMode === 'erase') {
            onEraseAsset?.(annotation, 'annotation')
            return
          }
          onSelect(annotation)
        }}
        onDblClick={(event) => {
          if (!interactive || locked || drawMode !== 'select') return
          event?.domEvent?.preventDefault?.()
          event?.domEvent?.stopPropagation?.()
          onSelect(annotation)
          setIsEditing(true)
        }}
        onDragStart={() => {
          if (!markerIsDraggable) return
          onSelect(annotation)
        }}
        onDragEnd={(event) => {
          if (!markerIsDraggable) return
          const lat = event.latLng?.lat?.()
          const lng = event.latLng?.lng?.()
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
          onUpdate?.({
            ...annotation,
            lat,
            lng,
          })
        }}
        onMouseOver={() => {
          setIsHovered(true)
          onHover?.({ type: 'annotation', data: annotation })
        }}
        onMouseOut={() => {
          setIsHovered(false)
          onHover?.(null)
        }}
      />

      {showStaticLabel && (
        <OverlayView
          position={{ lat: annotation.lat, lng: annotation.lng }}
          mapPaneName={OverlayView.FLOAT_PANE}
          getPixelPositionOffset={() => ({ x: 0, y: 0 })}
        >
          <div style={labelOverlayStyle}>
            <div style={staticLabelStyle} title={pinLabel}>{pinLabel}</div>
          </div>
        </OverlayView>
      )}

      {isEditing && (
        <OverlayView
          position={{ lat: annotation.lat, lng: annotation.lng }}
          mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          getPixelPositionOffset={() => ({ x: 0, y: 0 })}
        >
          <div
            style={{ ...editorStyle, position: 'relative', cursor: 'text' }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <textarea
              autoFocus
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              onBlur={saveDraft}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setDraftText(annotation.text || '')
                  setIsEditing(false)
                }
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault()
                  saveDraft()
                }
              }}
              style={{
                width: '100%',
                minHeight: '72px',
                border: 'none',
                outline: 'none',
                resize: 'vertical',
                background: 'transparent',
                color: textColor,
                fontSize: `${fontSize}px`,
                fontWeight,
                lineHeight: 1.45,
                fontFamily: 'inherit',
              }}
            />
            <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.7 }}>
              Ctrl+Enter to save
            </div>
            <div style={editorTailStyle} />
          </div>
        </OverlayView>
      )}
    </>
  )
})

export function MeasurementOverlay({ screenPosition, text }) {
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
