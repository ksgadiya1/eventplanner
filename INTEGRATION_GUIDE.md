# Integration Guide: Adding Zustand to EventWiz

This guide shows exactly how to update your existing `App.jsx` to use the new Zustand store with autosave.

## Prerequisites

```bash
npm install zustand
```

## Current State (App.jsx - Before)

Your current `App.jsx` likely has:

```jsx
import { useState, useEffect } from 'react'
import MapCanvas from './components/MapCanvas'
import Sidebar from './components/Sidebar'
import PropertiesPanel from './components/PropertiesPanel'
import StatsBar from './components/StatsBar'

export default function App() {
  // Local state management
  const [zones, setZones] = useState([])
  const [assets, setAssets] = useState([])
  const [selectedZone, setSelectedZone] = useState(null)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [mapSettings, setMapSettings] = useState({
    center: { lat: 40.7128, lng: -74.0060 },
    zoom: 13
  })

  // Event details from API
  const [eventDetails, setEventDetails] = useState(null)

  // Pass everything as props down to MapCanvas
  return (
    <div className="app-container">
      <Sidebar zones={zones} onZoneSelect={setSelectedZone} />
      <MapCanvas 
        zones={zones}
        assets={assets}
        selectedZone={selectedZone}
        onZonesChange={setZones}
        mapSettings={mapSettings}
        onMapSettingsChange={setMapSettings}
      />
      <PropertiesPanel zone={selectedZone} asset={selectedAsset} />
      <StatsBar />
    </div>
  )
}
```

## Integration Steps

### Step 1: Import Store and Hook

```jsx
import { useState, useEffect } from 'react'
import useMapEditorStore, { hydrateMapEditorStore } from './store/mapEditorStore'
import { useMapEditorAutosave } from './hooks/useMapEditorAutosave'
import MapCanvas from './components/MapCanvas'
// ... other imports
```

### Step 2: Add Hydration on Mount

```jsx
export default function App() {
  // Initialize store from localStorage on app load
  useEffect(() => {
    hydrateMapEditorStore()
  }, [])

  // Enable autosave with 4 second debounce
  useMapEditorAutosave(4000, true)

  // Keep local state only for UI concerns (not data!)
  const [selectedZone, setSelectedZone] = useState(null)
  const [selectedAsset, setSelectedAsset] = useState(null)

  // ... rest of component
}
```

### Step 3: Use Store Instead of useState

**BEFORE:**
```jsx
const [zones, setZones] = useState([])
const [assets, setAssets] = useState([])
const [mapSettings, setMapSettings] = useState({...})

// Pass as props
<MapCanvas zones={zones} onZonesChange={setZones} />
```

**AFTER:**
```jsx
// No useState for data anymore - use store selectors
const zones = useMapEditorStore(state => state.zones)
const assets = useMapEditorStore(state => state.assets)
const mapSettings = useMapEditorStore(state => ({
  center: state.map.center,
  zoom: state.map.zoom
}))

// Store actions (memoized by Zustand)
const addZone = useMapEditorStore(state => state.addZone)
const updateZone = useMapEditorStore(state => state.updateZone)
const deleteZone = useMapEditorStore(state => state.deleteZone)
const addAsset = useMapEditorStore(state => state.addAsset)
const updateAsset = useMapEditorStore(state => state.updateAsset)
const deleteAsset = useMapEditorStore(state => state.deleteAsset)
const setMapCenter = useMapEditorStore(state => state.setMapCenter)
const setMapZoom = useMapEditorStore(state => state.setMapZoom)

// No more prop drilling needed
<MapCanvas />
```

### Step 4: Optional - Set Event ID

When you load event details, set the event ID in the store:

```jsx
const [eventDetails, setEventDetails] = useState(null)

useEffect(() => {
  // Fetch event from API
  const loadEvent = async () => {
    const response = await fetch(`/api/events/${eventId}`)
    const data = await response.json()
    setEventDetails(data)
    
    // Store the event ID for autosave context
    useMapEditorStore.setState({ eventId: data.id })
  }
  
  loadEvent()
}, [eventId])
```

## Complete Updated App.jsx

