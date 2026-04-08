# EventWiz Integration Checklist

Use this checklist to track your progress integrating Zustand state management into your EventWiz app.

## Phase 1: Setup (5 minutes)

- [ ] **Install Zustand**
  ```bash
  npm install zustand
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Verify store files exist**
  - [ ] `src/store/mapEditorStore.js` exists
  - [ ] `src/hooks/useMapEditorAutosave.js` exists
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Verify utilities extracted**
  - [ ] `src/utils/mapGeometry.js` exists
  - [ ] `src/components/MapOverlays.jsx` exists
  - [ ] `src/components/MapLayers.jsx` exists
  - [ ] `src/components/DrawingLayer.jsx` exists
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

---

## Phase 2: App.jsx Integration (10 minutes)

- [ ] **Import store and hook at top of App.jsx**
  ```jsx
  import { hydrateMapEditorStore } from './store/mapEditorStore'
  import { useMapEditorAutosave } from './hooks/useMapEditorAutosave'
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Add hydration in useEffect**
  ```jsx
  useEffect(() => {
    hydrateMapEditorStore()
  }, [])
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Enable autosave**
  ```jsx
  useMapEditorAutosave(4000, true)
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Remove old state management**
  - [ ] Remove `useState` for zones
  - [ ] Remove `useState` for assets
  - [ ] Remove `useState` for mapSettings
  - [ ] Keep only UI state (selectedZone, selectedAsset)
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Test App.jsx builds**
  ```bash
  npm run build
  ```
  Status: ⏳ Failed | ⏳ In progress | ✅ Succeeds

---

## Phase 3: MapCanvas Integration (10 minutes)

- [ ] **Import store in MapCanvas.jsx**
  ```jsx
  import useMapEditorStore from '../store/mapEditorStore'
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Replace props with store selectors**
  - [ ] `const zones = useMapEditorStore(state => state.zones)`
  - [ ] `const assets = useMapEditorStore(state => state.assets)`
  - [ ] `const map = useMapEditorStore(state => state.map)`
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Get store actions**
  - [ ] `const updateZone = useMapEditorStore(state => state.updateZone)`
  - [ ] `const updateAsset = useMapEditorStore(state => state.updateAsset)`
  - [ ] `const setMapZoom = useMapEditorStore(state => state.setMapZoom)`
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Remove prop passing to child components**
  - [ ] Remove `zones` props
  - [ ] Remove `assets` props
  - [ ] Remove `onZonesChange` callbacks
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Test MapCanvas works**
  ```bash
  npm run dev
  # Verify map loads, can create zones
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Works

---

## Phase 4: Sidebar Integration (5 minutes)

- [ ] **Import store in Sidebar.jsx**
  ```jsx
  import useMapEditorStore from '../store/mapEditorStore'
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Get zones from store**
  ```jsx
  const zones = useMapEditorStore(state => state.zones)
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Get actions from store**
  - [ ] `addZone`
  - [ ] `updateZone`
  - [ ] `deleteZone`
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Update handlers to use store actions**
  - [ ] `handleAddZone` calls `addZone()`
  - [ ] `handleEditZone` calls `updateZone()`
  - [ ] `handleDeleteZone` calls `deleteZone()`
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Test Sidebar works**
  ```bash
  npm run dev
  # Click "Add Zone", verify it appears and in localStorage
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Works

---

## Phase 5: PropertiesPanel Integration (5 minutes)

- [ ] **Import store in PropertiesPanel.jsx**
  ```jsx
  import useMapEditorStore from '../store/mapEditorStore'
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Get actions from store**
  - [ ] `updateZone`
  - [ ] `updateAsset`
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Update property change handlers**
  - [ ] Name change calls `updateZone()`
  - [ ] Capacity change calls `updateZone()`
  - [ ] Other properties call appropriate action
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Test PropertiesPanel works**
  ```bash
  npm run dev
  # Select zone, edit properties, verify localStorage updates
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Works

---

## Phase 6: StatsBar Integration (5 minutes)

- [ ] **Import store in StatsBar.jsx**
  ```jsx
  import useMapEditorStore from '../store/mapEditorStore'
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Get data from store**
  - [ ] `const zones = useMapEditorStore(state => state.zones)`
  - [ ] `const assets = useMapEditorStore(state => state.assets)`
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Update stats display**
  - [ ] Zone count: `zones.length`
  - [ ] Asset count: `assets.length`
  - [ ] Other stats as needed
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Done

- [ ] **Test StatsBar works**
  ```bash
  npm run dev
  # Verify counts update when zones/assets change
  ```
  Status: ⏳ Not started | ⏳ In progress | ✅ Works

---

## Phase 7: Testing (15 minutes)

### localStorage Persistence
- [ ] **Add a zone**
  1. Open app at localhost:5173
  2. Click "Add Zone"
  3. Type name "Test Zone"
  4. Press Enter
  
  Expected: Zone appears in sidebar
  Status: ⏳ Not tested | ⏳ Issue found | ✅ Works

- [ ] **Check localStorage saved**
  1. Open DevTools (F12)
  2. Go to Application → localStorage
  3. Find key: `"event-map-draft"`
  4. Click to view value
  
  Expected: JSON has zones array with "Test Zone"
  Status: ⏳ Not tested | ⏳ Issue found | ✅ Found

- [ ] **Refresh page**
  1. Press F5 (or Cmd+R)
  2. Wait for app to load
  
  Expected: "Test Zone" still appears in sidebar
  Status: ⏳ Not tested | ⏳ Disappeared | ✅ Persisted

