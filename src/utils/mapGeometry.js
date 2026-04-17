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
  // Using the precise Earth radius used by Google Maps (WGS84)
  return 156543.033928 * Math.cos(clampedLat * Math.PI / 180) / Math.pow(2, zoom || 0)
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

export function latLngToContainerPoint(map, lat, lng, passedZoom = null) {
  const projection = map?.getProjection?.()
  const center = map?.getCenter?.()
  const mapDiv = map?.getDiv?.()
  const googleApi = window.google
  if (!projection || !center || !mapDiv || !googleApi) return null

  let resolvedLat = lat
  let resolvedLng = lng
  if (lat && typeof lat === 'object' && Number.isFinite(Number(lat.lat)) && Number.isFinite(Number(lat.lng)) && lng === undefined) {
    resolvedLat = lat.lat
    resolvedLng = lat.lng
  }
  if (!Number.isFinite(Number(resolvedLat)) || !Number.isFinite(Number(resolvedLng))) return null

  const zoom = passedZoom !== null ? Number(passedZoom) : Number(map.getZoom?.() || 0)
  if (!Number.isFinite(zoom)) return null

  const scale = Math.pow(2, zoom)
  const worldPoint = projection.fromLatLngToPoint(new googleApi.maps.LatLng(Number(resolvedLat), Number(resolvedLng)))
  const centerWorldPoint = projection.fromLatLngToPoint(center)
  if (!worldPoint || !centerWorldPoint) return null

  const width = mapDiv.clientWidth || mapDiv.offsetWidth || 0
  const height = mapDiv.clientHeight || mapDiv.offsetHeight || 0
  if (width <= 0 || height <= 0) return null

  return {
    x: (worldPoint.x - centerWorldPoint.x) * scale + width / 2,
    y: (worldPoint.y - centerWorldPoint.y) * scale + height / 2,
  }
}

export function clientPointToLatLng(map, clientX, clientY) {
  const projection = map?.getProjection?.()
  const center = map?.getCenter?.()
  const mapDiv = map?.getDiv?.()
  const googleApi = window.google
  if (!projection || !center || !mapDiv || !googleApi) return null

  const rect = mapDiv.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top

  const zoom = Number(map.getZoom?.())
  if (!Number.isFinite(zoom)) return null
  const scale = Math.pow(2, zoom)

  const width = mapDiv.clientWidth || mapDiv.offsetWidth || 0
  const height = mapDiv.clientHeight || mapDiv.offsetHeight || 0
  if (width <= 0 || height <= 0) return null

  const centerWorldPoint = projection.fromLatLngToPoint(center)
  if (!centerWorldPoint) return null

  const worldPoint = new googleApi.maps.Point(
    centerWorldPoint.x + (x - width / 2) / scale,
    centerWorldPoint.y + (y - height / 2) / scale
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

export function getPathCentroid(path) {
  if (!Array.isArray(path) || !path.length) return null
  const totals = path.reduce((sum, point) => ({
    lat: sum.lat + Number(point?.lat || 0),
    lng: sum.lng + Number(point?.lng || 0),
  }), { lat: 0, lng: 0 })

  return {
    lat: totals.lat / path.length,
    lng: totals.lng / path.length,
  }
}

function isValidLatLng(point) {
  return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng))
}

function buildOffsetFromAnchor(anchor, point, google) {
  const spherical = google?.maps?.geometry?.spherical
  if (!spherical || !isValidLatLng(anchor) || !isValidLatLng(point)) return null

  const anchorLatLng = new google.maps.LatLng(anchor.lat, anchor.lng)
  const pointLatLng = new google.maps.LatLng(point.lat, point.lng)

  return {
    distanceM: spherical.computeDistanceBetween(anchorLatLng, pointLatLng),
    headingDeg: spherical.computeHeading(anchorLatLng, pointLatLng),
  }
}

