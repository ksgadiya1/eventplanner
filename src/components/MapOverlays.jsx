import React, { useCallback, useRef, useEffect, useState } from 'react'
import { OverlayView } from '@react-google-maps/api'
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

export function AssetOverlay({ asset, zoom, selected, locked, interactive, onSelect, onStartInteraction, drawMode, onEraseAsset, onHover, map, onAssetUpdate }) {
  const ASSET_MIN_ZOOM = 13
  if (zoom < ASSET_MIN_ZOOM) return null
  
  const { widthPx, lengthPx, metersPerPixel: mpp } = getAssetSize(asset, zoom)
  const rotationDeg = asset.rotationDeg || 0
  const fillColor = asset.fillColor || asset.assetDef?.color || '#3d8ef8'
  const fillOpacity = asset.fillOpacity !== undefined ? asset.fillOpacity : 0.85
  const strokeColor = asset.strokeColor || asset.assetDef?.color || '#3d8ef8'
  const strokeWeight = asset.strokeWeight || 2
  const color = asset.assetDef?.color || '#3d8ef8'
  const baseAssetPx = Math.max(20, Math.min(widthPx, lengthPx))
  const statusDotSize = Math.max(8, Math.min(16, Math.round(baseAssetPx * 0.24)))
  const statusDotInset = Math.max(2, Math.round(statusDotSize * 0.24))
  const statusDotBorder = Math.max(1.5, Math.round(statusDotSize * 0.16))
  
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
        lat: latLng.lat(),
        lng: latLng.lng(),
      })
    }
  }, [])

  const onPointerUpFn = useCallback((e) => {
    if (!dragState.current) return
    try { e.target.releasePointerCapture(e.pointerId) } catch {}
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

    dragState.current = { type: 'move' }
    startCapture(e.target, e.pointerId)
    onSelect(asset)
  }, [interactive, locked, drawMode, asset, onSelect, startCapture])

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
                borderRadius: '16px',
                border: selected ? `${Math.max(2, strokeWeight + 1)}px solid #38bdf8` : `${Math.ceil(strokeWeight)}px solid ${strokeColor}`,
                background: selected ? `${fillColor}33` : hexToRgba(fillColor, fillOpacity),
                boxShadow: selected ? '0 0 0 1px rgba(255,255,255,0.8)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: !interactive || locked ? 'default' : 'grab',
                pointerEvents: !interactive || locked ? 'none' : 'auto',
                padding: 0,
                touchAction: 'none',
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
              <div style={{ position: 'absolute', top: '-34px', left: '50%', width: '2px', height: '24px', background: '#111827', transform: 'translateX(-50%)' }} />
              <button
                type="button"
                onPointerDown={handleRotatePointerDown}
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
                  touchAction: 'none',
                }}
              >
                R
              </button>
              {resizeHandles.map((handle) => (
                <button
                  key={handle.key}
                  type="button"
                  onPointerDown={(e) => handleResizePointerDown(e, handle)}
                  style={{
                    position: 'absolute',
                    width: '14px',
                    height: '14px',
                    borderRadius: '3px',
                    border: '2px solid #38bdf8',
                    background: '#ffffff',
                    cursor: handle.cursor,
                    padding: 0,
                    touchAction: 'none',
                    ...handle,
                  }}
                />
              ))}
            </>
          )}
          
          {/* Status indicator dot — scales with zoom/asset size like native map markers */}
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
        </div>
      </div>
    </OverlayView>
  )
}