```jsx
import { useState, useEffect } from 'react'
import useMapEditorStore, { hydrateMapEditorStore } from './store/mapEditorStore'
import { useMapEditorAutosave } from './hooks/useMapEditorAutosave'
import MapCanvas from './components/MapCanvas'
import Sidebar from './components/Sidebar'
import PropertiesPanel from './components/PropertiesPanel'
import StatsBar from './components/StatsBar'
import './index.css'

export default function App() {
  // 1. Hydrate store from localStorage on app load
  useEffect(() => {
    hydrateMapEditorStore()
  }, [])

  // 2. Enable autosave (4 seconds debounce)
  useMapEditorAutosave(4000, true)

  // 3. Keep only UI state (not data!)
  const [selectedZone, setSelectedZone] = useState(null)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [eventDetails, setEventDetails] = useState(null)

  // 4. Get data from store instead of local state
  const zones = useMapEditorStore(state => state.zones)
  const assets = useMapEditorStore(state => state.assets)
  const map = useMapEditorStore(state => state.map)

  // 5. Get store actions (these are stable references)
  const addZone = useMapEditorStore(state => state.addZone)
  const updateZone = useMapEditorStore(state => state.updateZone)
  const deleteZone = useMapEditorStore(state => state.deleteZone)
  const addAsset = useMapEditorStore(state => state.addAsset)
  const updateAsset = useMapEditorStore(state => state.updateAsset)
  const deleteAsset = useMapEditorStore(state => state.deleteAsset)

  // 6. Optional: Set event ID when loaded
  const setEventId = useMapEditorStore(state => state.setEventId ||
    ((id) => useMapEditorStore.setState({ eventId: id })))

  useEffect(() => {
    if (eventDetails?.id) {
      setEventId(eventDetails.id)
    }
  }, [eventDetails?.id, setEventId])

  return (
    <div className="app-container">
      <Sidebar 
        zones={zones}
        onZoneSelect={setSelectedZone}
        onZoneAdd={addZone}
        onZoneUpdate={updateZone}
        onZoneDelete={deleteZone}
      />
      
      <MapCanvas 
        selectedZone={selectedZone}
        selectedAsset={selectedAsset}
        onZoneSelect={setSelectedZone}
        onAssetSelect={setSelectedAsset}
      />
      
      <PropertiesPanel 
        zone={selectedZone}
        asset={selectedAsset}
        onZoneUpdate={updateZone}
        onAssetUpdate={updateAsset}
      />
      
      <StatsBar 
        zoneCount={zones.length}
        assetCount={assets.length}
      />
    </div>
  )
}
```

## Updating MapCanvas.jsx

Now update MapCanvas to use the store instead of receiving props:

**BEFORE:**
```jsx
export function MapCanvas({ 
  zones, 
  assets, 
  selectedZone, 
  onZonesChange,
  mapSettings,
  onMapSettingsChange 
}) {
  // Handle zones
  const handleZoneUpdate = (zone) => {
    onZonesChange([...zones.map(z => z.id === zone.id ? zone : z)])
  }
  
  // Handle map
  const handleMapZoom = (zoom) => {
    onMapSettingsChange({ ...mapSettings, zoom })
  }
  
  return (
    <GoogleMap
      zoom={mapSettings.zoom}
      center={mapSettings.center}
      onZoomChanged={handleMapZoom}
    >
      {zones.map(zone => <Zone key={zone.id} zone={zone} />)}
    </GoogleMap>
  )
}
```

**AFTER:**
```jsx
import useMapEditorStore from '../store/mapEditorStore'
import { useMapEditorAutosave } from '../hooks/useMapEditorAutosave'

export function MapCanvas({ selectedZone, onZoneSelect }) {
  // Get data from store
  const zones = useMapEditorStore(state => state.zones)
  const map = useMapEditorStore(state => state.map)
  
  // Get actions from store
  const updateZone = useMapEditorStore(state => state.updateZone)
  const setMapZoom = useMapEditorStore(state => state.setMapZoom)
  const setMapCenter = useMapEditorStore(state => state.setMapCenter)

  // Autosave is already enabled in App.jsx, but can be managed here too
  useMapEditorAutosave(4000, true)

  const handleZoneUpdate = (zone) => {
    updateZone(zone)
    // Automatically saves after 4 seconds
  }

  const handleMapZoom = (zoom) => {
    setMapZoom(zoom)
  }

  return (
    <GoogleMap
      zoom={map.zoom}
      center={map.center}
      onZoomChanged={handleMapZoom}
    >
      {zones.map(zone => (
        <Zone 
          key={zone.id} 
          zone={zone}
          isSelected={zone.id === selectedZone?.id}
          onSelect={() => onZoneSelect(zone)}
          onUpdate={handleZoneUpdate}
        />
      ))}
    </GoogleMap>
  )
}
```

## Updating Sidebar.jsx

Same pattern - use store selectors:

```jsx
import useMapEditorStore from '../store/mapEditorStore'

export function Sidebar({ onZoneSelect }) {
  const zones = useMapEditorStore(state => state.zones)
  const addZone = useMapEditorStore(state => state.addZone)
  const deleteZone = useMapEditorStore(state => state.deleteZone)

  const handleAddZone = () => {
    const newZone = {
      id: `zone_${Date.now()}`,
      name: `Zone ${zones.length + 1}`,
      capacity: 0,
      // ... other properties
    }
    addZone(newZone)
  }

  return (
    <div className="sidebar">
      <button onClick={handleAddZone}>+ Add Zone</button>
      <div className="zones-list">
        {zones.map(zone => (
          <ZoneItem 
            key={zone.id}
            zone={zone}
            onSelect={() => onZoneSelect(zone)}
            onDelete={() => deleteZone(zone.id)}
          />
        ))}
      </div>
    </div>
  )
}
```

## Updating PropertiesPanel.jsx

Similar pattern:

```jsx
import useMapEditorStore from '../store/mapEditorStore'

export function PropertiesPanel({ zone, asset }) {
  const updateZone = useMapEditorStore(state => state.updateZone)
  const updateAsset = useMapEditorStore(state => state.updateAsset)

  if (zone) {
    return (
      <div className="properties-panel">
        <h2>Zone Properties</h2>
        <input
          type="text"
          value={zone.name}
          onChange={(e) => updateZone({
            ...zone,
            name: e.target.value
          })}
        />
        {/* Change triggers autosave after 4 seconds */}
      </div>
    )
  }

  if (asset) {
    return (
      <div className="properties-panel">
        <h2>Asset Properties</h2>
        {/* Similar to zone */}
      </div>
    )
  }

  return <div className="properties-panel">Select an item</div>
}
```

## Key Changes Summary

| Aspect | Before | After |
|--------|--------|-------|
| **State Management** | useState + prop drilling | Zustand store |
| **Data persistence** | Manual localStorage | Automatic autosave |
| **Re-renders** | All children when any state changes | Only affected components |
| **Prop passing** | Deeply nested (10+ levels) | Direct store access |
| **Change detection** | Manual tracking | Built-in store subscription |
| **Code lines in App.jsx** | ~40 lines state | ~15 lines store access |

## Benefits Realized

✅ **Eliminated prop drilling** - Reduced from 10 levels to direct access  
✅ **Automatic persistence** - Changes saved every 4 seconds  
✅ **Better performance** - Only components using changed data re-render  
✅ **Simpler components** - Sidebar, MapCanvas don't manage state anymore  
✅ **Easier debugging** - Redux DevTools shows exact state changes  
✅ **Ready for backend** - Easy to add server sync layer  

## Testing After Integration

1. **Add a zone** - Check localStorage has new data
2. **Refresh page** - Verify zone is still there (loaded from localStorage)
3. **Update zone properties** - Verify save happens after 4 seconds (check localStorage)
4. **Quick edits** - Make 5 edits in 2 seconds, verify only ONE save occurs (debounce working)
5. **Redux DevTools** - Install Redux DevTools extension, verify all state changes visible

## Troubleshooting

**Components not updating when store changes?**
- Make sure you're using a selector: `const zones = useMapEditorStore(state => state.zones)`
- Avoid destructuring whole store: `const { zones } = useMapEditorStore()` ❌

**Store changes not saving?**
- Verify `useMapEditorAutosave(4000, true)` is called in App.jsx root
- Check that debounce period (4000ms) has elapsed
- Check browser DevTools → Application → localStorage for "event-map-draft" key

**Seeing too many re-renders?**
- Use React DevTools Profiler
- Verify components use selectors
- Add `console.log()` in components to verify what's triggering renders

## Next: Backend Integration (Optional)

Once localStorage is working:

```jsx
// 1. Fetch from server instead of localStorage
async function hydrateFromServer(eventId) {
  const response = await fetch(`/api/events/${eventId}/map`)
  const data = await response.json()
  useMapEditorStore.getState().setInitialState(data)
}

// 2. Sync saves to server
async function saveToServer() {
  const state = getSaveableState()
  await fetch(`/api/events/${state.eventId}/map`, {
    method: 'PUT',
    body: JSON.stringify(state)
  })
}

// 3. Replace localStorage save with server sync
// Modify useMapEditorAutosave or create new hook for server sync
```

## Quick Checklist

- [ ] `npm install zustand`
- [ ] Import store and hook in App.jsx
- [ ] Call `hydrateMapEditorStore()` in useEffect
- [ ] Call `useMapEditorAutosave(4000, true)` in App.jsx
- [ ] Replace useState with store selectors
- [ ] Update MapCanvas to use store
- [ ] Update Sidebar to use store
- [ ] Update PropertiesPanel to use store
- [ ] Test localStorage persistence
- [ ] Test autosave (check timestamp in localStorage)
- [ ] Test component re-renders are optimized

You're ready to integrate! 🚀
