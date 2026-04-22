import { getZoneVisualPreset } from './zoneLayouts'

export const PARKING_STANDARDS = {
  car: {
    label: 'Car',
    widthM: 2.5,
    lengthM: 5,
    aisleWidthM: 6,
    stallSize: '2.5m x 5.0m',
    aisleWidth: '6.0m',
    areaPerVehicleM2: 30,
  },
  bike: {
    label: 'Bike',
    widthM: 1,
    lengthM: 2,
    aisleWidthM: 3,
    stallSize: '1.0m x 2.0m',
    aisleWidth: '3.0m',
    areaPerVehicleM2: 4,
  },
  bus: {
    label: 'Bus',
    widthM: 3.5,
    lengthM: 12,
    aisleWidthM: 9,
    stallSize: '3.5m x 12.0m',
    aisleWidth: '9.0m',
    areaPerVehicleM2: 60,
  },
}

function roundMetric(value, precision = 2) {
  return Number(Number(value || 0).toFixed(precision))
}

function getDefaultVehicleConfig(type) {
  const standard = PARKING_STANDARDS[type] || PARKING_STANDARDS.car
  return {
    widthM: standard.widthM,
    lengthM: standard.lengthM,
  }
}

function getVehicleConfig(layoutConfig, type) {
  const defaults = getDefaultVehicleConfig(type)
  const source = layoutConfig?.vehicleConfigs?.[type] || {}
  return {
    widthM: Number(source.widthM) > 0 ? Number(source.widthM) : defaults.widthM,
    lengthM: Number(source.lengthM) > 0 ? Number(source.lengthM) : defaults.lengthM,
  }
}

function getParkingConfig(zone) {
  const layoutConfig = zone?.layoutConfig || {}
  const selectedType = zone?.layoutConfig?.unitType || zone?.subType?.id || 'car'
  const standard = PARKING_STANDARDS[selectedType] || PARKING_STANDARDS.car
  const routeLineCount = Math.max(0, Math.round(Number(zone?.routeLineCount) || 0))
  const selectedVehicleTypes = Array.isArray(layoutConfig.selectedVehicleTypes) && layoutConfig.selectedVehicleTypes.length
    ? layoutConfig.selectedVehicleTypes.filter(type => PARKING_STANDARDS[type])
    : [selectedType]
  const normalizedVehicleTypes = selectedVehicleTypes.length ? selectedVehicleTypes : ['car']
  const rawAllocations = layoutConfig.allocationPercentages || {}
  const activeAllocationTotal = normalizedVehicleTypes.reduce((sum, type) => {
    const value = Number(rawAllocations[type])
    return sum + (Number.isFinite(value) && value >= 0 ? value : 0)
  }, 0)

  return {
    unitType: selectedType,
    selectedVehicleTypes: normalizedVehicleTypes,
    label: standard.label,
    aisleWidthM: Number(layoutConfig.laneWidth ?? layoutConfig.driveLaneWidth) > 0 ? Number(layoutConfig.laneWidth ?? layoutConfig.driveLaneWidth) : standard.aisleWidthM,
    spacingM: Number(layoutConfig.vehicleSpacing ?? layoutConfig.stallGap) >= 0 ? Number(layoutConfig.vehicleSpacing ?? layoutConfig.stallGap) : 0.3,
    edgeClearanceM: Number(layoutConfig.edgeClearance) >= 0 ? Number(layoutConfig.edgeClearance) : 1,
    requestedLaneCount: Math.max(1, Math.round(Number(layoutConfig.laneCount) || 2)),
    routeLineCount,
    entryPoints: Math.max(0, Math.round(Number(layoutConfig.entryPoints) || 1)),
    exitPoints: Math.max(0, Math.round(Number(layoutConfig.exitPoints) || 1)),
    perType: normalizedVehicleTypes.map(type => {
      const standardForType = PARKING_STANDARDS[type] || PARKING_STANDARDS.car
      const vehicle = getVehicleConfig(layoutConfig, type)
      const rawPercent = Number(rawAllocations[type])
      const areaPercentage = activeAllocationTotal > 0
        ? ((Number.isFinite(rawPercent) && rawPercent >= 0 ? rawPercent : 0) / activeAllocationTotal) * 100
        : (100 / normalizedVehicleTypes.length)
      return {
        type,
        label: standardForType.label,
        widthM: vehicle.widthM,
        lengthM: vehicle.lengthM,
        areaPercentage,
        fallbackAreaPerVehicleM2: standardForType.areaPerVehicleM2,
      }
    }),
  }
}

