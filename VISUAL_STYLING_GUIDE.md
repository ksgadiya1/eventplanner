# Visual Styling Guide

## Asset & Zone Customization

Your EventWiz map editor now supports comprehensive visual styling for both **zones** and **assets**. Select any zone or asset on the map to access styling controls in the Properties Panel.

---

## Zone Styling

When you select a zone, expand the **"Zone Appearance"** section to customize:

### Fill Color
- Choose a custom fill color for the zone
- Option: Use color picker or enter hex code directly
- Default: Based on zone type

### Fill Opacity
- Slider: 0% - 100%
- Controls the transparency of the fill
- Default: Varies by zone type (typically 15-25%)
- Tip: Lower opacity for subtle zones, higher for emphasis

### Border Color
- Customize the zone's outline color
- Independent from fill color
- Option: Color picker or hex input
- Default: Same as fill color

### Border Thickness
- Slider: 0.5px - 8px
- Controls the border width
- Default: 2px
- Tip: Thicker borders for important zones, thin for subtle outlines

### Label & Zone Name
- **Label**: Short display name (editable in "Name / Label" field)
- **Zone Name**: Set by zone type category

---

## Asset Styling

When you select an asset, expand the **"Asset Appearance"** section to customize:

### Fill Color
- Choose asset interior color
- Color picker or hex input
- Default: Based on asset type

### Fill Opacity
- Slider: 0% - 100%
- Controls fill transparency
- Default: 85%
- Tip: Semi-transparent for layered visualization

### Border Color
- Customize asset outline color
- Color picker or hex input
- Default: Same as asset type color

### Border Thickness
- Slider: 0.5px - 8px
- Controls the border width
- Default: 2px

### Label & Asset Properties
- **Label**: Custom asset name
- **Supplier**: Vendor/supplier information
- **Install/Remove Dates**: Timeline tracking
- **Dimensions**: Width & Length in meters
- **Rotation**: 0-360 degrees

---

## Design Tips

### Effective Zone Design
1. **Visual Hierarchy**: Use different border thicknesses for parent/child zones
2. **Color Contrast**: Choose border colors that contrast with fill colors
3. **Opacity**: Use lower opacity (10-20%) for background zones, higher (30-40%) for focus areas
4. **Consistency**: Keep similar zone types with similar styling

### Effective Asset Design
1. **Asset Grouping**: Style similar assets with matching colors
2. **Differentiation**: Use border opacity/thickness to distinguish asset status
3. **Readability**: Ensure icons are visible - test at different zoom levels
4. **Accessibility**: Choose colors that are colorblind-friendly

### Color Combinations
- **High Contrast**: Dark borders with light fills
- **Subtle**: Similar colors with high opacity for professional look
- **Bold**: Vivid colors with thick borders for attention-grabbing items

---

## Styling Properties Saved

All styling customizations are saved with your map data:
- `fillColor`: Custom fill color (hex)
- `fillOpacity`: Fill transparency (0-1)
- `strokeColor`: Border color (hex)
- `strokeWeight`: Border thickness (px)
- `label`: Display name

---

## Performance Notes

- Styling changes apply instantly on the map
- No performance impact on zoom/pan operations
- Styling is preserved when exporting/importing map data
- Individual asset/zone styling overrides default type colors

---

## Keyboard Shortcuts (When Asset/Zone Selected)

- Rotate asset: Drag rotation handle or use **_R_** button
- Resize: Drag corner handles (8 directions)
- Move: Click and drag anywhere on the element
- Delete: Click delete button in Properties Panel or press **Delete**

---

## Troubleshooting

### Styling not showing?
- Ensure zoom level is sufficient (assets visible at zoom 13+)
- Check if layer visibility is enabled
- Try refreshing the browser

### Color not changing?
- Verify hex code format: `#RRGGBB` (e.g., `#3d8ef8`)
- Use color picker for guaranteed valid colors

### Border too thin/thick?
- Assets: Use 1-4px for typical styling
- Zones: Use 1-3px for default, up to 8px for emphasis

