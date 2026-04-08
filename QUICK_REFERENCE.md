# EventWiz State Management - Quick Reference Card

## Installation
```bash
npm install zustand
```

## Setup (App.jsx)
```jsx
import { hydrateMapEditorStore } from './store/mapEditorStore'
import { useMapEditorAutosave } from './hooks/useMapEditorAutosave'

function App() {
  useEffect(() => hydrateMapEditorStore(), [])
  useMapEditorAutosave(4000, true)
  
  return <MapCanvas />
}
```

## Use in Components
```jsx
// Read state (use selectors!)
const zones = useMapEditorStore(state => state.zones)
const assets = useMapEditorStore(state => state.assets)

// Perform actions
const addZone = useMapEditorStore(state => state.addZone)
const updateZone = useMapEditorStore(state => state.updateZone)
const deleteZone = useMapEditorStore(state => state.deleteZone)

// Create zone
addZone({ id: 'z1', name: 'Zone A', capacity: 100 })

// Update zone
updateZone({ id: 'z1', name: 'Zone B', capacity: 150 })

// Delete zone
deleteZone('z1')
```

## Store Actions

### Zones
- `addZone(zone)` - Add new zone, returns new state
- `updateZone(zone)` - Update zone, returns updated list
- `deleteZone(id)` - Delete zone by ID
- `getZoneById(id)` - Get single zone

### Assets
- `addAsset(asset)` - Add new asset
- `updateAsset(asset)` - Update asset
- `deleteAsset(id)` - Delete asset by ID
- `getAssetById(id)` - Get single asset

### Map & Grid
- `setMapCenter({ lat, lng })`
- `setMapZoom(number)`
- `setGridEnabled(boolean)`
- `setGridSize(number)`

### Utilities
- `setInitialState(data)` - Restore full state
- `reset()` - Clear everything
- `hydrateMapEditorStore()` - Load from localStorage
- `saveToLocalStorage()` - Force save

## State Structure
```js
{
  eventId: string | null,
  map: { center: {lat, lng}, zoom: 13 },
  grid: { enabled: true, size: 10 },
  zones: [ { id, name, capacity, ... } ],
  assets: [ { id, x, y, width, height, ... } ],
  version: 1
}
```

## localStorage Details
- **Key:** `"event-map-draft"`
- **Auto-saved:** Every 4 seconds (after changes)
- **Format:** JSON string
- **Includes:** eventId, map, grid, zones, assets, version, savedAt

## Performance Tips
```jsx
// ✅ GOOD - Only re-renders when zones change
const zones = useMapEditorStore(state => state.zones)

// ❌ BAD - Re-renders on ANY state change
const { zones } = useMapEditorStore()

// ✅ GOOD - Stable action reference
const updateZone = useMapEditorStore(state => state.updateZone)

// Use in event handlers without dependency warnings
<button onClick={() => updateZone(data)}>
```

## Autosave Configuration
```jsx
// Default: 3 seconds, enabled
useMapEditorAutosave()

// Custom: 5 seconds
useMapEditorAutosave(5000, true)

// Manual save only
const { triggerSave } = useMapEditorAutosave(3000, false)
triggerSave() // Force save immediately
```

## Debugging
```js
// Check localStorage
localStorage.getItem('event-map-draft')

// Force save
import { saveToLocalStorage } from './store/mapEditorStore'
saveToLocalStorage()

// Force load
import { hydrateMapEditorStore } from './store/mapEditorStore'
hydrateMapEditorStore()

// View state in console
import useMapEditorStore from './store/mapEditorStore'
console.log(useMapEditorStore.getState())

// Subscribe to all changes (for debugging)
useMapEditorStore.subscribe(state => console.log('State:', state))
```

## Redux DevTools
```bash
npm install --save-dev redux-devtools-js
# Open Chrome DevTools → Redux tab
# View timeline of state changes
```

## Common Patterns