function rebuildPointFromOffset(anchor, offset, google) {
  const spherical = google?.maps?.geometry?.spherical
  if (!spherical || !isValidLatLng(anchor)) return null

  const distanceM = Number(offset?.distanceM)
  const headingDeg = Number(offset?.headingDeg)
  if (!Number.isFinite(distanceM) || !Number.isFinite(headingDeg)) return null

  const point = spherical.computeOffset(
    new google.maps.LatLng(anchor.lat, anchor.lng),
    distanceM,
    headingDeg
  )

  return { lat: point.lat(), lng: point.lng() }
}

export function getZoneAnchor(zone) {
  if (isValidLatLng(zone?.center)) return { lat: Number(zone.center.lat), lng: Number(zone.center.lng) }
  return getPathCentroid(zone?.path || [])
}

export function serializeZoneTemplateGeometry(zone, google) {
  if (!google || !zone) return null

  const anchor = getZoneAnchor(zone)
  if (!anchor) return null

  const pathOffsets = Array.isArray(zone.path)
    ? zone.path
      .map(point => buildOffsetFromAnchor(anchor, point, google))
      .filter(Boolean)
    : []

  const centerOffset = isValidLatLng(zone.center)
    ? buildOffsetFromAnchor(anchor, zone.center, google)
    : null

  return {
    anchor,
    pathOffsets,
    centerOffset,
    shapeType: zone.shapeType || 'polygon',
    radiusM: Number.isFinite(Number(zone.radiusM)) ? Number(zone.radiusM) : null,
  }
}

