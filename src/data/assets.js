export const ASSET_CATEGORIES = {
  Performance: [
    { id: 'stage', name: 'Stage', icon: '🎪', color: '#8b5cf6', defaultWidth: 12, defaultLength: 10 },
    { id: 'marquee', name: 'Marquee', icon: '⛺', color: '#6366f1', defaultWidth: 20, defaultLength: 15 },
    { id: 'gazebo', name: 'Gazebo', icon: '🏕️', color: '#a78bfa', defaultWidth: 5, defaultLength: 5 },
    { id: 'led_screen', name: 'LED Screen', icon: '🖥️', color: '#7c3aed', defaultWidth: 8, defaultLength: 1.5 },
    { id: 'foh_tower', name: 'FOH Tower', icon: '🗼', color: '#6d28d9', defaultWidth: 4, defaultLength: 4 },
    { id: 'camera_platform', name: 'Camera Platform', icon: '🎥', color: '#8b5cf6', defaultWidth: 3, defaultLength: 3 },
  ],
  'Traders & Hospitality': [
    { id: 'trader_stall', name: 'Trader Stall', icon: '🛖', color: '#f59e0b', defaultWidth: 3, defaultLength: 3 },
    { id: 'food_truck', name: 'Food Truck', icon: '🚚', color: '#f97316', defaultWidth: 6, defaultLength: 2.8 },
    { id: 'seating_block', name: 'Seating Block', icon: '🪑', color: '#fb923c', defaultWidth: 4, defaultLength: 4 },
    { id: 'vip_lounge', name: 'VIP Lounge', icon: '🍸', color: '#d946ef', defaultWidth: 8, defaultLength: 6 },
  ],
  'Power & Utilities': [
    { id: 'generator', name: 'Generator', icon: '⚡', color: '#eab308', defaultWidth: 3, defaultLength: 2 },
    { id: 'lighting_tower', name: 'Lighting Tower', icon: '💡', color: '#fde68a', defaultWidth: 1, defaultLength: 1 },
    { id: 'water_point', name: 'Water Point', icon: '💧', color: '#38bdf8', defaultWidth: 1, defaultLength: 1 },
    { id: 'db_box', name: 'Distribution Box', icon: '🔌', color: '#facc15', defaultWidth: 1.5, defaultLength: 1.5 },
    { id: 'fuel_storage', name: 'Fuel Storage', icon: '🛢️', color: '#f59e0b', defaultWidth: 2.5, defaultLength: 2.5 },
    { id: 'control_room', name: 'Control Room', icon: '🏠', color: '#06b6d4', defaultWidth: 4, defaultLength: 3 },
  ],
  'Welfare & Safety': [
    { id: 'toilet_block', name: 'Toilet Block', icon: '🚻', color: '#34d399', defaultWidth: 6, defaultLength: 3 },
    { id: 'first_aid', name: 'First Aid Post', icon: '🏥', color: '#f87171', defaultWidth: 4, defaultLength: 4 },
    { id: 'fire_point', name: 'Fire Point', icon: '🧯', color: '#ef4444', defaultWidth: 1, defaultLength: 1 },
    { id: 'waste_station', name: 'Waste Station', icon: '🗑️', color: '#6b7280', defaultWidth: 2, defaultLength: 1 },
    { id: 'ambulance_bay', name: 'Ambulance Bay', icon: '🚑', color: '#dc2626', defaultWidth: 7, defaultLength: 3 },
    { id: 'police_post', name: 'Police Post', icon: '🚓', color: '#3b82f6', defaultWidth: 4, defaultLength: 3 },
    { id: 'rest_area', name: 'Rest Area', icon: '🛋️', color: '#10b981', defaultWidth: 5, defaultLength: 5 },
  ],
  'Access & Security': [
    { id: 'gate', name: 'Gate', icon: '🚧', color: '#fb923c', defaultWidth: 4, defaultLength: 1 },
    { id: 'steward_point', name: 'Steward Point', icon: '👷', color: '#22d3ee', defaultWidth: 1, defaultLength: 1 },
    { id: 'vehicle_checkpoint', name: 'Vehicle Checkpoint', icon: '🛑', color: '#f43f5e', defaultWidth: 5, defaultLength: 2 },
    { id: 'barrier_line', name: 'Barrier Line', icon: '▢', color: '#94a3b8', defaultWidth: 10, defaultLength: 1 },
    { id: 'turnstile', name: 'Turnstile', icon: '🚪', color: '#0ea5e9', defaultWidth: 2, defaultLength: 1 },
    { id: 'bag_check', name: 'Bag Check', icon: '🎒', color: '#f43f5e', defaultWidth: 3, defaultLength: 2 },
    { id: 'cctv_pole', name: 'CCTV Pole', icon: '📹', color: '#64748b', defaultWidth: 1, defaultLength: 1 },
  ],
  'Branding & Wayfinding': [
    { id: 'feather_banner', name: 'Feather Banner', icon: '🚩', color: '#e879f9', defaultWidth: 0.6, defaultLength: 3 },
    { id: 'barrier_sleeve', name: 'Barrier Jacket Sleeve', icon: '📛', color: '#c084fc', defaultWidth: 2, defaultLength: 1 },
    { id: 'wayfinding_board', name: 'Wayfinding Board', icon: '🧭', color: '#a855f7', defaultWidth: 1.5, defaultLength: 1 },
    { id: 'entry_arch', name: 'Entry Arch', icon: '🏁', color: '#ec4899', defaultWidth: 5, defaultLength: 1.5 },
    { id: 'sponsor_wall', name: 'Sponsor Wall', icon: '🧱', color: '#d946ef', defaultWidth: 6, defaultLength: 0.8 },
  ],
  Logistics: [
    { id: 'parking_slot', name: 'Parking Slot', icon: '🅿️', color: '#64748b', defaultWidth: 2.5, defaultLength: 5 },
    { id: 'bus_bay', name: 'Bus Bay', icon: '🚌', color: '#334155', defaultWidth: 3.5, defaultLength: 12 },
    { id: 'loading_dock', name: 'Loading Dock', icon: '📦', color: '#0f766e', defaultWidth: 6, defaultLength: 3 },
    { id: 'forklift_zone', name: 'Forklift Zone', icon: '🚜', color: '#14b8a6', defaultWidth: 4, defaultLength: 4 },
  ],
}

