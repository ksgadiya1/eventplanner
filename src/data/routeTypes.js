export const ROUTE_TYPE_OPTIONS = [
  {
    id: 'custom',
    label: 'Custom Route',
    description: 'Flexible custom path for special use',
    color: '#475569',
    pattern: 'dashed',
    weight: 4,
  },
  {
    id: 'pedestrian',
    label: 'Pedestrian Route',
    description: 'Walking and crowd movement',
    color: '#2563eb',
    pattern: 'dashed',
    weight: 4,
  },
  {
    id: 'traffic',
    label: 'Traffic Movement',
    description: 'General traffic and crowd flow',
    color: '#0f766e',
    pattern: 'dashed',
    weight: 4,
  },
  {
    id: 'vehicle',
    label: 'Vehicle Route',
    description: 'Service and vehicle access',
    color: '#f59e0b',
    pattern: 'dashed',
    weight: 5,
  },
  {
    id: 'vip',
    label: 'VIP Route',
    description: 'Restricted or priority access',
    color: '#7c3aed',
    pattern: 'solid',
    weight: 5,
  },
  {
    id: 'ambulance',
    label: 'Ambulance Route',
    description: 'Medical emergency movement',
    color: '#dc2626',
    pattern: 'solid',
    weight: 5,
  },
  {
    id: 'emergency',
    label: 'Emergency Route',
    description: 'Emergency response and evacuation',
    color: '#ef4444',
    pattern: 'dashed',
    weight: 5,
  },
  {
    id: 'fire',
    label: 'Fire Line',
    description: 'Fire tender and fire lane access',
    color: '#b91c1c',
    pattern: 'solid',
    weight: 5,
  },
  {
    id: 'electricity',
    label: 'Electric Line',
    description: 'Power and electrical routing',
    color: '#ca8a04',
    pattern: 'dotted',
    weight: 4,
  },
  {
    id: 'water',
    label: 'Water Supply Line',
    description: 'Water and utility pipeline route',
    color: '#0891b2',
    pattern: 'dotted',
    weight: 4,
  },
  {
    id: 'parking',
    label: 'Parking Way',
    description: 'Parking entry and exit path',
    color: '#10b981',
    pattern: 'dotted',
    weight: 4,
  },
]

export const ROUTE_STYLE_PRESETS = Object.fromEntries(
  ROUTE_TYPE_OPTIONS.map((option) => [
    option.id,
    {
      routeType: option.id,
      label: option.label,
      color: option.color,
      pattern: option.pattern,
      weight: option.weight,
    },
  ])
)

export function getRouteStylePreset(routeType = 'custom') {
  return ROUTE_STYLE_PRESETS[routeType] || ROUTE_STYLE_PRESETS.custom
}