export function instantiateZoneFromTemplate(template, anchorPoint, google) {
  if (!google || !anchorPoint || !isValidLatLng(anchorPoint) || !template) return null

  const zoneType = template.zoneType || { id: 'generic', name: 'Zone', color: '#3d8ef8', fillOpacity: 0.2 }
  const allowedAssetTypes = Array.isArray(template.allowedAssetTypes)
    ? template.allowedAssetTypes
    : (zoneType.allowedAssetTypes || [])

  const rebuiltPath = Array.isArray(template.pathOffsets)
    ? template.pathOffsets
      .map(offset => rebuildPointFromOffset(anchorPoint, offset, google))
      .filter(Boolean)
    : []

  const isCircle = template.shapeType === 'circle'
  const radiusM = Number(template.radiusM)
  const center = isCircle && template.centerOffset
    ? rebuildPointFromOffset(anchorPoint, template.centerOffset, google)
    : null

  const path = isCircle && center && Number.isFinite(radiusM) && radiusM > 0
    ? buildCirclePath(center, radiusM, google, 72)
    : rebuiltPath

  if (!Array.isArray(path) || path.length < 3) return null

  const metrics = isCircle && Number.isFinite(radiusM) && radiusM > 0
    ? { areaM2: Math.PI * radiusM * radiusM, perimeterM: 2 * Math.PI * radiusM }
    : computePolygonMetrics(path, google)

  return {
    id: `zone_${Date.now()}`,
    type: 'zone',
    shapeType: template.shapeType || 'polygon',
    center: center || undefined,
    radiusM: isCircle && Number.isFinite(radiusM) ? radiusM : undefined,
    zoneType: { ...zoneType },
    layoutType: template.layoutType || 'free',
    showGrid: Boolean(template.showGrid),
    gridSize: Math.max(1, Number(template.gridSize || 3)),
    gridRotation: Number(template.gridRotation || 0),
    subType: template.subType || null,
    parentId: null,
    path,
    areaM2: metrics.areaM2,
    perimeterM: metrics.perimeterM,
    capacity: null,
    label: template.zoneLabel || template.label || zoneType?.name || 'Zone',
    allowedAssetTypes,
    contentLocked: Boolean(template.contentLocked || allowedAssetTypes.length),
    status: template.status || 'planned',
    notes: template.notes || '',
    fillColor: template.fillColor,
    fillOpacity: template.fillOpacity,
    strokeColor: template.strokeColor,
    strokeWeight: template.strokeWeight,
    density: template.density,
    visible: true,
  }
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

export function getDeepestParentFloor(point, floorPlans, google) {
  if (!point || !floorPlans?.length) return null

  for (const floorPlan of floorPlans) {
    const bounds = buildFloorBoundsFromPlacement(floorPlan)
    if (!bounds) continue

    if (point.lat <= bounds.north && point.lat >= bounds.south &&
        point.lng <= bounds.east && point.lng >= bounds.west) {
      return floorPlan
    }
  }

  return null
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
  const mapZoom = Number(map.getZoom?.())
  const zoom = Number.isFinite(passedZoom) ? passedZoom : (Number.isFinite(mapZoom) ? mapZoom : 15)
  const centerPoint = latLngToContainerPoint(map, centerLat, centerLng, zoom)

  if (!centerPoint || !Number.isFinite(widthM) || !Number.isFinite(heightM)) return null

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

export function computeContentBounds(google, { zones, assets, lines, annotations, floorPlans, floorPlan }) {
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

  const allFloorPlans = Array.isArray(floorPlans) ? floorPlans : (floorPlan ? [floorPlan] : [])
  allFloorPlans.forEach(plan => {
    if (plan?.bounds) {
      bounds.extend({ lat: plan.bounds.north, lng: plan.bounds.west })
      bounds.extend({ lat: plan.bounds.south, lng: plan.bounds.east })
      hasContent = true
    }
  })

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

export function buildRectanglePath(center, halfWidthM, halfHeightM, google, rotationDeg = 0) {
  if (!google || !center) return []
  const origin = new google.maps.LatLng(center.lat, center.lng)
  const rotationRad = (Number(rotationDeg) || 0) * Math.PI / 180
  const corners = [
    { x: halfWidthM, y: halfHeightM },
    { x: -halfWidthM, y: halfHeightM },
    { x: -halfWidthM, y: -halfHeightM },
    { x: halfWidthM, y: -halfHeightM },
  ]

  return corners.map(({ x, y }) => {
    const rotatedX = x * Math.cos(rotationRad) - y * Math.sin(rotationRad)
    const rotatedY = x * Math.sin(rotationRad) + y * Math.cos(rotationRad)
    const distance = Math.sqrt(rotatedX * rotatedX + rotatedY * rotatedY)
    const bearing = (Math.atan2(rotatedX, rotatedY) * 180 / Math.PI + 360) % 360
    const point = google.maps.geometry.spherical.computeOffset(origin, distance, bearing)
    return { lat: point.lat(), lng: point.lng() }
  })
}

export function buildSquarePath(center, halfSideM, google, rotationDeg = 0) {
  return buildRectanglePath(center, halfSideM, halfSideM, google, rotationDeg)
}

function buildAssetBoundsVertices(asset, referenceLat) {
  const lat = Number(asset?.lat)
  const lng = Number(asset?.lng)
  const widthM = Math.max(0.01, Number(asset?.widthM ?? asset?.assetDef?.defaultWidth ?? 4) || 0.01)
  const lengthM = Math.max(0.01, Number(asset?.lengthM ?? asset?.assetDef?.defaultLength ?? widthM) || widthM)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []

  const centerLat = Number.isFinite(referenceLat) ? referenceLat : lat
  const lngMetersPerDegree = 111111.0 * Math.max(0.000001, Math.cos(centerLat * Math.PI / 180))
  const centerX = lng * lngMetersPerDegree
  const centerY = lat * 111111.0
  const halfWidth = widthM / 2
  const halfLength = lengthM / 2
  const rotationRad = (Number(asset?.rotationDeg) || 0) * Math.PI / 180
  const cos = Math.cos(rotationRad)
  const sin = Math.sin(rotationRad)
  const corners = [
    { x: halfWidth, y: halfLength },
    { x: -halfWidth, y: halfLength },
    { x: -halfWidth, y: -halfLength },
    { x: halfWidth, y: -halfLength },
  ]

  return corners.map(({ x, y }) => ({
    x: centerX + (x * cos - y * sin),
    y: centerY + (x * sin + y * cos),
  }))
}

function getPolygonAxes(vertices) {
  const axes = []

  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]
    const next = vertices[(index + 1) % vertices.length]
    const edgeX = next.x - current.x
    const edgeY = next.y - current.y
    const length = Math.hypot(edgeX, edgeY)

    if (!length) continue

    axes.push({
      x: -edgeY / length,
      y: edgeX / length,
    })
  }

  return axes
}

function projectPolygonOntoAxis(vertices, axis) {
  let min = Infinity
  let max = -Infinity

  vertices.forEach((vertex) => {
    const projection = vertex.x * axis.x + vertex.y * axis.y
    min = Math.min(min, projection)
    max = Math.max(max, projection)
  })

  return { min, max }
}

export function assetsOverlap(assetA, assetB, epsilonM = 0.01) {
  const latA = Number(assetA?.lat)
  const latB = Number(assetB?.lat)

  if (!Number.isFinite(latA) || !Number.isFinite(latB)) return false

  const referenceLat = (latA + latB) / 2
  const verticesA = buildAssetBoundsVertices(assetA, referenceLat)
  const verticesB = buildAssetBoundsVertices(assetB, referenceLat)

  if (verticesA.length < 4 || verticesB.length < 4) return false

  const axes = [
    ...getPolygonAxes(verticesA),
    ...getPolygonAxes(verticesB),
  ]

  return axes.every((axis) => {
    const projectionA = projectPolygonOntoAxis(verticesA, axis)
    const projectionB = projectPolygonOntoAxis(verticesB, axis)

    return !(
      projectionA.max <= projectionB.min + epsilonM
      || projectionB.max <= projectionA.min + epsilonM
    )
  })
}

export function findOverlappingAsset(asset, assets = [], options = {}) {
  const excludeAssetId = options.excludeAssetId || null

  return (Array.isArray(assets) ? assets : []).find(otherAsset => (
    otherAsset
    && otherAsset.id !== excludeAssetId
    && otherAsset.id !== asset?.id
    && assetsOverlap(asset, otherAsset)
  )) || null
}

export function snapAssetCenterToZoneVertex(
  lat,
  lng,
  widthM,
  lengthM,
  rotationDeg,
  zone,
  thresholdM = 2.5,
  googleApi = null
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !zone?.path?.length) {
    return { lat, lng }
  }

  const zoneVertices = zone.path.filter(point => (
    Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng))
  ))
  if (zoneVertices.length < 3) return { lat, lng }

  const resolvedWidthM = Math.max(0.01, Number(widthM) || 0.01)
  const resolvedLengthM = Math.max(0.01, Number(lengthM) || 0.01)
  const g = googleApi || window.google
  if (!g?.maps?.geometry?.spherical) return { lat, lng }

  const corners = buildRectanglePath(
    { lat, lng },
    resolvedWidthM / 2,
    resolvedLengthM / 2,
    g,
    Number(rotationDeg) || 0
  )
  if (!corners.length) return { lat, lng }

  const latMetersPerDegree = 111111.0
  const lngMetersPerDegree = 111111.0 * Math.max(0.000001, Math.cos(lat * Math.PI / 180))
  const maxSnapDistanceM = Math.max(0.25, Number(thresholdM) || 2.5)

  let bestMatch = null

  for (const corner of corners) {
    for (const vertex of zoneVertices) {
      const deltaXM = (Number(vertex.lng) - Number(corner.lng)) * lngMetersPerDegree
      const deltaYM = (Number(vertex.lat) - Number(corner.lat)) * latMetersPerDegree
      const distanceM = Math.hypot(deltaXM, deltaYM)
      if (!bestMatch || distanceM < bestMatch.distanceM) {
        bestMatch = { deltaXM, deltaYM, distanceM }
      }
    }
  }

  if (!bestMatch || bestMatch.distanceM > maxSnapDistanceM) {
    return { lat, lng }
  }

  return {
    lat: lat + (bestMatch.deltaYM / latMetersPerDegree),
    lng: lng + (bestMatch.deltaXM / lngMetersPerDegree),
  }
}

