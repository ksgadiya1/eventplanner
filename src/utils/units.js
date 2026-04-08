/**
 * Unit conversion utilities for measurement display
 */

const METERS_TO_FEET = 3.28084
const FEET_TO_METERS = 1 / METERS_TO_FEET

/**
 * Convert meters to the selected unit
 */
export function convertDistance(meters, unit = 'meters') {
  if (unit === 'feet') {
    return meters * METERS_TO_FEET
  }
  return meters
}

/**
 * Convert from selected unit to meters for storage
 */
export function convertToMeters(value, unit = 'meters') {
  if (unit === 'feet') {
    return value * FEET_TO_METERS
  }
  return value
}

/**
 * Format distance for display with appropriate unit
 */
export function formatDistance(meters, unit = 'meters', precision = 2) {
  if (!meters && meters !== 0) return 'N/A'

  const converted = convertDistance(meters, unit)
  const unitLabel = unit === 'feet' ? 'ft' : 'm'

  if (converted >= 1000 && unit === 'meters') {
    return `${(converted / 1000).toFixed(precision)} km`
  }

  if (converted >= 3280 && unit === 'feet') {
    return `${(converted / 5280).toFixed(precision)} mi`
  }

  return `${converted.toFixed(precision)} ${unitLabel}`
}

/**
 * Format area for display with appropriate unit
 */
export function formatArea(squareMeters, unit = 'meters', precision = 2) {
  if (!squareMeters && squareMeters !== 0) return 'N/A'

  if (unit === 'feet') {
    const squareFeet = squareMeters * (METERS_TO_FEET * METERS_TO_FEET)
    if (squareFeet >= 1000000) {
      return `${(squareFeet / 1000000).toFixed(precision)} sq mi`
    }
    return `${squareFeet.toFixed(precision)} sq ft`
  }

  if (squareMeters >= 1000000) {
    return `${(squareMeters / 1000000).toFixed(precision)} km²`
  }

  return `${squareMeters.toFixed(precision)} m²`
}

/**
 * Get display unit label
 */
export function getUnitLabel(unit = 'meters') {
  return unit === 'feet' ? 'ft' : 'm'
}

/**
 * Get area unit label
 */
export function getAreaUnitLabel(unit = 'meters') {
  return unit === 'feet' ? 'sq ft' : 'm²'
}
