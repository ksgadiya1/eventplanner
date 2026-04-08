/**
 * MAP EDITOR STATE MANAGEMENT - USAGE GUIDE
 * 
 * This guide demonstrates how to use the Zustand-based state management
 * system with autosave functionality for the map editor.
 */

// ============================================================================
// 1. SETUP IN APP.JSX
// ============================================================================

import { useEffect } from 'react'
import useMapEditorStore, { hydrateMapEditorStore } from './store/mapEditorStore'
import { useMapEditorAutosave } from './hooks/useMapEditorAutosave'

function App() {
  // Initialize state from localStorage on app mount
  useEffect(() => {
    hydrateMapEditorStore() // Load saved draft if it exists
  }, [])

  return (
    <div>
      <MapEditor />
      <AssetPanel />
      <ZoneManager />
    </div>
  )
}

// ============================================================================
// 2. BASIC USAGE IN COMPONENTS
// ============================================================================

function MapEditor() {
  // Enable autosave with 4 second debounce
  const { triggerSave } = useMapEditorAutosave(4000, true)

  // Get state from store
  const map = useMapEditorStore(state => state.map)
  const setMapZoom = useMapEditorStore(state => state.setMapZoom)
  const setMapCenter = useMapEditorStore(state => state.setMapCenter)

  const handleZoomChange = (newZoom) => {
    setMapZoom(newZoom)
    // Autosave will trigger automatically after 4 seconds of inactivity
  }

  const handleMapCenter = (newCenter) => {
    setMapCenter(newCenter)
    // Or manually trigger save
    triggerSave()
  }

  return (
    <div>
      <h2>Map Editor</h2>
      <p>Current Zoom: {map.zoom}</p>
      <button onClick={() => handleZoomChange(map.zoom + 1)}>Zoom In</button>
      <button onClick={() => handleZoomChange(map.zoom - 1)}>Zoom Out</button>
    </div>
  )
}

// ============================================================================
// 3. ADDING AND MANAGING ZONES
// ============================================================================

