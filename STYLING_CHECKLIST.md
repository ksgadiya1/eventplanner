# Visual Styling - Complete Checklist & Troubleshooting

## ✅ What Should Work

### Zone Styling
- [x] Fill Color - Color picker + hex input
- [x] Fill Opacity - Slider 0-100%
- [x] Border Color - Color picker + hex input  
- [x] Border Thickness - Slider 0.5-8px

### Asset Styling
- [x] Fill Color - Color picker + hex input
- [x] Fill Opacity - Slider 0-100%
- [x] Border Color - Color picker + hex input
- [x] Border Thickness - Slider 0.5-8px

---

## 🧪 Step-by-Step Test

### Test 1: Zone Fill Color & Opacity
1. Draw a zone on the map (any type)
2. **Select the zone** (should turn blue outline)
3. Scroll to **"Zone Appearance"** section in Properties Panel
4. Set **Fill Color** to **RED** (#ff0000)
5. Set **Fill Opacity** to **75%** (NOT 0%)
6. ✅ Zone should now show **RED fill** on map
7. Change opacity to **25%** - zone should become more transparent
8. ✅ Changes should be instant, no refresh needed

### Test 2: Zone Border Color & Thickness
1. Zone still selected from Test 1
2. Set **Border Color** to **YELLOW** (#ffff00)
3. Set **Border Thickness** to **4px**
4. ✅ Zone border should become **YELLOW and THICK**
5. Change thickness to **1px** - border should become thin
6. ✅ All changes instant

### Test 3: Asset Fill Color & Opacity
1. Place an asset on the map
2. **Select the asset** 
3. Scroll to **"Asset Appearance"** section
4. Set **Fill Color** to **GREEN** (#00ff00)
5. Set **Fill Opacity** to **80%**
6. ✅ Asset should show **GREEN fill**
7. Opacity changes should be smooth

### Test 4: Asset Border Color & Thickness
1. Asset still selected
2. Set **Border Color** to **PURPLE** (#9900ff)
3. Set **Border Thickness** to **3px**
4. ✅ Asset border should become **PURPLE and THICK**

### Test 5: Save & Reload
1. Change styles (any zone or asset)
2. Close browser or reload (F5)
3. ✅ Styling should persist (saved in localStorage)

---

## 🐛 Troubleshooting

### Problem: Fill Color Not Showing
**Cause:** Fill Opacity is at 0%
**Fix:** 
1. Select the zone/asset
2. Set **Fill Opacity** to at least **50%** or higher
3. Check the slider - if all the way left = 0% (invisible)

### Problem: Border Color Not Visible
**Cause:** Border color same as default, or border thickness too thin
**Fix:**
1. Select zone/asset
2. Set **Border Thickness** to **4px or higher**
3. Set **Border Color** to a contrasting color (e.g., if fill is blue, use yellow/red for border)
4. Deselect and re-select the item to see changes

### Problem: Changes Not Appearing on Map
**Cause:** React might need to re-render, or component hasn't updated
**Fix:**
1. Open DevTools Console (F12)
2. Check for any error messages in red
3. Click elsewhere on map to deselect
4. Re-select the zone/asset
5. If still not working, reload browser (F5)

### Problem: Opacity Slider Stuck at 0%
**Cause:** Default value is 0% when initially editing
**Fix:**
1. Move slider to right (50-100%)
2. The zone/asset will immediately become visible
3. Store now saves the proper opacity value

### Problem: Color Picker Won't Update
**Cause:** Hex input validation failing
**Fix:**
1. Use the **color picker button** (not the hex text field)
2. Click on colored square, select color visually
3. Hex field will auto-update

---

## 📊 Properties Being Saved

When you update a zone or asset, these properties are saved to localStorage:

**Zone Properties:**
```javascript
{
  fillColor: "#ff0000",      // Hex color
  fillOpacity: 0.75,         // 0 to 1 (0% to 100%)
  strokeColor: "#ffff00",    // Border color
  strokeWeight: 4,           // Pixel thickness
}
```

**Asset Properties:**
```javascript
{
  fillColor: "#00ff00",      // Hex color
  fillOpacity: 0.80,         // 0 to 1 (0% to 100%)
  strokeColor: "#9900ff",    // Border color
  strokeWeight: 3,           // Pixel thickness
}
```

---

## 🔍 How to Verify It's Saving

1. Select a zone
2. Change **Fill Color** to RED
3. Open DevTools → **Application** → **LocalStorage**
4. Find `event-map-draft`
5. Search for `"fillColor":"#ff0000"`
6. If found ✅ = Value is being saved correctly

---

## 📱 Visual Checklist

Before/After Styling:

**BEFORE (Default):**
- Zone: Light blue fill, thin dark border
- Asset: Light blue circle with icon, thin border

**AFTER (Custom Styling):**
- Zone: Your chosen color, custom opacity, custom border color & thickness
- Asset: Your chosen color, custom opacity, custom border color & thickness

---

## 🎨 Recommended Styling Combinations

### Professional Look
- Fill Color: #3d8ef8 (blue)
- Fill Opacity: 15%
- Border Color: #0f172a (dark)
- Border Thickness: 2px

### High Visibility
- Fill Color: #ef4444 (red)
- Fill Opacity: 30%
- Border Color: #991b1b (dark red)
- Border Thickness: 3px

### Subtle Styling
- Fill Color: #10b981 (green)
- Fill Opacity: 10%
- Border Color: gray
- Border Thickness: 1px

---

## 🚀 Advanced

### Batch Update All Assets in Zone
Currently not supported - must update individually

### Import/Export Styling
Styling is included when exporting zone/asset data as JSON

### Reset to Default
1. Select zone/asset
2. Click **Delete** button to remove
3. Redraw to get default styling

---

## Still Having Issues?

**Required Info for Support:**
1. Screenshot showing the zone/asset on map
2. Screenshot showing Properties Panel with styling values
3. DevTools Console output (look for errors in red)
4. Browser type & version (Chrome, Firefox, Safari, etc.)
5. Steps you took before issue occurred