function evaluateParkingOrientation(acrossWidthM, alongLengthM, vehicleConfig, sharedConfig, allocatedLaneRows) {
  if (allocatedLaneRows <= 0) return null

  const usableAcross = acrossWidthM - (sharedConfig.edgeClearanceM * 2)
  const usableAlong = alongLengthM - (sharedConfig.edgeClearanceM * 2)
  if (usableAcross <= 0 || usableAlong <= 0) return null

  const vehiclePitch = vehicleConfig.widthM + sharedConfig.spacingM
  const moduleDepth = (vehicleConfig.lengthM * 2) + sharedConfig.aisleWidthM
  const modulePitch = moduleDepth + sharedConfig.edgeClearanceM
  const boxesPerSide = Math.floor((usableAcross + sharedConfig.spacingM) / Math.max(0.1, vehiclePitch))
  const modulesThatFit = Math.floor((usableAlong + sharedConfig.edgeClearanceM) / Math.max(0.1, modulePitch))
  const laneCountUsed = Math.max(0, Math.min(allocatedLaneRows, modulesThatFit))
  const capacity = boxesPerSide > 0 && laneCountUsed > 0 ? boxesPerSide * 2 * laneCountUsed : 0

  return {
    usableAcrossM: roundMetric(usableAcross),
    usableAlongM: roundMetric(usableAlong),
    boxesPerSide,
    modulesThatFit,
    desiredLaneCount: allocatedLaneRows,
    laneCountUsed,
    capacity,
  }
}

export function getParkingMetrics(zone) {
  if (!zone) return null

  const config = getParkingConfig(zone)
  const areaM2 = Number(zone.areaM2) || 0
  const widthM = Number(zone.widthM)
  const lengthM = Number(zone.lengthM)
  const hasExplicitDimensions = widthM > 0 && lengthM > 0
  const desiredLaneCount = config.routeLineCount > 0 ? config.routeLineCount : config.requestedLaneCount
  const laneAllocations = {}
  const laneShares = config.perType.map(vehicle => {
    const exact = (vehicle.areaPercentage / 100) * desiredLaneCount
    const value = Math.floor(exact)
    laneAllocations[vehicle.type] = value
    return { type: vehicle.type, exact, remainder: exact - value }
  })
  let allocatedLaneRows = Object.values(laneAllocations).reduce((sum, value) => sum + value, 0)
  let remainingLaneRows = Math.max(0, desiredLaneCount - allocatedLaneRows)
  laneShares
    .sort((a, b) => b.remainder - a.remainder)
    .forEach(item => {
      if (remainingLaneRows <= 0) return
      laneAllocations[item.type] += 1
      remainingLaneRows -= 1
    })

  const perType = config.perType.map(vehicle => {
    let layoutBest = null
    if (hasExplicitDimensions) {
      const widthFirst = evaluateParkingOrientation(widthM, lengthM, vehicle, config, laneAllocations[vehicle.type] || 0)
      const lengthFirst = evaluateParkingOrientation(lengthM, widthM, vehicle, config, laneAllocations[vehicle.type] || 0)
      layoutBest = [widthFirst, lengthFirst]
        .filter(Boolean)
        .sort((a, b) => (b.capacity || 0) - (a.capacity || 0))[0] || null
    }

    const fallbackAreaPerVehicleM2 = Math.max(
      vehicle.fallbackAreaPerVehicleM2,
      roundMetric((vehicle.widthM * vehicle.lengthM) + ((config.aisleWidthM * vehicle.widthM) / 2))
    )
    const areaShare = areaM2 > 0 ? areaM2 * (vehicle.areaPercentage / 100) : 0
    const fallbackCapacity = areaShare > 0 ? Math.floor(areaShare / fallbackAreaPerVehicleM2) : null
    const derivedCapacity = layoutBest?.capacity > 0 ? layoutBest.capacity : fallbackCapacity

    return {
      ...vehicle,
      areaPercentageExact: vehicle.areaPercentage,
      areaPercentage: roundMetric(vehicle.areaPercentage, 0),
      boxSize: `${vehicle.widthM}m x ${vehicle.lengthM}m`,
      areaPerVehicleM2: fallbackAreaPerVehicleM2,
      capacity: derivedCapacity ?? 0,
      capacityMethod: layoutBest?.capacity > 0 ? 'layout' : 'area',
      derivedLayout: layoutBest,
      laneRowsRequested: laneAllocations[vehicle.type] || 0,
    }
  })

  const totalCapacity = perType.reduce((sum, vehicle) => sum + (vehicle.capacity || 0), 0)
  const primaryVehicle = perType.find(vehicle => vehicle.type === config.unitType) || perType[0] || null

  return {
    ...config,
    aisleWidth: `${config.aisleWidthM}m`,
    capacity: totalCapacity,
    capacityMethod: perType.some(vehicle => vehicle.capacityMethod === 'layout') ? 'layout' : 'area',
    perType,
    primaryVehicle,
  }
}

