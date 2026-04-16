import React, { useEffect, useState } from 'react'
import { MarkerF, OverlayView } from '@react-google-maps/api'
import AssetGlyph from './AssetGlyph'
import { getAssetSize, metersPerPixel, getFloorGeometry, buildRectanglePath, getPathCenter, getRectangleZoneDimensions } from '../utils/mapGeometry'

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

export const AssetOverlay = React.memo(function AssetOverlay({
  asset, zoom, selected, locked, interactive, onSelect,
  drawMode, onEraseAsset, onHover, map, onStartInteraction, refreshTick = 0,
}) {
  const ASSET_MIN_ZOOM = 11
  const liveZoom = Number.isFinite(map?.getZoom?.()) ? map.getZoom() : (Number.isFinite(zoom) ? zoom : 15)
  if (liveZoom < ASSET_MIN_ZOOM) return null

  const { widthPx, lengthPx } = getAssetSize(asset, liveZoom)
  const rotationDeg = asset.rotationDeg || 0
  const color = asset.assetDef?.color || '#3d8ef8'
  const fillColor = asset.fillColor || color
  const fillOpacity = asset.fillOpacity !== undefined ? asset.fillOpacity : 0.85
  const strokeColor = asset.strokeColor || color
  const strokeWeight = asset.strokeWeight || 2
  const shortSide = Math.max(18, Math.min(widthPx, lengthPx))
  const cornerRadius = Math.max(6, Math.min(14, Math.round(shortSide * 0.14)))
  const statusDotSize = Math.max(7, Math.min(14, Math.round(shortSide * 0.22)))
  const resizeHandles = [
    { key: 'nw', left: '-7px', top: '-7px', cursor: 'nwse-resize', xSign: -1, ySign: -1 },
    { key: 'ne', right: '-7px', top: '-7px', cursor: 'nesw-resize', xSign: 1, ySign: -1 },
    { key: 'sw', left: '-7px', bottom: '-7px', cursor: 'nesw-resize', xSign: -1, ySign: 1 },
    { key: 'se', right: '-7px', bottom: '-7px', cursor: 'nwse-resize', xSign: 1, ySign: 1 },
  ]

  if (!selected && liveZoom <= 13.5 && window.google?.maps) {
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
        label={{ text: String(asset.label || asset.assetDef?.name || 'A').charAt(0).toUpperCase(), color: '#ffffff', fontWeight: '700', fontSize: '10px' }}
        zIndex={450}
        options={{ clickable: interactive, cursor: drawMode === 'erase' ? 'not-allowed' : 'pointer', optimized: true }}
        onClick={(e) => {
          if (!interactive) return
          e?.domEvent?.stopPropagation?.()
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

  return (
    <OverlayView
      key={`asset-${asset.id}-${refreshTick}`}
      position={{ lat: asset.lat, lng: asset.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={() => ({ x: -Math.round(widthPx / 2), y: -Math.round(lengthPx / 2) })}
    >
      <div style={{ width: `${widthPx}px`, height: `${lengthPx}px`, position: 'relative', pointerEvents: 'auto', zIndex: 12 }}>
        <div style={{ position: 'absolute', inset: 0, transform: `rotate(${rotationDeg}deg)`, transformOrigin: 'center center' }}>
          <button
            type="button"
            onMouseDown={(event) => !locked && onStartInteraction?.(event, asset, 'move')}
            onPointerDown={(event) => !locked && onStartInteraction?.(event, asset, 'move')}
            onClick={(e) => {
              if (!interactive) return
              e.stopPropagation()
              if (drawMode === 'erase') {
                onEraseAsset?.(asset)
                return
              }
              onSelect(asset)
            }}
            onMouseOver={() => onHover?.({ type: 'asset', data: asset })}
            onMouseOut={() => onHover?.(null)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              borderRadius: `${cornerRadius}px`,
              border: selected ? '2px solid #38bdf8' : `${strokeWeight}px solid ${strokeColor}`,
              background: selected ? `${fillColor}33` : `${fillColor}${Math.round(fillOpacity * 255).toString(16).padStart(2, '0')}`,
              boxShadow: selected ? '0 0 0 1px rgba(255,255,255,0.8)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: !interactive || locked ? 'default' : drawMode === 'erase' ? 'not-allowed' : 'move',
              pointerEvents: !interactive || locked ? 'none' : 'auto',
              padding: 0,
              boxSizing: 'border-box',
            }}
          >
            <div style={{
              width: `${shortSide * 0.52}px`,
              height: `${shortSide * 0.52}px`,
              borderRadius: '999px',
              background: '#fff',
              border: `2px solid ${color}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(15,23,42,0.18)',
              pointerEvents: 'none',
            }}>
              <AssetGlyph asset={asset.assetDef} size={Math.max(8, shortSide * 0.26)} color={asset.assetDef?.iconColor || color} />
            </div>
          </button>

          {!selected && (
            <div style={{
              position: 'absolute',
              bottom: '3px',
              right: '3px',
              width: `${statusDotSize}px`,
              height: `${statusDotSize}px`,
              borderRadius: '50%',
              backgroundColor: getStatusColor(asset.status || 'planned'),
              border: '2px solid white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              pointerEvents: 'none',
              zIndex: 13,
            }} />
          )}

          {selected && interactive && !locked && (
            <>
              <div style={{ position: 'absolute', top: '-34px', left: '50%', width: '2px', height: '24px', background: '#111827', transform: 'translateX(-50%)' }} />
              <button
                type="button"
                onMouseDown={(event) => onStartInteraction?.(event, asset, 'rotate')}
                onPointerDown={(event) => onStartInteraction?.(event, asset, 'rotate')}
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
                  onMouseDown={(event) => onStartInteraction?.(event, asset, 'resize', handle)}
                  onPointerDown={(event) => onStartInteraction?.(event, asset, 'resize', handle)}
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
})
/**
 * High-performance interaction layer for floor plans.
 * Provides a native-synced selection border, move area, and resize handles.
 */
const FloorPlanNativeInteraction = React.memo(function FloorPlanNativeInteraction({
  floorPlan, locked, onSelect, onStartInteraction, map, geometry
}) {
  useEffect(() => {
    if (!map || !floorPlan || !window.google) return

    const overlay = new window.google.maps.OverlayView()
    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.pointerEvents = 'none'
    container.style.zIndex = '1000'

    // Selection border and move area
    const selection = document.createElement('button')
    selection.type = 'button'
    selection.style.position = 'absolute'
    selection.style.border = '2px solid #38bdf8'
    selection.style.background = 'transparent'
    selection.style.cursor = locked ? 'default' : 'move'
    selection.style.borderRadius = '14px'
    selection.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.92)'
    selection.style.pointerEvents = 'auto'
    selection.style.padding = '0'
    selection.style.outline = 'none'

    selection.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      if (!locked) onStartInteraction(e, floorPlan, 'move')
    })
    selection.addEventListener('click', (e) => {
      e.stopPropagation()
      onSelect({ ...floorPlan, type: 'floor' })
    })

    container.appendChild(selection)

    // Rotate handle
    const rotateLine = document.createElement('div')
    rotateLine.style.position = 'absolute'
    rotateLine.style.width = '2px'
    rotateLine.style.height = '24px'
    rotateLine.style.background = '#111827'
    rotateLine.style.transform = 'translateX(-50%)'

    const rotateBtn = document.createElement('button')
    rotateBtn.type = 'button'
    rotateBtn.innerText = 'R'
    rotateBtn.style.position = 'absolute'
    rotateBtn.style.transform = 'translateX(-50%)'
    rotateBtn.style.width = '26px'
    rotateBtn.style.height = '26px'
    rotateBtn.style.borderRadius = '50%'
    rotateBtn.style.border = '2px solid #38bdf8'
    rotateBtn.style.background = '#ffffff'
    rotateBtn.style.color = '#0f172a'
    rotateBtn.style.fontSize = '13px'
    rotateBtn.style.fontWeight = '700'
    rotateBtn.style.cursor = 'grab'
    rotateBtn.style.pointerEvents = 'auto'
    rotateBtn.style.padding = '0'

    rotateBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      onStartInteraction(e, floorPlan, 'rotate')
    })

    container.appendChild(rotateLine)
    container.appendChild(rotateBtn)

    // Resize handles
    const handleKeys = ['nw', 'ne', 'se', 'sw']
    const signs = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }]
    const cursors = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize']

    const handles = handleKeys.map((key, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.style.position = 'absolute'
      btn.style.width = '16px'
      btn.style.height = '16px'
      btn.style.borderRadius = '4px'
      btn.style.border = '2px solid #38bdf8'
      btn.style.background = '#ffffff'
      btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)'
      btn.style.cursor = cursors[i]
      btn.style.pointerEvents = 'auto'
      btn.style.padding = '0'

      btn.addEventListener('mousedown', (e) => {
        e.stopPropagation()
        onStartInteraction(e, floorPlan, 'resize', {
          key,
          xSign: signs[i].x,
          ySign: signs[i].y
        })
      })

      container.appendChild(btn)
      return btn
    })

    overlay.onAdd = function () {
      this.getPanes().overlayMouseTarget.appendChild(container)
    }

    overlay.draw = function () {
      const projection = this.getProjection()
      if (!projection) return

      const rotation = floorPlan.rotation || 0
      const center = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(geometry.centerLat, geometry.centerLng))
      if (!center) return

      // Update main selection area
      selection.style.width = `${geometry.widthPx}px`
      selection.style.height = `${geometry.heightPx}px`
      selection.style.left = `${center.x - geometry.widthPx / 2}px`
      selection.style.top = `${center.y - geometry.heightPx / 2}px`
      selection.style.transform = `rotate(${rotation}deg)`

      // Calculate path vertices locally to position handles accurately
      const path = buildRectanglePath(
        { lat: geometry.centerLat, lng: geometry.centerLng },
        (floorPlan.widthM || 10) / 2,
        (floorPlan.lengthM || floorPlan.heightM || 10) / 2,
        window.google,
        rotation
      )

      path.forEach((vertex, i) => {
        const p = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(vertex.lat, vertex.lng))
        if (p) {
          handles[i].style.left = `${p.x - 8}px`
          handles[i].style.top = `${p.y - 8}px`
        }
      })

      // Position rotation handle above center
      const angleRad = (rotation - 90) * Math.PI / 180
      const distPx = (geometry.heightPx / 2) + 40
      const rotX = center.x + Math.cos(angleRad) * distPx
      const rotY = center.y + Math.sin(angleRad) * distPx

      rotateLine.style.left = `${center.x + Math.cos(angleRad) * (geometry.heightPx / 2)}px`
      rotateLine.style.top = `${center.y + Math.sin(angleRad) * (geometry.heightPx / 2)}px`
      rotateLine.style.height = `40px`
      rotateLine.style.transform = `rotate(${rotation}deg)`
      rotateLine.style.transformOrigin = 'top center'

      rotateBtn.style.left = `${rotX}px`
      rotateBtn.style.top = `${rotY}px`
    }

    overlay.onRemove = function () {
      if (container.parentNode) container.parentNode.removeChild(container)
    }

    overlay.setMap(map)
    return () => overlay.setMap(null)
  }, [floorPlan, locked, onSelect, onStartInteraction, map, geometry])

  return null
})

export const FloorPlanOverlay = React.memo(function FloorPlanOverlay({ floorPlan, selected, locked, onSelect, onStartInteraction, map, zoom, refreshTick = 0 }) {
  const geometry = getFloorGeometry(map, floorPlan, zoom)
  if (!geometry) return null
  const rotation = floorPlan.rotation || 0
  const floorImages = Array.isArray(floorPlan.imageUrls) && floorPlan.imageUrls.length
    ? floorPlan.imageUrls
    : (floorPlan.imageUrl ? [floorPlan.imageUrl] : [])
  const primaryImage = floorImages[0] || ''
  const perImageOpacity = floorPlan.opacity ?? 0.7
  const resizeHandles = [
    { key: 'nw', left: '-8px', top: '-8px', cursor: 'nwse-resize', xSign: -1, ySign: -1 },
    { key: 'ne', right: '-8px', top: '-8px', cursor: 'nesw-resize', xSign: 1, ySign: -1 },
    { key: 'sw', left: '-8px', bottom: '-8px', cursor: 'nesw-resize', xSign: -1, ySign: 1 },
    { key: 'se', right: '-8px', bottom: '-8px', cursor: 'nwse-resize', xSign: 1, ySign: 1 },
  ]

  return (
    <>
      <OverlayView
        key={`floor-image-${floorPlan.id}-${refreshTick}`}
        position={{ lat: geometry.centerLat, lng: geometry.centerLng }}
        mapPaneName={OverlayView.OVERLAY_LAYER}
        getPixelPositionOffset={() => ({ x: -Math.round(geometry.widthPx / 2), y: -Math.round(geometry.heightPx / 2) })}
      >
        <div style={{ width: `${geometry.widthPx}px`, height: `${geometry.heightPx}px`, position: 'relative', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, transform: `rotate(${rotation}deg)`, transformOrigin: 'center center' }}>
            {primaryImage && (
              <img
                src={primaryImage}
                alt="Floor plan"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                  display: 'block',
                  opacity: perImageOpacity,
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        </div>
      </OverlayView>

      {selected && (
        <FloorPlanNativeInteraction
          floorPlan={floorPlan}
          locked={locked}
          onSelect={onSelect}
          onStartInteraction={onStartInteraction}
          map={map}
          geometry={geometry}
        />
      )}
    </>
  )
})

// ─── Annotation Overlay ───────────────────────────────────────────────────────
export const AnnotationOverlay = React.memo(function AnnotationOverlay({ annotation, selected, locked, interactive, onSelect, onStartInteraction, onUpdate, drawMode = 'select', onEraseAsset, zoom, onHover, refreshTick = 0 }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftText, setDraftText] = useState(annotation.text || '')
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => { if (!isEditing) setDraftText(annotation.text || '') }, [annotation.id, annotation.text, isEditing])

  const zoomValue = Number(zoom || 15)
  if (!selected && zoomValue < 10) return null

  const pinColor = annotation.pinColor || '#ea4335'
  const textColor = annotation.color || '#202124'
  const fontSize = Math.max(12, Number(annotation.fontSize || 13))
  const markerScale = selected ? 1.18 : zoomValue >= 17 ? 0.96 : zoomValue >= 15 ? 0.88 : zoomValue >= 13 ? 0.78 : 0.68
  const useCompact = !selected && !isEditing && zoomValue < 13
  const markerIsDraggable = interactive && !locked && drawMode === 'select' && !isEditing
  const pinLabel = String(annotation.label || annotation.text || 'Note').trim()

  const markerIcon = window.google?.maps ? (useCompact ? {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: pinColor, fillOpacity: 0.95, strokeColor: '#fff', strokeWeight: 2,
    scale: zoomValue < 12 ? 4 : 5, anchor: new window.google.maps.Point(0, 0),
  } : {
    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
    fillColor: pinColor, fillOpacity: 1,
    strokeColor: selected ? '#1a73e8' : '#fff', strokeWeight: selected ? 2 : 1.5,
    scale: markerScale, anchor: new window.google.maps.Point(12, 24),
    labelOrigin: new window.google.maps.Point(12, 9),
  }) : undefined

  const saveDraft = () => {
    const text = String(draftText || '').trimEnd() || 'New annotation'
    setIsEditing(false)
    if (text === (annotation.text || '')) return
    onUpdate?.({ ...annotation, text, label: text })
  }

  return (
    <>
      <MarkerF
        key={`annotation-marker-${annotation.id}-${refreshTick}`}
        position={{ lat: annotation.lat, lng: annotation.lng }}
        title={pinLabel}
        icon={markerIcon}
        label={useCompact ? undefined : { text: pinLabel.charAt(0).toUpperCase(), color: '#fff', fontWeight: '700', fontSize: `${Math.max(8, Math.round(9 * markerScale))}px` }}
        draggable={markerIsDraggable}
        zIndex={selected ? 900 : 500}
        options={{ clickable: interactive, cursor: !interactive || locked ? 'default' : markerIsDraggable ? 'grab' : 'pointer', optimized: true }}
        onClick={(e) => { if (!interactive) return; e?.domEvent?.stopPropagation?.(); if (drawMode === 'erase') { onEraseAsset?.(annotation, 'annotation'); return; } onSelect(annotation) }}
        onDblClick={(e) => { if (!interactive || locked || drawMode !== 'select') return; e?.domEvent?.preventDefault?.(); onSelect(annotation); setIsEditing(true) }}
        onDragEnd={(e) => { const lat = e.latLng?.lat?.(), lng = e.latLng?.lng?.(); if (Number.isFinite(lat) && Number.isFinite(lng)) onUpdate?.({ ...annotation, lat, lng }) }}
        onMouseOver={() => { setIsHovered(true); onHover?.({ type: 'annotation', data: annotation }) }}
        onMouseOut={() => { setIsHovered(false); onHover?.(null) }}
      />

      {!isHovered && !isEditing && !useCompact && (zoomValue >= 15 || selected) && (
        <OverlayView position={{ lat: annotation.lat, lng: annotation.lng }} mapPaneName={OverlayView.FLOAT_PANE} getPixelPositionOffset={() => ({ x: 0, y: 0 })}>
          <div style={{ position: 'relative', width: 0, height: 0, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: '50%', bottom: '26px', transform: 'translateX(-50%)', display: 'inline-flex', alignItems: 'center', maxWidth: '180px', padding: '3px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.96)', color: '#0f172a', fontSize: `${Math.max(11, fontSize - 1)}px`, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', boxShadow: '0 4px 12px rgba(15,23,42,0.12)', border: '1px solid rgba(15,23,42,0.08)' }}>{pinLabel}</div>
          </div>
        </OverlayView>
      )}

      {isEditing && (
        <OverlayView position={{ lat: annotation.lat, lng: annotation.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET} getPixelPositionOffset={() => ({ x: 0, y: 0 })}>
          <div style={{ minWidth: '160px', maxWidth: '300px', padding: '10px 12px', borderRadius: '12px', border: `1px solid #1a73e8`, background: '#fff', color: textColor, boxShadow: '0 10px 22px rgba(15,23,42,0.14)', transform: 'translate(-50%, calc(-100% - 18px))', position: 'relative', cursor: 'text' }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <textarea autoFocus value={draftText} onChange={(e) => setDraftText(e.target.value)} onBlur={saveDraft} onKeyDown={(e) => { if (e.key === 'Escape') { setDraftText(annotation.text || ''); setIsEditing(false) } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveDraft() } }} style={{ width: '100%', minHeight: '72px', border: 'none', outline: 'none', resize: 'vertical', background: 'transparent', color: textColor, fontSize: `${fontSize}px`, fontWeight: 600, lineHeight: 1.45, fontFamily: 'inherit' }} />
            <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.6 }}>Ctrl+Enter to save</div>
          </div>
        </OverlayView>
      )}
    </>
  )
})

// ─── Measurement Overlay ──────────────────────────────────────────────────────
export function MeasurementOverlay({ screenPosition, text }) {
  if (!screenPosition || !text) return null
  return (
    <div style={{ position: 'absolute', left: `${screenPosition.x + 14}px`, top: `${screenPosition.y - 44}px`, background: '#fff7d6', color: '#111827', border: '2px solid #f59e0b', borderRadius: '10px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 10px 24px rgba(0,0,0,0.28)', pointerEvents: 'none', zIndex: 20 }}>
      {text}
    </div>
  )
}


// ─── Zone Overlay ─────────────────────────────────────────────────────────────

/**
 * Custom overlay for rectangular zones to provide constrained native-looking handles.
 * Google's native Polygon editor always shows midpoints and allows diagonal distortion,
 * which this component prevents by only showing vertex handles and using buildRectanglePath.
 */
export const ZoneOverlay = React.memo(function ZoneOverlay({ zone, selected, locked, onStartInteraction, map, zoom }) {
  const [handleElements, setHandleElements] = useState([])

  useEffect(() => {
    if (!selected || locked || !map || zone.shapeType !== 'rectangle' || !zone.path || zone.path.length < 4) {
      setHandleElements([])
      return
    }

    const handleKeys = ['nw', 'ne', 'se', 'sw']
    const signs = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ]

    const overlay = new window.google.maps.OverlayView()
    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.pointerEvents = 'none'
    container.style.zIndex = '1000'

    const buttons = zone.path.slice(0, 4).map((vertex, index) => {
      const btn = document.createElement('button')
      btn.style.position = 'absolute'
      btn.style.width = '10px'
      btn.style.height = '10px'
      btn.style.backgroundColor = '#ffffff'
      btn.style.border = '1px solid #38bdf8'
      btn.style.borderRadius = '0px'
      btn.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.5), 0 2px 5px rgba(0,0,0,0.2)'
      btn.style.pointerEvents = 'auto'
      btn.style.cursor = index === 0 || index === 2 ? 'nwse-resize' : 'nesw-resize'
      btn.style.padding = '0'
      btn.style.outline = 'none'

      const startInteraction = (e) => {
        e.stopPropagation()
        onStartInteraction(e, zone, 'resize', {
          key: handleKeys[index],
          xSign: signs[index].x,
          ySign: signs[index].y,
        })
      }

      btn.addEventListener('mousedown', startInteraction)
      btn.addEventListener('touchstart', (e) => {
        // Simple touch to mouse event bridge if needed, but onStartInteraction should handle it
        startInteraction(e)
      }, { passive: false })

      container.appendChild(btn)
      return { btn, vertex }
    })

    overlay.onAdd = function () {
      this.getPanes().overlayMouseTarget.appendChild(container)
    }

    overlay.draw = function () {
      const projection = this.getProjection()
      if (!projection) return

      buttons.forEach(({ btn, vertex }) => {
        const point = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(vertex.lat, vertex.lng))
        if (point) {
          btn.style.left = `${point.x - 5}px`
          btn.style.top = `${point.y - 5}px`
        }
      })
    }

    overlay.onRemove = function () {
      if (container.parentNode) {
        container.parentNode.removeChild(container)
      }
    }

    overlay.setMap(map)

    return () => {
      overlay.setMap(null)
    }
  }, [zone, selected, locked, map, onStartInteraction])

  return null
})