const ICONIFY_ASSET_CATEGORIES = {
  Food: [
    { id: 'catering_point', name: 'Catering Point', icon: 'mdi:food', iconType: 'iconify', color: '#f97316', defaultWidth: 4, defaultLength: 4, keywords: ['food', 'catering', 'meal', 'vendor'], libraryTags: ['food'] },
    { id: 'coffee_bar', name: 'Coffee Bar', icon: 'mdi:coffee', iconType: 'iconify', color: '#b45309', defaultWidth: 3, defaultLength: 2.5, keywords: ['coffee', 'beverage', 'food'], libraryTags: ['food'] },
    { id: 'ticket_kiosk', name: 'Ticket Kiosk', icon: 'mdi:ticket', iconType: 'iconify', color: '#ec4899', defaultWidth: 2.5, defaultLength: 2, keywords: ['ticket', 'entry', 'wristband'], libraryTags: ['entertainment'] },
  ],
  Facilities: [
    { id: 'accessible_seating', name: 'Accessible Seating', icon: 'mdi:chair-rolling', iconType: 'iconify', color: '#2563eb', defaultWidth: 3, defaultLength: 3, keywords: ['accessible', 'chair', 'wheelchair'], libraryTags: ['facilities'] },
    { id: 'waypoint_marker', name: 'Waypoint Marker', icon: 'mdi:map-marker', iconType: 'iconify', color: '#ef4444', defaultWidth: 1, defaultLength: 1, keywords: ['map', 'marker', 'location', 'pin'], libraryTags: ['facilities'] },
    { id: 'restroom_hub', name: 'Restroom Hub', icon: 'mdi:toilet', iconType: 'iconify', color: '#14b8a6', defaultWidth: 5, defaultLength: 3, keywords: ['toilet', 'wc', 'facilities'], libraryTags: ['facilities'] },
    { id: 'parking_hub', name: 'Parking Hub', icon: 'mdi:car', iconType: 'iconify', color: '#64748b', defaultWidth: 4, defaultLength: 6, keywords: ['car', 'vehicle', 'parking'], libraryTags: ['facilities'] },
  ],
  Entertainment: [
    { id: 'music_zone', name: 'Music Zone', icon: 'mdi:music', iconType: 'iconify', color: '#8b5cf6', defaultWidth: 6, defaultLength: 6, keywords: ['music', 'audio', 'dj', 'performance'], libraryTags: ['entertainment'] },
    { id: 'speaker_stack', name: 'Speaker Stack', icon: 'mdi:speaker-wireless', iconType: 'iconify', color: '#7c3aed', defaultWidth: 2.5, defaultLength: 2.5, keywords: ['speaker', 'audio', 'sound'], libraryTags: ['entertainment'] },
    { id: 'merch_counter', name: 'Merch Counter', icon: 'mdi:shopping', iconType: 'iconify', color: '#0ea5e9', defaultWidth: 4, defaultLength: 2.5, keywords: ['merch', 'retail', 'shop'], libraryTags: ['entertainment'] },
  ],
}

