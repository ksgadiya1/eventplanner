export const PARKING_STANDARDS = {
  car: {
    label: 'Car',
    stallSize: '2.5m x 5.0m',
    aisleWidth: '6.0m',
    areaPerVehicleM2: 30,
  },
  bike: {
    label: 'Bike',
    stallSize: '1.0m x 2.0m',
    aisleWidth: '3.0m',
    areaPerVehicleM2: 4,
  },
  bus: {
    label: 'Bus',
    stallSize: '3.5m x 12.0m',
    aisleWidth: '9.0m',
    areaPerVehicleM2: 60,
  },
}

export function computeParkingCapacity(zone) {
  if (!zone?.areaM2) return null
  const selectedType = zone?.subType?.id || 'car'
  const standard = PARKING_STANDARDS[selectedType] || PARKING_STANDARDS.car
  return Math.floor(zone.areaM2 / standard.areaPerVehicleM2)
}

export function getParkingStandard(zone) {
  const selectedType = zone?.subType?.id || 'car'
  return PARKING_STANDARDS[selectedType] || PARKING_STANDARDS.car
}

export function computeZoneCapacity(zone, density = 0.5) {
  if (!zone?.areaM2) return null
  // Car Park uses dedicated parking standards
  if (zone?.zoneType?.id === 'car_park' || zone?.zoneType?.name === 'Car Park') {
    return computeParkingCapacity(zone)
  }
  // If a subType with unitArea is selected, divide area by it
  if (zone.subType?.unitArea) {
    return Math.floor(zone.areaM2 / zone.subType.unitArea)
  }
  // If the zone type has a default first subType, use that
  const defaultSub = zone?.zoneType?.subTypes?.[0]
  if (defaultSub?.unitArea) {
    return Math.floor(zone.areaM2 / defaultSub.unitArea)
  }
  // Fallback: crowd density
  return Math.round(zone.areaM2 * density)
}

export function getZoneCapacityLabel(zone) {
  const zt = zone?.zoneType
  if (!zt) return { title: 'CAPACITY', unit: 'units' }
  return {
    title: zt.capacityLabel || 'CAPACITY',
    unit: zt.capacityUnit || 'units',
  }
}

export function getZoneAllowedAssetTypes(zone) {
  return zone?.allowedAssetTypes || zone?.zoneType?.allowedAssetTypes || []
}

export function getAssetName(assetId) {
  return assetId
}

export function isAssetAllowedInZone(zone, assetDefId) {
  const allowedAssetTypes = getZoneAllowedAssetTypes(zone)
  if (!allowedAssetTypes.length) return true
  return allowedAssetTypes.includes(assetDefId)
}