export function FloorPlanOverlay({ floorPlan, selected, locked, onSelect, onStartInteraction, map }) {
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

export function AnnotationOverlay({ annotation, selected, locked, interactive, onSelect, onStartInteraction, onUpdate, drawMode = 'select', onEraseAsset, zoom, onHover }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftText, setDraftText] = useState(annotation.text || '')

  useEffect(() => {
    if (!isEditing) {
      setDraftText(annotation.text || '')
    }
  }, [annotation.id, annotation.text, isEditing])

  const isSelected = Boolean(selected)
  const zoomValue = Number(zoom || 15)
  const minVisibleZoom = isEditing ? 0 : 8

  if (!isSelected && zoomValue < minVisibleZoom) {
    return null
  }

  const pinLabel = String(annotation.label || annotation.text || 'Drop Pin').trim() || 'Drop Pin'
  const pinColor = annotation.pinColor || getStatusColor(annotation.status || 'planned') || '#ea4335'
  const textColor = annotation.color || '#202124'
  const fontSize = Math.max(12, Number(annotation.fontSize || 13))
  const fontWeight = Math.max(500, Number(annotation.fontWeight ?? 600))
  const selectedColor = '#1a73e8'
  const rawBackground = annotation.backgroundColor || 'rgba(255,255,255,0.96)'
  const rawBorder = annotation.borderColor || 'rgba(15,23,42,0.12)'
  const boxBackground = rawBackground === '#fff7d6' ? 'rgba(255,255,255,0.96)' : rawBackground
  const boxBorder = rawBorder === 'rgba(15,23,42,0.18)' ? 'rgba(15,23,42,0.12)' : rawBorder
  const boxBorderWidth = Math.max(1, Number(annotation.borderWidth ?? 1))
  const pinSize = isSelected ? 30 : 24
  const pinTailSize = Math.max(8, Math.round(pinSize * 0.4))

  const pinWrapperStyle = {
    position: 'relative',
    width: `${pinSize}px`,
    height: `${pinSize + pinTailSize + 4}px`,
    transform: 'translate(-50%, calc(-100% - 2px))',
    transformOrigin: 'bottom center',
    pointerEvents: interactive ? 'auto' : 'none',
  }

  const pinHeadStyle = {
    position: 'absolute',
    top: 0,
    left: '50%',
    width: `${pinSize}px`,
    height: `${pinSize}px`,
    borderRadius: '50%',
    background: pinColor,
    border: `2px solid ${isSelected ? selectedColor : '#ffffff'}`,
    boxShadow: isSelected ? '0 8px 18px rgba(26,115,232,0.22)' : '0 6px 14px rgba(15,23,42,0.18)',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const pinCenterStyle = {
    width: `${Math.max(10, Math.round(pinSize * 0.44))}px`,
    height: `${Math.max(10, Math.round(pinSize * 0.44))}px`,
    borderRadius: '50%',
    background: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: pinColor,
    fontSize: `${Math.max(8, Math.round(pinSize * 0.3))}px`,
    fontWeight: 800,
    lineHeight: 1,
  }

  const pinTailStyle = {
    position: 'absolute',
    left: '50%',
    bottom: '2px',
    width: `${pinTailSize}px`,
    height: `${pinTailSize}px`,
    background: pinColor,
    borderRight: `2px solid ${isSelected ? selectedColor : '#ffffff'}`,
    borderBottom: `2px solid ${isSelected ? selectedColor : '#ffffff'}`,
    transform: 'translateX(-50%) rotate(45deg)',
    borderRadius: '2px',
    boxSizing: 'border-box',
    boxShadow: '2px 2px 8px rgba(15,23,42,0.12)',
  }

  const selectedLabelStyle = {
    position: 'absolute',
    left: '50%',
    bottom: `${pinSize + pinTailSize + 8}px`,
    transform: 'translateX(-50%)',
    maxWidth: '220px',
    padding: '4px 8px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.96)',
    border: '1px solid rgba(15,23,42,0.08)',
    color: textColor,
    fontSize: `${fontSize}px`,
    fontWeight: 700,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    boxShadow: '0 6px 14px rgba(15,23,42,0.12)',
  }

  const editorStyle = {
    minWidth: '160px',
    maxWidth: '300px',
    padding: '10px 12px',
    borderRadius: `${Math.max(10, Number(annotation.borderRadius ?? 12))}px`,
    border: `${boxBorderWidth}px solid ${isSelected ? selectedColor : boxBorder}`,
    background: boxBackground,
    color: textColor,
    boxShadow: '0 10px 22px rgba(15,23,42,0.14)',
    transform: 'translate(-50%, calc(-100% - 12px))',
    transformOrigin: 'bottom center',
    backdropFilter: 'blur(6px)',
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

  const buttonStyle = {
    all: 'unset',
    display: 'block',
    cursor: !interactive || locked ? 'default' : drawMode === 'erase' ? 'not-allowed' : selected ? 'move' : 'pointer',
    pointerEvents: interactive ? 'auto' : 'none',
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
    <OverlayView
      position={{ lat: annotation.lat, lng: annotation.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={() => ({ x: 0, y: 0 })}
    >
      {isEditing ? (
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
      ) : (
        <button
          type="button"
          onClick={(event) => {
            if (!interactive) return
            event.stopPropagation()
            if (drawMode === 'erase') {
              onEraseAsset?.(annotation, 'annotation')
              return
            }
            onSelect(annotation)
          }}
          onDoubleClick={(event) => {
            if (!interactive || locked || drawMode !== 'select') return
            event.preventDefault()
            event.stopPropagation()
            onSelect(annotation)
            setIsEditing(true)
          }}
          onMouseDown={(event) => {
            if (isEditing || !selected || drawMode !== 'select') return
            interactive && !locked && onStartInteraction(event, annotation, 'move')
          }}
          onMouseOver={() => onHover?.({ type: 'annotation', data: annotation })}
          onMouseOut={() => onHover?.(null)}
          style={buttonStyle}
        >
          <div style={pinWrapperStyle}>
            {isSelected && <div style={selectedLabelStyle}>{pinLabel}</div>}
            <div style={pinHeadStyle}>
              <div style={pinCenterStyle}>{pinLabel.charAt(0).toUpperCase()}</div>
            </div>
            <div style={pinTailStyle} />
          </div>
        </button>
      )}
    </OverlayView>
  )
}

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