Object.entries(ICONIFY_ASSET_CATEGORIES).forEach(([category, assets]) => {
  ASSET_CATEGORIES[category] = [...(ASSET_CATEGORIES[category] || []), ...assets]
})

export const ASSET_LIBRARY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'food', label: 'Food' },
  { id: 'facilities', label: 'Facilities' },
  { id: 'entertainment', label: 'Entertainment' },
]

export const ALL_ASSETS = Object.entries(ASSET_CATEGORIES).flatMap(([category, assets]) =>
  assets.map(asset => ({
    ...asset,
    category,
    keywords: asset.keywords || [],
    libraryTags: asset.libraryTags || [],
  }))
)

const ASSET_NAME_BY_ID = ALL_ASSETS
  .reduce((lookup, asset) => {
    lookup[asset.id] = asset.name
    return lookup
  }, {})

const ASSET_BY_ID = ALL_ASSETS.reduce((lookup, asset) => {
  lookup[asset.id] = asset
  return lookup
}, {})

export const ZONE_TYPES = [
  { id: 'arena', name: 'Arena', color: '#3d8ef8', fillOpacity: 0.2, layoutType: 'free' },
  {
    id: 'public',
    name: 'Public Area',
    color: '#34d399',
    fillOpacity: 0.15,
    layoutType: 'rows',
    subTypes: [
      { id: 'standing', unitArea: 1 },
      { id: 'seated', unitArea: 0.75 },
    ],
  },
  { id: 'backstage', name: 'Backstage', color: '#8b5cf6', fillOpacity: 0.25, layoutType: 'free' },
  {
    id: 'food_court',
    name: 'Food Court',
    color: '#f97316',
    fillOpacity: 0.2,
    layoutType: 'grid',
    allowedAssetTypes: ['trader_stall', 'food_truck', 'seating_block'],
    defaultSubTypeId: 'stall',
    subTypes: [
      { id: 'stall', unitArea: 9 },
      { id: 'food_truck', unitArea: 18 },
      { id: 'seating', unitArea: 2.5 },
    ],
  },
  {
    id: 'trader_village',
    name: 'Trader Village',
    color: '#f59e0b',
    fillOpacity: 0.2,
    layoutType: 'grid',
    allowedAssetTypes: ['trader_stall'],
    subTypes: [
      { id: 'stall', unitArea: 9 },
      { id: 'table', unitArea: 4 },
      { id: 'food_truck', unitArea: 18 },
    ],
  },
  { id: 'vip', name: 'VIP Hospitality', color: '#e879f9', fillOpacity: 0.2, layoutType: 'rows' },
  { id: 'emergency_route', name: 'Emergency Route', color: '#ef4444', fillOpacity: 0.15, layoutType: 'free' },
  {
    id: 'car_park',
    name: 'Car Park',
    color: '#6b7280',
    fillOpacity: 0.2,
    layoutType: 'grid',
    subTypes: [
      { id: 'car', unitArea: 30 },
      { id: 'bike', unitArea: 4 },
      { id: 'bus', unitArea: 60 },
    ],
  },
  { id: 'camping', name: 'Camping', color: '#22d3ee', fillOpacity: 0.15, layoutType: 'grid' },
  { id: 'sterile', name: 'Sterile Area', color: '#fbbf24', fillOpacity: 0.15, layoutType: 'free' },
  { id: 'production', name: 'Production Compound', color: '#a78bfa', fillOpacity: 0.2, layoutType: 'grid' },
]

export const CROWD_DENSITY_OPTIONS = [
  { label: 'Standing (dense)', value: 1.0, description: '1 person / m²' },
  { label: 'Normal crowd', value: 0.5, description: '0.5 person / m²' },
  { label: 'Relaxed / festival', value: 0.25, description: '0.25 person / m²' },
  { label: 'Seated / spaced', value: 0.1, description: '0.1 person / m²' },
]

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
  if (zone?.zoneType?.id === 'car_park' || zone?.zoneType?.name === 'Car Park') {
    return computeParkingCapacity(zone)
  }
  if (zone.subType?.unitArea) {
    return Math.floor(zone.areaM2 / zone.subType.unitArea)
  }
  return Math.round(zone.areaM2 * density)
}

export function getZoneAllowedAssetTypes(zone) {
  return zone?.allowedAssetTypes || zone?.zoneType?.allowedAssetTypes || []
}

export function getAssetName(assetId) {
  return ASSET_NAME_BY_ID[assetId] || assetId
}

export function getAssetById(assetId) {
  return ASSET_BY_ID[assetId] || null
}

export function isAssetAllowedInZone(zone, assetDefId) {
  const allowedAssetTypes = getZoneAllowedAssetTypes(zone)
  if (!allowedAssetTypes.length) return true
  return allowedAssetTypes.includes(assetDefId)
}
