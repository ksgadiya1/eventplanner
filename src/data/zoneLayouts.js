const ZONE_VISUAL_PRESETS = {
  parking: {
    id: 'parking',
    label: 'Parking Layout',
    description: 'Simple parking boxes, lane lines, gate count, and vehicle sizing.',
    defaults: {
      unitType: 'car',
      selectedVehicleTypes: ['car'],
      stallWidth: 2.5,
      stallLength: 5,
      driveLaneWidth: 6,
      stallGap: 0.3,
      edgeClearance: 1,
      entryPoints: 2,
      laneCount: 2,
    },
  },
  food_court: {
    id: 'food_court',
    label: 'Food Court Layout',
    description: 'Stall sizing, service gaps, customer circulation, and frontage planning.',
    defaults: {
      stallWidth: 3,
      stallLength: 3,
      frontSpacing: 3,
      sideSpacing: 1,
      backServiceLane: 2,
      seatingGap: 4,
      entryPoints: 2,
      exitPoints: 2,
    },
  },
  arena: {
    id: 'arena',
    label: 'Arena Layout',
    description: 'Performance bowl setup with stage clearance, aisles, and audience blocks.',
    defaults: {
      stageWidth: 12,
      stageDepth: 8,
      frontClearance: 5,
      aisleWidth: 2.5,
      rowSpacing: 0.9,
      blockCount: 3,
      entryPoints: 4,
      exitPoints: 4,
      seatWidth: 0.55,
    },
  },
  custom: {
    id: 'custom',
    label: 'Custom Layout',
    description: 'Generic zone planning for custom operations and mixed-use spaces.',
    defaults: {
      moduleWidth: 4,
      moduleLength: 4,
      moduleCount: 4,
      circulationWidth: 2.5,
      edgeClearance: 1.5,
      entryPoints: 2,
      exitPoints: 2,
      moduleSpacing: 1,
      notes: '',
    },
  },
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

export function inferZoneVisualPreset(zoneType) {
  const explicitPreset = normalizeText(zoneType?.visualPreset)
  if (explicitPreset && ZONE_VISUAL_PRESETS[explicitPreset]) return explicitPreset

  const haystack = `${normalizeText(zoneType?.id)} ${normalizeText(zoneType?.name)}`

  if (haystack.includes('park')) return 'parking'
  if (haystack.includes('food') || haystack.includes('stall') || haystack.includes('vendor')) return 'food_court'
  if (haystack.includes('arena') || haystack.includes('audience') || haystack.includes('seating') || haystack.includes('stage')) return 'arena'

  return 'custom'
}

export function getZoneVisualPreset(zoneType) {
  return ZONE_VISUAL_PRESETS[inferZoneVisualPreset(zoneType)] || ZONE_VISUAL_PRESETS.custom
}

export function getDefaultZoneLayoutConfig(zoneType, existingConfig = {}) {
  const preset = getZoneVisualPreset(zoneType)
  return {
    presetId: preset.id,
    ...preset.defaults,
    ...(existingConfig || {}),
  }
}

export function getZoneVisualPresetOptions() {
  return Object.values(ZONE_VISUAL_PRESETS)
}
