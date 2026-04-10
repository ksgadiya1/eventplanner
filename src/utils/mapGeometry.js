// Geometry and math utilities for map calculations
export function computeArea(polygon, google) {
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

export function metersPerPixel(lat, zoom) {
  const clampedLat = Math.max(-85, Math.min(85, lat || 0))
  return 156543.03392 * Math.cos(clampedLat * Math.PI / 180) / Math.pow(2, zoom || 0)
}

export function normalizeAngle(angle) {
  let normalized = angle % 360
  if (normalized < 0) normalized += 360
  return normalized
}

export function shortestAngleDelta(fromAngle, toAngle) {
  let delta = toAngle - fromAngle
  while (delta > 180) delta -= 360
  while (delta < -180) delta += 360
  return delta
}

export function projectScreenDelta(dx, dy, rotationDeg) {
  const radians = rotationDeg * Math.PI / 180
  return {
    localX: dx * Math.cos(radians) + dy * Math.sin(radians),
    localY: -dx * Math.sin(radians) + dy * Math.cos(radians),
  }
}

export function getAssetSize(asset, zoom) {
  const widthM = asset.widthM ?? asset.assetDef?.defaultWidth ?? 4
  const lengthM = asset.lengthM ?? asset.assetDef?.defaultLength ?? widthM
  const resolvedZoom = Number.isFinite(zoom) ? zoom : 15
  const scale = metersPerPixel(asset.lat, resolvedZoom)

  const smoothZoomFactor = Math.max(0, resolvedZoom - 10)
  const minSizePx = Math.max(12, Math.min(28, 12 + smoothZoomFactor * 2.6))

  return {
    widthM,
    lengthM,
    widthPx: Math.max(minSizePx, widthM / scale),
    lengthPx: Math.max(minSizePx, lengthM / scale),
    metersPerPixel: scale,
  }
}

export function latLngToContainerPoint(map, lat, lng) {
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

export function clientPointToLatLng(map, clientX, clientY) {
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

function deriveFloorPlacementFromBounds(bounds) {
  if (!bounds) return null

  const centerLat = (Number(bounds.north || 0) + Number(bounds.south || 0)) / 2
  const centerLng = (Number(bounds.east || 0) + Number(bounds.west || 0)) / 2
  const googleApi = window.google

  let widthM = 0
  let heightM = 0

  if (googleApi?.maps?.geometry?.spherical) {
    const westPoint = new googleApi.maps.LatLng(centerLat, Number(bounds.west || 0))
    const eastPoint = new googleApi.maps.LatLng(centerLat, Number(bounds.east || 0))
    const northPoint = new googleApi.maps.LatLng(Number(bounds.north || 0), centerLng)
    const southPoint = new googleApi.maps.LatLng(Number(bounds.south || 0), centerLng)

    widthM = googleApi.maps.geometry.spherical.computeDistanceBetween(westPoint, eastPoint)
    heightM = googleApi.maps.geometry.spherical.computeDistanceBetween(northPoint, southPoint)
  } else {
    const latScaleM = 111111
    const lngScaleM = 111111 * Math.max(0.000001, Math.cos(centerLat * Math.PI / 180))
    widthM = Math.abs(Number(bounds.east || 0) - Number(bounds.west || 0)) * lngScaleM
    heightM = Math.abs(Number(bounds.north || 0) - Number(bounds.south || 0)) * latScaleM
  }

  return {
    center: { lat: centerLat, lng: centerLng },
    widthM: Math.max(1, Number(widthM || 0)),
    heightM: Math.max(1, Number(heightM || 0)),
  }
}

export function buildFloorBoundsFromPlacement(floorPlan) {
  if (!floorPlan) return null

  const center = floorPlan.center
  const widthM = Number(floorPlan.widthM)
  const heightM = Number(floorPlan.heightM)
  const rotation = Number(floorPlan.rotation || 0)

  if (!Number.isFinite(center?.lat) || !Number.isFinite(center?.lng) || !Number.isFinite(widthM) || !Number.isFinite(heightM)) {
    return floorPlan.bounds || null
  }

  const googleApi = window.google
  const halfWidthM = Math.max(0.01, widthM / 2)
  const halfHeightM = Math.max(0.01, heightM / 2)

  if (googleApi?.maps?.geometry?.spherical) {
    const horizontalBearing = 90 + rotation
    const verticalBearing = 180 + rotation

    const movePoint = (origin, distanceM, bearing) => {
      if (!distanceM) return origin
      return googleApi.maps.geometry.spherical.computeOffset(origin, distanceM, bearing)
    }

    const buildCorner = (dx, dy) => {
      let point = new googleApi.maps.LatLng(center.lat, center.lng)
      point = movePoint(point, Math.abs(dx), dx >= 0 ? horizontalBearing : horizontalBearing + 180)
      point = movePoint(point, Math.abs(dy), dy >= 0 ? verticalBearing : verticalBearing + 180)
      return { lat: point.lat(), lng: point.lng() }
    }

    const corners = [
      buildCorner(-halfWidthM, -halfHeightM),
      buildCorner(halfWidthM, -halfHeightM),
      buildCorner(halfWidthM, halfHeightM),
      buildCorner(-halfWidthM, halfHeightM),
    ]

    return {
      north: Math.max(...corners.map(point => point.lat)),
      south: Math.min(...corners.map(point => point.lat)),
      east: Math.max(...corners.map(point => point.lng)),
      west: Math.min(...corners.map(point => point.lng)),
    }
  }

  const latDelta = halfHeightM / 111111
  const lngDelta = halfWidthM / (111111 * Math.max(0.000001, Math.cos(center.lat * Math.PI / 180)))

  return {
    north: center.lat + latDelta,
    south: center.lat - latDelta,
    east: center.lng + lngDelta,
    west: center.lng - lngDelta,
  }
}

export function normalizeFloorPlanState(floorPlan) {
  if (!floorPlan) return floorPlan

  const nextPlan = { ...floorPlan }
  const hasCenter = Number.isFinite(nextPlan.center?.lat) && Number.isFinite(nextPlan.center?.lng)
  const hasSize = Number.isFinite(Number(nextPlan.widthM)) && Number.isFinite(Number(nextPlan.heightM))

  if ((!hasCenter || !hasSize) && nextPlan.bounds) {
    const derived = deriveFloorPlacementFromBounds(nextPlan.bounds)
    if (derived) {
      nextPlan.center = derived.center
      nextPlan.widthM = Number(derived.widthM.toFixed(2))
      nextPlan.heightM = Number(derived.heightM.toFixed(2))
    }
  }

  if (nextPlan.center && Number.isFinite(Number(nextPlan.widthM)) && Number.isFinite(Number(nextPlan.heightM))) {
    nextPlan.bounds = buildFloorBoundsFromPlacement(nextPlan)
  }

  return nextPlan
}

export function isPointInsideFloorOverlay(map, floorPlan, clickPoint) {
  if (!map || !floorPlan) return false
  const geometry = getFloorGeometry(map, floorPlan)
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

export function formatDistance(meters) {
  if (!meters) return '0 m'
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${meters.toFixed(1)} m`
}

export function computeLineLength(path, google) {
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

export function computePolygonMetrics(path, google) {
  if (!google || !path || path.length < 2) return { areaM2: 0, perimeterM: 0 }
  const perimeterM = computeLineLength([...path, path[0]], google)
  const areaM2 = path.length >= 3 ? google.maps.geometry.spherical.computeArea(path) : 0
  return { areaM2, perimeterM }
}

export function extractPathFromOverlay(overlay) {
  return overlay?.getPath?.()?.getArray?.()?.map(point => ({
    lat: point.lat(),
    lng: point.lng(),
  })) || []
}

export function getContainingZones(point, zones, google) {
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

export function getDeepestParentZone(point, zones, google, excludedZoneId = null) {
  const matches = getContainingZones(point, zones.filter(zone => zone.id !== excludedZoneId), google)
  if (!matches.length) return null
  return matches.sort((a, b) => (a.areaM2 || Infinity) - (b.areaM2 || Infinity))[0]
}

export function getBoundsPreviewPath(points) {
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

export function getLinePatternIcons(pattern, color) {
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

export function getFloorGeometry(map, floorPlanOrBounds, passedZoom = null) {
  if (!map || !floorPlanOrBounds) return null

  const normalized = normalizeFloorPlanState(
    floorPlanOrBounds?.bounds ? floorPlanOrBounds : { bounds: floorPlanOrBounds, rotation: 0 }
  )

  const centerLat = Number(normalized.center?.lat)
  const centerLng = Number(normalized.center?.lng)
  const widthM = Number(normalized.widthM)
  const heightM = Number(normalized.heightM)
  const centerPoint = latLngToContainerPoint(map, centerLat, centerLng)

  if (!centerPoint || !Number.isFinite(widthM) || !Number.isFinite(heightM)) return null

  const zoom = Number.isFinite(passedZoom) ? passedZoom : (Number.isFinite(map.getZoom?.()) ? map.getZoom() : 15)
  const currentMetersPerPixel = metersPerPixel(centerLat, zoom)

  return {
    centerLat,
    centerLng,
    centerPoint,
    widthM,
    heightM,
    metersPerPixel: currentMetersPerPixel,
    widthPx: Math.max(1, widthM / currentMetersPerPixel),
    heightPx: Math.max(1, heightM / currentMetersPerPixel),
    bounds: normalized.bounds || null,
  }
}

export function clientRectToBounds(map, centerClient, widthPx, heightPx) {
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

export function localDeltaToScreen(deltaX, deltaY, rotationDeg) {
  const radians = rotationDeg * Math.PI / 180
  return {
    x: deltaX * Math.cos(radians) - deltaY * Math.sin(radians),
    y: deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
  }
}

export function buildViewportBounds(google, points) {
  if (!google || !points?.length) return null
  const bounds = new google.maps.LatLngBounds()
  points.forEach(point => bounds.extend(point))
  return bounds
}

export function computeContentBounds(google, { zones, assets, lines, annotations, floorPlan }) {
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

export function buildCirclePath(center, radiusM, google, steps = 256) {
  if (!google || !center) return []
  const origin = new google.maps.LatLng(center.lat, center.lng)
  return Array.from({ length: steps }, (_, idx) => {
    const angle = (idx * 360) / steps
    const point = google.maps.geometry.spherical.computeOffset(origin, radiusM, angle)
    return { lat: point.lat(), lng: point.lng() }
  })
}

export function buildSquarePath(center, halfSideM, google) {
  if (!google || !center) return []
  const origin = new google.maps.LatLng(center.lat, center.lng)
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

export function limitGridSlots(slots, maxPoints = 450) {
  if (!slots?.length || slots.length <= maxPoints) return slots || []
  const step = Math.ceil(slots.length / maxPoints)
  return slots.filter((_, index) => index % step === 0)
}

export function snapToGrid(lat, lng, gridSizeMeters) {
  const latStep = gridSizeMeters / 111111.0
  const lngStep = gridSizeMeters / (111111.0 * Math.cos(lat * Math.PI / 180))
  return {
    lat: Math.round(lat / latStep) * latStep,
    lng: Math.round(lng / lngStep) * lngStep,
  }
}

export function buildViewportGridLines(bounds, gridSizeMeters, limit = 500) {
  if (!bounds || !gridSizeMeters) return []

  const north = bounds.getNorthEast().lat()
  const south = bounds.getSouthWest().lat()
  const east = bounds.getNorthEast().lng()
  const west = bounds.getSouthWest().lng()

  // Midpoint latitude for average longitude spacing
  const midLat = (north + south) / 2
  const latStep = gridSizeMeters / 111111.0
  const lngStep = gridSizeMeters / (111111.0 * Math.cos(midLat * Math.PI / 180))

  const startLat = Math.floor(south / latStep) * latStep
  const endLat = Math.ceil(north / latStep) * latStep
  const startLng = Math.floor(west / lngStep) * lngStep
  const endLng = Math.ceil(east / lngStep) * lngStep

  const lines = []

  // Check bounds limits to avoid freezing the browser when zoomed out
  const latCount = Math.floor((endLat - startLat) / latStep)
  const lngCount = Math.floor((endLng - startLng) / lngStep)

  if (latCount + lngCount > limit) return lines // Too zoomed out to draw detailed grid

  // Horizontal lines
  for (let lat = startLat; lat <= endLat + latStep / 2; lat += latStep) {
    lines.push([
      { lat, lng: west },
      { lat, lng: east }
    ])
  }

  // Vertical lines
  for (let lng = startLng; lng <= endLng + lngStep / 2; lng += lngStep) {
    lines.push([
      { lat: south, lng },
      { lat: north, lng }
    ])
  }

  return lines
}