export function computeParkingCapacity(zone) {
  return getParkingMetrics(zone)?.capacity ?? null
}

export function getParkingStandard(zone) {
  return getParkingMetrics(zone)
}

export function isParkingZone(zone) {
  if (!zone) return false
  const zoneType = zone?.zoneType || zone
  return getZoneVisualPreset(zoneType)?.id === 'parking'
}

export function computeZoneCapacity(zone, density = 0.5) {
  if (!zone?.areaM2) return null
  // Parking uses dedicated parking standards
  if (isParkingZone(zone)) {
    return computeParkingCapacity(zone)
  }
  const preset = getZoneVisualPreset(zone?.zoneType)
  const layoutConfig = zone?.layoutConfig || {}
  if (preset?.id === 'food_court') {
    const widthM = Number(zone.widthM)
    const lengthM = Number(zone.lengthM)
    const stallWidth = Math.max(0.1, Number(layoutConfig.stallWidth) || 3)
    const stallLength = Math.max(0.1, Number(layoutConfig.stallLength) || 3)
    const sideSpacing = Math.max(0, Number(layoutConfig.sideSpacing) || 1)
    const frontSpacing = Math.max(0, Number(layoutConfig.frontSpacing) || 3)
    const backServiceLane = Math.max(0, Number(layoutConfig.backServiceLane) || 2)
    if (widthM > 0 && lengthM > 0) {
      const usableAcross = Math.max(0, widthM - sideSpacing * 2)
      const rowDepth = stallLength + frontSpacing + backServiceLane
      const stallsPerRow = Math.floor((usableAcross + sideSpacing) / Math.max(0.1, stallWidth + sideSpacing))
      const rowCount = Math.floor(lengthM / Math.max(0.1, rowDepth))
      const derived = stallsPerRow * rowCount
      if (derived > 0) return derived
    }
    return Math.floor(zone.areaM2 / Math.max(1, (stallWidth * stallLength) + (frontSpacing * stallWidth)))
  }
  if (preset?.id === 'arena') {
    const stageWidth = Math.max(0.1, Number(layoutConfig.stageWidth) || 12)
    const stageDepth = Math.max(0.1, Number(layoutConfig.stageDepth) || 8)
    const aisleWidth = Math.max(0.1, Number(layoutConfig.aisleWidth) || 2.5)
    const rowSpacing = Math.max(0.1, Number(layoutConfig.rowSpacing) || 0.9)
    const seatWidth = Math.max(0.1, Number(layoutConfig.seatWidth) || 0.55)
    const blockCount = Math.max(1, Math.round(Number(layoutConfig.blockCount) || 3))
    const frontClearance = Math.max(0, Number(layoutConfig.frontClearance) || 5)
    const stageArea = stageWidth * stageDepth
    const aisleArea = aisleWidth * Math.max(0, blockCount + 1) * Math.max(0, Number(zone.lengthM) || 0)
    const clearanceArea = stageWidth * frontClearance
    const usableAudienceArea = Math.max(0, zone.areaM2 - stageArea - aisleArea - clearanceArea)
    return Math.floor(usableAudienceArea / Math.max(0.2, rowSpacing * seatWidth))
  }
  if (preset?.id === 'custom') {
    const moduleWidth = Math.max(0.1, Number(layoutConfig.moduleWidth) || 4)
    const moduleLength = Math.max(0.1, Number(layoutConfig.moduleLength) || 4)
    const moduleSpacing = Math.max(0, Number(layoutConfig.moduleSpacing) || 1)
    const circulationWidth = Math.max(0, Number(layoutConfig.circulationWidth) || 2.5)
    const unitArea = (moduleWidth * moduleLength) + (moduleSpacing * moduleWidth) + circulationWidth
    return Math.floor(zone.areaM2 / Math.max(1, unitArea))
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