function ZoneManager() {
  const { triggerSave } = useMapEditorAutosave()
  
  // Select only zones from store (prevents re-renders on other state changes)
  const zones = useMapEditorStore(state => state.zones)
  const addZone = useMapEditorStore(state => state.addZone)
  const updateZone = useMapEditorStore(state => state.updateZone)
  const deleteZone = useMapEditorStore(state => state.deleteZone)

  const handleCreateZone = () => {
    const newZone = {
      id: `zone_${Date.now()}`,
      name: 'New Zone',
      type: 'polygon',
      path: [
        { lat: 23.0225, lng: 72.5714 },
        { lat: 23.0235, lng: 72.5724 },
        { lat: 23.0215, lng: 72.5734 },
      ],
      color: '#3d8ef8',
      areaM2: 1500,
      capacity: 50,
    }
    addZone(newZone)
    // Autosave triggers after debounce
  }

  const handleUpdateZone = (zoneId, updates) => {
    updateZone({
      id: zoneId,
      ...updates,
    })
  }

  const handleDeleteZone = (zoneId) => {
    deleteZone(zoneId)
  }

  return (
    <div>
      <h2>Zones ({zones.length})</h2>
      <button onClick={handleCreateZone}>Create Zone</button>
      
      <ul>
        {zones.map(zone => (
          <li key={zone.id}>
            {zone.name} - {zone.areaM2}m² - {zone.capacity} capacity
            <button onClick={() => handleUpdateZone(zone.id, { capacity: zone.capacity + 10 })}>
              Increase Capacity
            </button>
            <button onClick={() => handleDeleteZone(zone.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================
// 4. ADDING AND MANAGING ASSETS
// ============================================================================

function AssetPanel() {
  const { triggerSave } = useMapEditorAutosave()

  const assets = useMapEditorStore(state => state.assets)
  const addAsset = useMapEditorStore(state => state.addAsset)
  const updateAsset = useMapEditorStore(state => state.updateAsset)
  const deleteAsset = useMapEditorStore(state => state.deleteAsset)

  const handlePlaceAsset = (assetType) => {
    const newAsset = {
      id: `asset_${Date.now()}`,
      type: assetType,
      name: `${assetType} ${assets.length + 1}`,
      lat: 23.0225,
      lng: 72.5714,
      rotationDeg: 0,
      widthM: 2,
      lengthM: 2,
    }
    addAsset(newAsset)
  }

  const handleMoveAsset = (assetId, newLat, newLng) => {
    updateAsset({
      id: assetId,
      lat: newLat,
      lng: newLng,
    })
  }

  const handleRotateAsset = (assetId, rotationDeg) => {
    updateAsset({
      id: assetId,
      rotationDeg,
    })
  }

  return (
    <div>
      <h2>Assets ({assets.length})</h2>
      <button onClick={() => handlePlaceAsset('chair')}>Place Chair</button>
      <button onClick={() => handlePlaceAsset('table')}>Place Table</button>
      <button onClick={() => handlePlaceAsset('stage')}>Place Stage</button>

      <ul>
        {assets.map(asset => (
          <li key={asset.id}>
            {asset.name} at ({asset.lat}, {asset.lng})
            <button onClick={() => handleMoveAsset(asset.id, asset.lat + 0.0005, asset.lng)}>
              Move
            </button>
            <button onClick={() => handleRotateAsset(asset.id, (asset.rotationDeg + 90) % 360)}>
              Rotate
            </button>
            <button onClick={() => deleteAsset(asset.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================
// 5. GRID MANAGEMENT
// ============================================================================

function GridSettings() {
  const { triggerSave } = useMapEditorAutosave()

  const grid = useMapEditorStore(state => state.grid)
  const setGridEnabled = useMapEditorStore(state => state.setGridEnabled)
  const setGridSize = useMapEditorStore(state => state.setGridSize)

  return (
    <div>
      <h2>Grid Settings</h2>
      <label>
        <input
          type="checkbox"
          checked={grid.enabled}
          onChange={(e) => setGridEnabled(e.target.checked)}
        />
        Enable Grid
      </label>
      {grid.enabled && (
        <div>
          <label>
            Grid Size (meters):
            <input
              type="number"
              min="1"
              max="50"
              value={grid.size}
              onChange={(e) => setGridSize(parseInt(e.target.value))}
            />
          </label>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 6. ADVANCED: GETTING ALL STATE AT ONCE
// ============================================================================

function ExportData() {
  const allState = useMapEditorStore()

  const handleExport = () => {
    const data = {
      eventId: allState.eventId,
      map: allState.map,
      grid: allState.grid,
      zones: allState.zones,
      assets: allState.assets,
      exportedAt: new Date().toISOString(),
    }
    console.log('Export data:', data)
    // Send to server or download as JSON
  }

  const handleImport = (jsonData) => {
    allState.setInitialState(jsonData)
  }

  return (
    <div>
      <button onClick={handleExport}>Export Map Data</button>
      <button onClick={() => allState.reset()}>Reset All</button>
    </div>
  )
}

// ============================================================================
// 7. PERFORMANCE: SELECTORS TO PREVENT UNNECESSARY RE-RENDERS
// ============================================================================

/**
 * Good - Uses selector to only subscribe to zones
 * Component re-renders ONLY when zones change
 */
function ZoneList() {
  const zones = useMapEditorStore(state => state.zones)
  return <div>{zones.length} zones</div>
}

/**
 * Avoid - Subscribes to entire store
 * Component re-renders on ANY state change (map move, asset update, etc.)
 */
function ZoneListBad() {
  const { zones } = useMapEditorStore() // DON'T DO THIS
  return <div>{zones.length} zones</div>
}

// ============================================================================
// 8. AUTOSAVE CONFIGURATION
// ============================================================================

/**
 * Customize autosave behavior
 */
function CustomMapEditor() {
  // 5 second debounce, enabled
  const { triggerSave: save5s } = useMapEditorAutosave(5000, true)

  // 2 second debounce (more aggressive)
  const { triggerSave: save2s } = useMapEditorAutosave(2000, true)

  // Disabled (manual save only)
  const { triggerSave: manualSave } = useMapEditorAutosave(3000, false)

  const handleManualSave = () => {
    manualSave() // Explicitly trigger save
  }

  return (
    <button onClick={handleManualSave}>Save Now</button>
  )
}

// ============================================================================
// 9. INITIALIZATION FLOW
// ============================================================================

/**
 * Complete initialization flow:
 * 
 * 1. App mounts
 * 2. Call hydrateMapEditorStore() to load localStorage data
 * 3. Enable useMapEditorAutosave() in components
 * 4. State changes trigger debounced auto-save to localStorage
 * 5. On app reload, previous state is restored
 */

// ============================================================================
// 10. STORAGE FORMAT
// ============================================================================

/**
 * What gets saved to localStorage:
 * 
 * Key: "event-map-draft"
 * 
 * {
 *   "eventId": "event-123",
 *   "map": {
 *     "center": { "lat": 23.0225, "lng": 72.5714 },
 *     "zoom": 14
 *   },
 *   "grid": {
 *     "enabled": true,
 *     "size": 10
 *   },
 *   "zones": [
 *     {
 *       "id": "zone_1234567890",
 *       "name": "Main Area",
 *       "type": "polygon",
 *       "path": [...],
 *       "color": "#3d8ef8",
 *       "areaM2": 1500,
 *       "capacity": 50,
 *       "createdAt": "2024-04-06T...",
 *       "updatedAt": "2024-04-06T..."
 *     }
 *   ],
 *   "assets": [
 *     {
 *       "id": "asset_1234567890",
 *       "type": "chair",
 *       "name": "Chair 1",
 *       "lat": 23.0225,
 *       "lng": 72.5714,
 *       "rotationDeg": 45,
 *       "widthM": 0.5,
 *       "lengthM": 0.5,
 *       "createdAt": "2024-04-06T...",
 *       "updatedAt": "2024-04-06T..."
 *     }
 *   ],
 *   "version": 1,
 *   "savedAt": "2024-04-06T..."
 * }
 */

export {
  App,
  MapEditor,
  ZoneManager,
  AssetPanel,
  GridSettings,
  ExportData,
  CustomMapEditor,
}