export function getPathCenter(path) {
  if (!Array.isArray(path) || path.length === 0) return null
  const center = path.reduce((acc, point) => ({
    lat: acc.lat + (point.lat || 0),
    lng: acc.lng + (point.lng || 0),
  }), { lat: 0, lng: 0 })
  return {
    lat: center.lat / path.length,
    lng: center.lng / path.length,
  }
}

export function limitGridSlots(slots, maxPoints = 450) {
  if (!slots?.length || slots.length <= maxPoints) return slots || []
  const step = Math.ceil(slots.length / maxPoints)
  return slots.filter((_, index) => index % step === 0)
}

export function computeVisibleGridSpacing(gridSizeMeters, latitude, zoom) {
  // Return the base grid spacing - could be adjusted for zoom visibility in the future
  return Math.max(0.1, Number(gridSizeMeters) || 1)
}

export function computeRenderedGridSpacing(gridSizeMeters, latitude, zoom, bounds, limit = 300) {
  let spacingM = computeVisibleGridSpacing(gridSizeMeters, latitude, zoom)
  if (!bounds) return spacingM

  const north = bounds.getNorthEast?.()?.lat?.()
  const south = bounds.getSouthWest?.()?.lat?.()
  const east = bounds.getNorthEast?.()?.lng?.()
  const west = bounds.getSouthWest?.()?.lng?.()

  if (![north, south, east, west].every(Number.isFinite)) {
    return spacingM
  }

  const midLat = (north + south) / 2
  let latStep = spacingM / 111111.0
  let lngStep = spacingM / (111111.0 * Math.max(0.000001, Math.cos(midLat * Math.PI / 180)))
  let latCount = Math.ceil((north - south) / latStep)
  let lngCount = Math.ceil((east - west) / lngStep)

  while (latCount + lngCount > limit) {
    spacingM *= 2
    latStep *= 2
    lngStep *= 2
    latCount = Math.ceil((north - south) / latStep)
    lngCount = Math.ceil((east - west) / lngStep)
    if (spacingM > 5000) break
  }

  return spacingM
}

