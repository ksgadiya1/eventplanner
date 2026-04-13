# EventWiz Mapping Tool — POC

A proof-of-concept for the EventWiz Mapping & Drawing Tool as specified in the EventWiz product spec (Jonathan Moore, v1 Mar26).

## Features Implemented

| Feature | Status |
|---|---|
| Google Maps base layer (satellite + road) | ✅ |
| Draw zones (polygon tool) | ✅ |
| Zone types (Arena, Backstage, Trader Village, etc.) | ✅ |
| Drag & drop asset library (17 assets) | ✅ |
| Area & perimeter measurement (m² and ft²) | ✅ |
| Crowd capacity calculator | ✅ |
| Layer visibility & lock controls | ✅ |
| Object properties panel | ✅ |
| Undo / delete | ✅ |
| Export layout as JSON | ✅ |
| Status tracking (Planned / Confirmed / Installed) | ✅ |

## Setup & Run

### 1. Install dependencies

```bash
npm install
```

### 2. Run development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 3. Add your Google Maps API Key

Paste your Google Maps API key into the input field in the top-right of the toolbar.

**Required Google APIs to enable:**
- Maps JavaScript API
- Drawing Library
- Geometry Library

Get an API key: https://console.cloud.google.com/google/maps-apis

## How to Use

### Drawing Zones
1. Click the **Zones** tab in the left sidebar
2. Select a zone type (Arena, Backstage, Trader Village, etc.)
3. The map switches to polygon draw mode automatically
4. Click points on the map to draw the zone boundary
5. Click the **first point** to close and create the zone
6. Area, perimeter, and crowd capacity are calculated automatically

### Placing Assets
1. Click the **Assets** tab in the left sidebar
2. **Drag** any asset icon onto the map
3. Drop it at the desired location
4. Click the asset to view/edit its properties

### Layer Control
1. Click the **Layers** tab in the left sidebar
2. Toggle the 👁 eye icon to show/hide a layer
3. Toggle the 🔒 lock icon to prevent editing

### Properties Panel
- Click any zone or asset to open its properties on the right
- Edit name, status, notes, supplier, dates
- For zones: select a crowd density model to calculate capacity

### Export
- Click the **Export** button (top right) to download the full layout as JSON
- The JSON includes all zone geometries (GeoJSON), asset positions, and metadata

## Project Structure

```
src/
  components/
    Toolbar.jsx        — top bar, tools, API key input, export
    Sidebar.jsx        — assets, zones, layers panels
    MapCanvas.jsx      — Google Maps + drawing + asset drop
    PropertiesPanel.jsx — selected item editor + measurements
    StatsBar.jsx       — bottom status bar
  data/
    assets.js          — asset library + zone types + density options
  App.jsx              — state management + composition
  main.jsx             — entry point
  index.css            — global styles
```

## Tech Stack

- React 18
- Vite
- @react-google-maps/api
- Google Maps Drawing Library
- Google Maps Geometry Library (for area/perimeter)