### Component with CRUD
```jsx
function ZoneManager() {
  const zones = useMapEditorStore(state => state.zones)
  const { addZone, updateZone, deleteZone } = useMapEditorStore(state => ({
    addZone: state.addZone,
    updateZone: state.updateZone,
    deleteZone: state.deleteZone
  }))

  return (
    <div>
      <button onClick={() => addZone({ id: Date.now(), name: 'New' })}>
        Add Zone
      </button>
      {zones.map(zone => (
        <div key={zone.id}>
          {zone.name}
          <button onClick={() => updateZone({ ...zone, name: 'Updated' })}>
            Edit
          </button>
          <button onClick={() => deleteZone(zone.id)}>Delete</button>
        </div>
      ))}
    </div>
  )
}
```

### Listen to Specific Changes
```jsx
// Only called when zones array changes
useEffect(() => {
  console.log('Zones updated!')
}, [zones])

// This is the Zustand way (more efficient)
const unsubscribe = useMapEditorStore.subscribe(
  state => state.zones,
  zones => console.log('Zones updated:', zones)
)

// Clean up
return () => unsubscribe()
```

### Computed/Derived State
```jsx
// In component
const zones = useMapEditorStore(state => state.zones)
const zoneCount = zones.length  // Derived

// Better option (optional)
const zoneCount = useMapEditorStore(state => state.zones.length)
```

## Files Reference
| File | Purpose | Key Exports |
|------|---------|-------------|
| `store/mapEditorStore.js` | Store definition | useMapEditorStore, hydrateMapEditorStore, saveToLocalStorage |
| `hooks/useMapEditorAutosave.js` | Autosave logic | useMapEditorAutosave |
| `README_STATE_MANAGEMENT.md` | Full docs | — |
| `USAGE_EXAMPLES.md` | 10 examples | — |
| `INTEGRATION_GUIDE.md` | Integration steps | — |

## Troubleshooting

**Store not saving?**
- Verify `useMapEditorAutosave(4000, true)` in App.jsx
- Check localStorage key: `"event-map-draft"`
- Wait 4 seconds after making changes

**State not updating?**
- Use selectors: `const zones = useMapEditorStore(state => state.zones)`
- Avoid destructuring: `const { zones } = useMapEditorStore()` ❌

**Lost after reload?**
- Check `hydrateMapEditorStore()` is called in useEffect
- Verify localStorage has "event-map-draft" key
- Check browser isn't in private mode

**Too many re-renders?**
- Use React DevTools Profiler
- Switch to selector-based subscriptions
- Avoid full store destructuring

## Import Examples
```jsx
// Read state
import useMapEditorStore from './store/mapEditorStore'
const zones = useMapEditorStore(state => state.zones)

// Enable autosave
import { useMapEditorAutosave } from './hooks/useMapEditorAutosave'
useMapEditorAutosave(4000, true)

// Hydration
import { hydrateMapEditorStore } from './store/mapEditorStore'
hydrateMapEditorStore()

// Force save
import { saveToLocalStorage } from './store/mapEditorStore'
saveToLocalStorage()
```

## Key Concepts

**Selectors:**
- Extract only the data you need
- Prevent unnecessary re-renders
- Stable references across renders

**Debounce:**
- Groups fast changes together
- Saves only when user stops (4 seconds)
- No save on mouse moves, only commits

**Hydration:**
- Load persisted state on app start
- Happens automatically on mount
- Falls back to empty state if no localStorage

**localStorage:**
- Browser persistent storage
- Key: "event-map-draft"
- Survives page reloads
- Limited: ~5-10MB per domain

## API Response
```js
// What gets returned from actions
addZone(zone)     // → { ...state, zones: [..., newZone] }
updateZone(zone)  // → { ...state, zones: [updated] }
deleteZone(id)    // → { ...state, zones: [remaining] }

// These don't return anything (void)
setMapZoom(13)    // Sets zoom, triggers subscribers
setGridSize(10)   // Sets size, triggers subscribers
```

## Next Steps
1. ✅ Install: `npm install zustand`
2. ✅ Integrate: Add to App.jsx
3. ✅ Enable autosave: Call hook
4. ✅ Test: Create/update/delete zones
5. ✅ Verify: Check localStorage persists
6. ✅ Optimize: Use selectors in components

---

**Need more details?** See `README_STATE_MANAGEMENT.md`  
**Want examples?** See `USAGE_EXAMPLES.md`  
**Integrating?** See `INTEGRATION_GUIDE.md`
