function createPolygon(google, path) {
  return new google.maps.Polygon({ paths: path })
}

function createBounds(google, path) {
  const bounds = new google.maps.LatLngBounds()
  path.forEach(point => bounds.extend(point))
  return bounds
}

export function generateGrid(zone, google) {
  if (!zone?.path?.length) return []

  const polygon = createPolygon(google, zone.path)
  const bounds = createBounds(google, zone.path)
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  const latStep = 0.0001
  const lngStep = 0.0001
  const slots = []

  let row = 0
  for (let lat = sw.lat(); lat < ne.lat(); lat += latStep) {
    let col = 0
    for (let lng = sw.lng(); lng < ne.lng(); lng += lngStep) {
      const point = new google.maps.LatLng(lat, lng)
      if (google.maps.geometry.poly.containsLocation(point, polygon)) {
        slots.push({
          id: `${zone.id}_grid_${row}_${col}`,
          lat,
          lng,
          row,
          col,
          componentType: zone.subType?.id || 'slot',
        })
        col++
      }
    }
    row++
  }

  return slots
}

export function generateRows(zone, google) {
  if (!zone?.path?.length) return []

  const polygon = createPolygon(google, zone.path)
  const bounds = createBounds(google, zone.path)
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  const rowSpacing = 0.00012
  const colSpacing = 0.00008
  const slots = []

  let row = 0
  for (let lat = sw.lat(); lat < ne.lat(); lat += rowSpacing) {
    let col = 0
    for (let lng = sw.lng(); lng < ne.lng(); lng += colSpacing) {
      const point = new google.maps.LatLng(lat, lng)
      if (google.maps.geometry.poly.containsLocation(point, polygon)) {
        slots.push({
          id: `${zone.id}_row_${row}_${col}`,
          lat,
          lng,
          row,
          col,
          componentType: zone.subType?.id || 'slot',
        })
        col++
      }
    }
    row++
  }

  return slots
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
