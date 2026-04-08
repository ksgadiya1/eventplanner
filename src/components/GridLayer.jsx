import { useEffect, useRef, memo } from 'react'

/**
 * GridLayer renders a lightweight canvas-based grid overlay on the map.
 * Uses a single OverlayView with an HTML canvas.
 *
 * KEY DESIGN: All drawing happens inside the native OverlayView `draw()`
 * callback, which Google Maps calls synchronously during its own render
 * cycle.  This keeps the grid perfectly in sync with panning / zooming —
 * no React useEffect lag.
 */
function GridLayer({ map, visible, size = 3, opacity = 0.15, color = '#3d8ef8' }) {
  const overlayRef = useRef(null)
  const canvasRef = useRef(null)

  // Keep the latest props in a ref so the native `draw()` always reads
  // up-to-date values without needing a React re-render.
  const propsRef = useRef({ visible, size, opacity, color })
  propsRef.current = { visible, size, opacity, color }

  useEffect(() => {
    if (!map || !window.google) return

    const canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.pointerEvents = 'none'
    canvas.style.willChange = 'transform'
    canvasRef.current = canvas

    const overlay = new window.google.maps.OverlayView()

    overlay.onAdd = function () {
      this.getPanes().overlayLayer.appendChild(canvas)
    }

    overlay.onRemove = function () {
      canvas.parentNode?.removeChild(canvas)
    }

    // ── This is where all drawing happens ──
    // Google Maps calls draw() every time it re-renders (pan, zoom, resize).
    overlay.draw = function () {
      const projection = this.getProjection()
      if (!projection) return

      const { visible: vis, size: rawCellM, opacity: alpha, color: stroke } = propsRef.current

      if (!vis) {
        canvas.style.display = 'none'
        return
      }
      canvas.style.display = ''

      const bounds = map.getBounds()
      const zoom = map.getZoom()
      if (!bounds || typeof zoom !== 'number') return

      // Compute cell size in pixels and adapt when zoomed out so the grid remains visible.
      const centerLat = (bounds.getNorthEast().lat() + bounds.getSouthWest().lat()) / 2
      const mpp = 156543.03392 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, zoom)
      let cellM = Math.max(1, Number(rawCellM) || 10)
      let cellPx = cellM / mpp

      while (cellPx < 14) {
        cellM *= 2
        cellPx = cellM / mpp
        if (cellM > 5000) break
      }

      const north = bounds.getNorthEast().lat()
      const south = bounds.getSouthWest().lat()
      const east = bounds.getNorthEast().lng()
      const west = bounds.getSouthWest().lng()
      const midLat = (north + south) / 2
      let latStep = cellM / 111111.0
      let lngStep = cellM / (111111.0 * Math.cos(midLat * Math.PI / 180))

      // Pixel coordinates of viewport corners (div-pixel space)
      const sw = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(south, west))
      const ne = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(north, east))
      if (!sw || !ne) return

      const left = Math.floor(Math.min(sw.x, ne.x))
      const top = Math.floor(Math.min(sw.y, ne.y))
      const width = Math.ceil(Math.abs(ne.x - sw.x))
      const height = Math.ceil(Math.abs(ne.y - sw.y))

      // Limit total lines to prevent hanging, but prefer coarsening instead of disappearing.
      let latCount = Math.ceil((north - south) / latStep)
      let lngCount = Math.ceil((east - west) / lngStep)
      while (latCount + lngCount > 300) {
        latStep *= 2
        lngStep *= 2
        latCount = Math.ceil((north - south) / latStep)
        lngCount = Math.ceil((east - west) / lngStep)
        if (latStep > 10 || lngStep > 10) break
      }

      // Size and position the canvas to exactly cover the viewport
      canvas.width = width
      canvas.height = height
      canvas.style.left = left + 'px'
      canvas.style.top = top + 'px'
      canvas.style.width = width + 'px'
      canvas.style.height = height + 'px'

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, width, height)
      ctx.strokeStyle = stroke
      ctx.globalAlpha = alpha
      ctx.lineWidth = 1

      // Batch all lines into a single path → single stroke call
      ctx.beginPath()

      // Horizontal lines (constant lat)
      const startLat = Math.floor(south / latStep) * latStep
      for (let lat = startLat; lat <= north + latStep / 2; lat += latStep) {
        const pt = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(lat, west))
        if (!pt) continue
        const y = Math.round(pt.y - top) + 0.5
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
      }

      // Vertical lines (constant lng)
      const startLng = Math.floor(west / lngStep) * lngStep
      for (let lng = startLng; lng <= east + lngStep / 2; lng += lngStep) {
        const pt = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(south, lng))
        if (!pt) continue
        const x = Math.round(pt.x - left) + 0.5
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
      }

      ctx.stroke()
    }

    overlay.setMap(map)
    overlayRef.current = overlay

    return () => {
      overlay.setMap(null)
      overlayRef.current = null
      canvasRef.current = null
    }
  }, [map])

  // When React props change (visibility toggle, grid size slider, etc.)
  // we just need to trigger a redraw. Google Maps will call draw() for us.
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    // Force Google Maps to call draw() with the latest prop values.
    // propsRef is already updated at the top of this component.
    if (overlay.getMap()) {
      overlay.draw()
    }
  }, [visible, size, opacity, color])

  return null
}

export default memo(GridLayer)
