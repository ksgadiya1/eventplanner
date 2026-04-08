import React, { useMemo } from 'react'
import { Polygon, OverlayView, Polyline } from '@react-google-maps/api'
import { getLinePatternIcons } from '../utils/mapGeometry'
import { formatDistance } from '../utils/units'

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

function getZoneBoundsCorner(path) {
  if (!path || path.length === 0) return null
  let maxLat = path[0].lat
  let maxLng = path[0].lng
  for (const point of path) {
    if (point.lat > maxLat) maxLat = point.lat
    if (point.lng > maxLng) maxLng = point.lng
  }
  return { lat: maxLat, lng: maxLng }
}

function MapLayers({
  layers,
  zones,
  assets,
  lines,
  annotations,
  selectedId,
  drawMode,
  hoveredLine,
  onSelect,
  onMouseUp,
  onDragEnd,
  onLoad,
  onUnmount,
  onLineMouseOver,
  onLineMouseMove,
  onLineMouseOut,
  mapZoom,
  measurementUnit = 'meters',
}) {

  return (
    <>
      {/* Zones */}
      {layers.zones?.visible && zones.map(zone => {
        const fillColor = zone.fillColor || zone.zoneType?.color || '#3d8ef8'
        const fillOpacity = zone.fillOpacity !== undefined ? zone.fillOpacity : (zone.zoneType?.fillOpacity || 0.2)
        const strokeColor = zone.strokeColor || zone.zoneType?.color || '#3d8ef8'
        const strokeWeight = zone.strokeWeight || 2
        
        return (
          <React.Fragment key={zone.id}>
            <Polygon
              key={`${zone.id}-${fillColor}-${fillOpacity}-${strokeColor}-${strokeWeight}`}
              paths={zone.path}
              options={{
                fillColor,
                fillOpacity: selectedId === zone.id ? 0.22 : fillOpacity,
                strokeColor: selectedId === zone.id ? '#38bdf8' : strokeColor,
                strokeWeight: selectedId === zone.id ? Math.max(strokeWeight + 1, 3) : strokeWeight,
                strokeOpacity: 1,
                editable: selectedId === zone.id && !layers.zones?.locked,
                draggable: selectedId === zone.id && !layers.zones?.locked,
                clickable: drawMode === 'select',
                zIndex: selectedId === zone.id ? 1 : 0,
              }}
              onClick={(event) => {
                if (drawMode !== 'select') return
                onSelect(zone)
              }}
              onMouseUp={() => onMouseUp(zone)}
              onDragEnd={() => onDragEnd(zone)}
              onLoad={(polygon) => {
                onLoad(zone.id, polygon)
                // Force update the style immediately
                if (polygon && window.google) {
                  polygon.setOptions({
                    fillColor,
                    fillOpacity: selectedId === zone.id ? 0.22 : fillOpacity,
                    strokeColor: selectedId === zone.id ? '#38bdf8' : strokeColor,
                    strokeWeight: selectedId === zone.id ? Math.max(strokeWeight + 1, 3) : strokeWeight,
                  })
                }
              }}
              onUnmount={() => onUnmount(zone.id)}
            />
            
            {/* Zone status indicator */}
            {getZoneBoundsCorner(zone.path) && (
              <OverlayView
                position={getZoneBoundsCorner(zone.path)}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={() => ({ x: 12, y: 12 })}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: getStatusColor(zone.status || 'planned'),
                    border: '3px solid white',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4), inset 0 0 0 2px rgba(255,255,255,0.6)',
                    pointerEvents: 'none',
                  }}
                />
              </OverlayView>
            )}
          </React.Fragment>
        )
      })}

      {/* Lines */}
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
            onMouseOver={onLineMouseOver}
            onMouseMove={onLineMouseMove}
            onMouseOut={onLineMouseOut}
            onLoad={(polyline) => onLoad(line.id, polyline)}
            onUnmount={() => onUnmount(line.id)}
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
                {line.label} · {formatDistance(line.lengthM, measurementUnit)}
              </div>
            </OverlayView>
          )}
        </React.Fragment>
      ))}
    </>
  )
}

export default React.memo(MapLayers)