export function snapToGrid(lat, lng, gridSizeMeters, referenceLat = lat) {
  const latStep = gridSizeMeters / 111111.0
  const gridLat = Number.isFinite(referenceLat) ? referenceLat : lat
  const lngStep = gridSizeMeters / (111111.0 * Math.cos(gridLat * Math.PI / 180))
  return {
    lat: Math.round(lat / latStep) * latStep,
    lng: Math.round(lng / lngStep) * lngStep,
  }
}

export function snapToZoneGrid(lat, lng, zone, zoom, widthM = 0, lengthM = 0) {
  if (!zone) return { lat, lng }

  const gridSizeMeters = Number(zone.gridSize || zone.rowSpacing || 3)
  const anchor = getZoneAnchor(zone)
  if (!anchor) return { lat, lng }

  // Calculate offset from anchor
  const latOffset = lat - anchor.lat
  const lngOffset = lng - anchor.lng

  // Snap the offset to grid
  const latStep = gridSizeMeters / 111111.0
  const lngStep = gridSizeMeters / (111111.0 * Math.cos(anchor.lat * Math.PI / 180))

  const snappedLatOffset = Math.round(latOffset / latStep) * latStep
  const snappedLngOffset = Math.round(lngOffset / lngStep) * lngStep

  // Return snapped position
  return {
    lat: anchor.lat + snappedLatOffset,
    lng: anchor.lng + snappedLngOffset,
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
