import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

const STORAGE_KEY = 'event-map-draft'
const STORE_VERSION = 1

/**
 * Zustand store for map editor state management
 * Handles zones, assets, map settings, and grid configuration
 */
const useMapEditorStore = create(
  devtools(
    (set, get) => ({
      // State
      eventId: null,
      measurementUnit: 'meters', // 'meters' or 'feet'
      map: {
        center: { lat: 23.0225, lng: 72.5714 },
        zoom: 14,
      },
      grid: {
        enabled: false,
        size: 10, // in meters
      },
      zones: [],
      assets: [],
      version: STORE_VERSION,

      // Derived state helpers
      getZoneById: (id) => {
        const state = get()
        return state.zones.find(zone => zone.id === id)
      },
      
      getAssetById: (id) => {
        const state = get()
        return state.assets.find(asset => asset.id === id)
      },

      // Get all assets in a specific zone
      getAssetsByZone: (zoneId) => {
        const state = get()
        return state.assets.filter(asset => asset.parentId === zoneId)
      },

      // Actions: Initialization
      setInitialState: (data) => {
        set({
          eventId: data.eventId || null,
          measurementUnit: data.measurementUnit || 'meters',
          map: data.map || { center: { lat: 23.0225, lng: 72.5714 }, zoom: 14 },
          grid: data.grid || { enabled: false, size: 10 },
          zones: data.zones || [],
          assets: data.assets || [],
          version: data.version || STORE_VERSION,
        })
      },

      // Actions: Measurement unit
      setMeasurementUnit: (unit) => {
        if (unit === 'meters' || unit === 'feet') {
          set({ measurementUnit: unit })
        }
      },

      // Actions: Zone management
      addZone: (zone) => {
        const state = get()
        const newZone = {
          id: zone.id || `zone_${Date.now()}`,
          createdAt: zone.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          visible: zone.visible !== undefined ? zone.visible : true, // Zone visibility toggle
          status: zone.status || 'planned', // Default status
          ...zone,
        }
        set({ zones: [...state.zones, newZone] })
      },

      updateZone: (zone) => {
        const state = get()
        const updatedZones = state.zones.map(z =>
          z.id === zone.id
            ? { ...z, ...zone, updatedAt: new Date().toISOString() }
            : z
        )
        set({ zones: updatedZones })
      },

      deleteZone: (id) => {
        const state = get()
        set({ zones: state.zones.filter(z => z.id !== id) })
      },

      // Actions: Asset management
      addAsset: (asset) => {
        const state = get()
        const newAsset = {
          id: asset.id || `asset_${Date.now()}`,
          createdAt: asset.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...asset,
        }
        set({ assets: [...state.assets, newAsset] })
      },

      updateAsset: (asset) => {
        const state = get()
        const updatedAssets = state.assets.map(a =>
          a.id === asset.id
            ? { ...a, ...asset, updatedAt: new Date().toISOString() }
            : a
        )
        set({ assets: updatedAssets })
      },

      deleteAsset: (id) => {
        const state = get()
        set({ assets: state.assets.filter(a => a.id !== id) })
      },

      // Actions: Map settings
      setMapCenter: (center) => {
        const state = get()
        set({ map: { ...state.map, center } })
      },

      setMapZoom: (zoom) => {
        const state = get()
        set({ map: { ...state.map, zoom } })
      },

      // Actions: Grid settings
      setGridEnabled: (enabled) => {
        const state = get()
        set({ grid: { ...state.grid, enabled } })
      },

      setGridSize: (size) => {
        const state = get()
        set({ grid: { ...state.grid, size } })
      },

      // Reset state
      reset: () => {
        set({
          eventId: null,
          map: { center: { lat: 23.0225, lng: 72.5714 }, zoom: 14 },
          grid: { enabled: false, size: 10 },
          zones: [],
          assets: [],
          version: STORE_VERSION,
        })
      },
    }),
    {
      name: 'MapEditorStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
)

/**
 * Hydrate store from localStorage on app load
 */
export const hydrateMapEditorStore = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const data = JSON.parse(stored)
      
      // Validate stored data structure
      if (data && typeof data === 'object') {
        useMapEditorStore.getState().setInitialState(data)
        console.log('✅ Hydrated map editor store from localStorage')
        return true
      }
    }
  } catch (error) {
    console.error('❌ Failed to hydrate map editor store:', error)
  }
  return false
}

/**
 * Get only the data that should be persisted
 */
export const getSaveableState = () => {
  const state = useMapEditorStore.getState()
  return {
    eventId: state.eventId,
    map: state.map,
    grid: state.grid,
    zones: state.zones,
    assets: state.assets,
    version: state.version,
    savedAt: new Date().toISOString(),
  }
}

/**
 * Save state to localStorage
 */
export const saveToLocalStorage = () => {
  try {
    const saveableState = getSaveableState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveableState))
    console.log('💾 Saved to localStorage:', saveableState)
    return true
  } catch (error) {
    console.error('❌ Failed to save to localStorage:', error)
    return false
  }
}

/**
 * Clear localStorage draft
 */
export const clearStorageDraft = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
    console.log('🗑️ Cleared localStorage draft')
    return true
  } catch (error) {
    console.error('❌ Failed to clear localStorage:', error)
    return false
  }
}

export default useMapEditorStore
