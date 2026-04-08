function createBounds(google, path) {
  const bounds = new google.maps.LatLngBounds()
  path.forEach(point => bounds.extend(point))
  return bounds
}

function getLatLngStepFromMeters(meters, latitude = 0) {
  const safeMeters = Math.max(1, Number(meters) || 0)
  const latStep = safeMeters / 111111
  const lngStep = safeMeters / (111111 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)))
  return { latStep, lngStep }
}

function getHorizontalSegmentsInsidePolygon(path, lat) {
  const intersections = []

  for (let index = 0; index < path.length; index++) {
    const start = path[index]
    const end = path[(index + 1) % path.length]
    if (start.lat === end.lat) continue

    const minLat = Math.min(start.lat, end.lat)
    const maxLat = Math.max(start.lat, end.lat)
    if (lat < minLat || lat >= maxLat) continue

    const ratio = (lat - start.lat) / (end.lat - start.lat)
    intersections.push(start.lng + ratio * (end.lng - start.lng))
  }

  intersections.sort((a, b) => a - b)

  const segments = []
  for (let index = 0; index + 1 < intersections.length; index += 2) {
    const startLng = intersections[index]
    const endLng = intersections[index + 1]
    if (Math.abs(endLng - startLng) < 1e-9) continue
    segments.push([
      { lat, lng: startLng },
      { lat, lng: endLng },
    ])
  }

  return segments
}

function getVerticalSegmentsInsidePolygon(path, lng) {
  const intersections = []

  for (let index = 0; index < path.length; index++) {
    const start = path[index]
    const end = path[(index + 1) % path.length]
    if (start.lng === end.lng) continue

    const minLng = Math.min(start.lng, end.lng)
    const maxLng = Math.max(start.lng, end.lng)
    if (lng < minLng || lng >= maxLng) continue

    const ratio = (lng - start.lng) / (end.lng - start.lng)
    intersections.push(start.lat + ratio * (end.lat - start.lat))
  }

  intersections.sort((a, b) => a - b)

  const segments = []
  for (let index = 0; index + 1 < intersections.length; index += 2) {
    const startLat = intersections[index]
    const endLat = intersections[index + 1]
    if (Math.abs(endLat - startLat) < 1e-9) continue
    segments.push([
      { lat: startLat, lng },
      { lat: endLat, lng },
    ])
  }

  return segments
}

export function generateGridLines(zone, google) {
  if (!zone?.path?.length || !google) return []

  const bounds = createBounds(google, zone.path)
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  const midLat = (ne.lat() + sw.lat()) / 2
  const { latStep, lngStep } = getLatLngStepFromMeters(zone.gridSize || 3, midLat)
  const zoneColor = zone.strokeColor || zone.zoneType?.color || '#3d8ef8'

  const latCount = Math.floor((ne.lat() - sw.lat()) / latStep)
  const lngCount = Math.floor((ne.lng() - sw.lng()) / lngStep)
  if (latCount + lngCount > 220) return []

  const lines = []
  let lineId = 0

  for (let lat = sw.lat() + latStep; lat < ne.lat() - latStep / 2; lat += latStep) {
    const segments = getHorizontalSegmentsInsidePolygon(zone.path, lat)
    segments.forEach(segment => {
      lines.push({
        id: `${zone.id}_grid_h_${lineId}`,
        path: segment,
        color: zoneColor,
        type: 'layout',
        pattern: 'solid',
        strokeOpacity: 0.3,
        strokeWeight: 1,
      })
      lineId++
    })
  }

  for (let lng = sw.lng() + lngStep; lng < ne.lng() - lngStep / 2; lng += lngStep) {
    const segments = getVerticalSegmentsInsidePolygon(zone.path, lng)
    segments.forEach(segment => {
      lines.push({
        id: `${zone.id}_grid_v_${lineId}`,
        path: segment,
        color: zoneColor,
        type: 'layout',
        pattern: 'solid',
        strokeOpacity: 0.3,
        strokeWeight: 1,
      })
      lineId++
    })
  }

  return lines
}

export function generateGrid(zone, google) {
  return generateGridLines(zone, google)
}

export function generateRows(zone, google) {
  if (!zone?.path?.length || !google) return []

  const bounds = createBounds(google, zone.path)
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  const midLat = (ne.lat() + sw.lat()) / 2
  const { latStep } = getLatLngStepFromMeters(zone.rowSpacing || 2, midLat)
  const zoneColor = zone.strokeColor || zone.zoneType?.color || '#3d8ef8'

  const latCount = Math.floor((ne.lat() - sw.lat()) / latStep)
  if (latCount > 160) return []

  const lines = []
  let lineId = 0

  for (let lat = sw.lat() + latStep; lat < ne.lat() - latStep / 2; lat += latStep) {
    const segments = getHorizontalSegmentsInsidePolygon(zone.path, lat)
    segments.forEach(segment => {
      lines.push({
        id: `${zone.id}_row_${lineId}`,
        path: segment,
        color: zoneColor,
        type: 'layout',
        pattern: 'dashed',
        strokeOpacity: 0.65,
        strokeWeight: 2,
      })
      lineId++
    })
  }

  return lines
}

export function generateLayout(zone, google) {
  switch (zone?.layoutType) {
    case 'grid':
      return generateGrid(zone, google)
    case 'rows':
      return generateRows(zone, google)
    default:
      return []
  }
}