- [ ] **Clear zone and reload**
  1. Delete "Test Zone"
  2. Check localStorage updated
  3. Refresh page
  
  Expected: Zone still gone (persisted deletion)
  Status: ⏳ Not tested | ⏳ Failed | ✅ Works

### Autosave Timing
- [ ] **Verify autosave delay**
  1. Add a zone
  2. Start timer (note current time)
  3. Make a property edit
  4. Check localStorage immediately (should NOT change yet 2-3s)
  5. Wait 4-5 seconds
  6. Check localStorage again
  
  Expected: localStorage updates after 4 seconds, not immediately
  Status: ⏳ Not tested | ⏳ Immediate save ❌ | ✅ 4s delay ✓

- [ ] **Verify debounce resets**
  1. Open DevTools console
  2. Clear localStorage ("event-map-draft")
  3. Edit zone properties rapidly (10 times in 2 seconds)
  4. Wait 5 seconds
  
  Expected: localStorage updated ONCE after 4 seconds, NOT 10 times
  Status: ⏳ Not tested | ⏳ Multiple saves ❌ | ✅ Single save ✓

- [ ] **Verify meaningful changes only**
  1. Add a zone
  2. Note localStorage `savedAt` timestamp
  3. Hover over map (don't change anything)
  4. Wait 5 seconds
  
  Expected: localStorage `savedAt` NOT updated (no meaningful change)
  Status: ⏳ Not tested | ⏳ Saved on hover ❌ | ✅ Not saved ✓

### Performance
- [ ] **Check console for errors**
  ```bash
  npm run dev
  # Open DevTools console (F12 → Console tab)
  # Perform actions above
  ```
  
  Expected: No red error messages
  Status: ⏳ Not tested | ⏳ Errors found ❌ | ✅ No errors ✓

- [ ] **Check Redux DevTools timeline (optional)**
  1. Install Redux DevTools: `npm install --save-dev redux-devtools-js`
  2. Open DevTools → Redux tab
  3. Perform actions
  
  Expected: See every action (addZone, updateZone, etc.) in timeline
  Status: ⏳ Not installed | ⏳ Installed | ✅ Working

---

## Phase 8: Final Verification (5 minutes)

- [ ] **Production build succeeds**
  ```bash
  npm run build
  ```
  Expected: Builds successfully without errors
  Status: ⏳ Not started | ⏳ Build errors | ✅ Success

- [ ] **Build output size reasonable**
  Expected: ~440 KB uncompressed, ~120 KB gzipped
  Actual: ______ kB
  Status: ⏳ Not checked | ⏳ Too large ❌ | ✅ Reasonable ✓

- [ ] **All documentation reviewed**
  - [ ] Read PROJECT_SUMMARY.md
  - [ ] Read INTEGRATION_GUIDE.md
  - [ ] Bookmarked QUICK_REFERENCE.md
  
  Status: ⏳ Not started | ⏳ In progress | ✅ Read

- [ ] **No prop drilling remaining in critical paths**
  - [ ] MapCanvas gets data from store
  - [ ] Sidebar gets data from store
  - [ ] PropertiesPanel gets data from store
  
  Status: ⏳ Not checked | ⏳ Drilling found | ✅ Eliminated

---

## 🎯 Summary

- **Total Time:** ~50 minutes (5 min setup + 10 min MapCanvas + 5 min × 3 others + 15 min testing)

- **Phases Completed:**
  - [ ] Phase 1: Setup
  - [ ] Phase 2: App.jsx
  - [ ] Phase 3: MapCanvas
  - [ ] Phase 4: Sidebar
  - [ ] Phase 5: PropertiesPanel
  - [ ] Phase 6: StatsBar
  - [ ] Phase 7: Testing
  - [ ] Phase 8: Final Verification

### ✅ All Done? Great!

Next steps:
- [ ] Review [src/README_STATE_MANAGEMENT.md](src/README_STATE_MANAGEMENT.md) for advanced patterns
- [ ] (Optional) Add backend sync using API
- [ ] (Optional) Add TypeScript types
- [ ] (Optional) Add undo/redo functionality

### ❌ Found Issues?

Check these in order:
1. [QUICK_REFERENCE.md](QUICK_REFERENCE.md#troubleshooting) - Common fixes
2. [src/README_STATE_MANAGEMENT.md](src/README_STATE_MANAGEMENT.md#troubleshooting) - Detailed debugging
3. [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) - Step-by-step review

---

## 📝 Notes (For You to Fill In)

### Issues Encountered
```
1. _____________________________________________________________
   Fix: _______________________________________________________
   Status: ⏳ Open | ⏳ In progress | ✅ Resolved

2. _____________________________________________________________
   Fix: _______________________________________________________
   Status: ⏳ Open | ⏳ In progress | ✅ Resolved
```

### Questions
```
1. _____________________________________________________________
   Answer: _____________________________________________________

2. _____________________________________________________________
   Answer: _____________________________________________________
```

### Performance Observations
```
Re-renders before: _______________
Re-renders after: _______________
Other observations: _____________________________________________
```

---

## 🏁 Completion

**Overall Progress:** ___ / 8 Phases

**Date Started:** ___________________

**Date Completed:** ___________________

**Total Time Spent:** ___________________

**Status:** 
- ⏳ Not started
- ⏳ In progress
- 🎉 Complete!

---

**Need help?** Open [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) for all available resources.

**Quick reference?** Use [QUICK_REFERENCE.md](QUICK_REFERENCE.md).

**Stuck?** Check [README_STATE_MANAGEMENT.md](src/README_STATE_MANAGEMENT.md#troubleshooting).

Good luck! 🚀
