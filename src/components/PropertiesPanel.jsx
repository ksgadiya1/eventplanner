import React, { useMemo, useState } from 'react'
import { X, Users, Ruler, ChevronLeft, Trash2 } from 'lucide-react'
import { computeZoneCapacity, computeParkingCapacity, getParkingStandard, getZoneAllowedAssetTypes, getZoneCapacityLabel } from '../data/assets'
import { ROUTE_TYPE_OPTIONS, getRouteStylePreset } from '../data/routeTypes'
import { formatArea, formatDistance, getUnitLabel, convertDistance, convertToMeters } from '../utils/units'

const styles = {
  panel: {
    width: '260px',
    minWidth: '260px',
    background: 'var(--bg-panel)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  panelCollapsed: {
    width: '40px',
    minWidth: '40px',
    background: 'var(--bg-panel)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '10px',
  },
  collapsedStack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  header: {
    padding: '14px 16px 12px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
  },
  collapseBtn: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    width: '24px',
    height: '24px',
    borderRadius: '8px',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '14px',
  },
  field: {
    marginBottom: '14px',
  },
  label: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '5px',
    display: 'block',
  },
  input: {
    width: '100%',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    padding: '7px 10px',
    fontSize: '12px',
  },
  select: {
    width: '100%',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    padding: '7px 10px',
    fontSize: '12px',
  },
  statCard: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px',
    marginBottom: '10px',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  statLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  statValue: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
  },
  capacityBig: {
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius)',
    padding: '14px',
    textAlign: 'center',
    marginTop: '8px',
  },
  capacityNum: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
    lineHeight: 1,
  },
  capacityLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '4px',
  },
  sectionDivider: {
    borderTop: '1px solid var(--border)',
    margin: '14px 0',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-dim)',
    textAlign: 'center',
    padding: '30px',
    gap: '10px',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '100px',
    fontSize: '10px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  actionBtn: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--accent)',
    background: 'var(--accent-dim)',
    color: 'var(--accent)',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    marginBottom: '10px',
  },
  blockTitle: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '8px',
  },
}

export default function PropertiesPanel({ collapsed = false, selected, zones = [], assets = [], lines = [], annotations = [], zoneTypes = [], onUpdate, onClose, onDuplicate, onDelete, measurementUnit = 'meters', crowdDensityOptions = [] }) {

  const selectedId = selected?.id
  const selectedParentId = selected?.parentId
  const isZone = selected?.type === 'zone'
  const isAsset = selected?.type === 'asset'
  const isLine = selected?.type === 'line'
  const routeTypePreset = isLine ? getRouteStylePreset(selected?.routeType || 'custom') : null
  const isFloor = selected?.type === 'floor'
  const isAnnotation = selected?.type === 'annotation'
  const isCarPark = isZone && (selected?.zoneType?.id === 'car_park' || selected?.zoneType?.name === 'Car Park')
  const subTypes = selected?.zoneType?.subTypes || []
  const childZones = useMemo(() => (isZone ? zones.filter(zone => zone.parentId === selectedId) : []), [isZone, selectedId, zones])
  const childAssets = useMemo(() => (isZone ? assets.filter(asset => asset.parentId === selectedId) : []), [assets, isZone, selectedId])
  const childLines = useMemo(() => (isZone ? lines.filter(line => line.parentId === selectedId) : []), [isZone, lines, selectedId])
  const childAnnotations = useMemo(() => (isZone ? annotations.filter(annotation => annotation.parentId === selectedId) : []), [annotations, isZone, selectedId])
  const parentZone = useMemo(() => (
    selectedParentId ? zones.find(zone => zone.id === selectedParentId) : null
  ), [selectedParentId, zones])

  if (collapsed) {
    return null
  }

  if (!selected) {
    return null
  }

  const crowdCapacity = isZone ? computeZoneCapacity(selected, selected?.density || 0.5) : null
  const parkingCapacity = isCarPark ? computeParkingCapacity(selected) : null
  const parkingStandard = isCarPark ? getParkingStandard(selected) : null
  const totalRouteLengthM = isZone ? childLines.reduce((sum, line) => sum + (line.lengthM || 0), 0) : 0
  const allowedAssetTypes = isZone ? getZoneAllowedAssetTypes(selected) : []
  const effectiveZoneCapacity = isCarPark ? parkingCapacity : crowdCapacity
  const usedZoneCapacity = isZone ? childAssets.length : 0
  const remainingZoneCapacity = effectiveZoneCapacity !== null ? Math.max(effectiveZoneCapacity - usedZoneCapacity, 0) : null
  const capLabel = isZone ? getZoneCapacityLabel(selected) : { title: 'CAPACITY', unit: 'units' }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>
          {isZone ? 'Zone' : isAsset ? 'Asset' : isLine ? 'Route' : isFloor ? 'Floor Plan' : isAnnotation ? 'Annotation' : 'Item'} Properties
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            style={{ ...styles.toolBtn, color: 'var(--danger)', padding: '5px' }}
            onClick={() => { onDelete?.(); onClose?.(); }}
            title="Delete selected"
            aria-label="Delete selected"
          >
            <Trash2 size={16} />
          </button>
          <button style={styles.closeBtn} onClick={onClose}><X size={14} /></button>
        </div>
      </div>

      <div style={styles.content}>
        {/* Name */}
        <div style={styles.field}>
          <label style={styles.label}>{isAnnotation ? 'Pin Title' : 'Name / Label'}</label>
          <input
            style={styles.input}
            value={isAnnotation ? (selected.text ?? selected.label ?? '') : (selected.label || '')}
            onChange={e => {
              const nextLabel = e.target.value
              if (isAnnotation) {
                onUpdate({ ...selected, label: nextLabel, text: nextLabel })
                return
              }
              onUpdate({ ...selected, label: nextLabel })
            }}
            placeholder={isAnnotation ? 'Enter pin title...' : 'Enter name...'}
          />
        </div>

        {/* Status */}
        <div style={styles.field}>
          <label style={styles.label}>Status</label>
          <select
            style={styles.select}
            value={selected.status || 'planned'}
            onChange={e => onUpdate({ ...selected, status: e.target.value })}
          >
            <option value="planned">Planned</option>
            <option value="confirmed">Confirmed</option>
            <option value="installed">Installed</option>
            <option value="removed">Removed</option>
          </select>
        </div>

        {/* Notes */}
        <div style={styles.field}>
          <label style={styles.label}>{isAnnotation ? 'Tooltip Details' : 'Notes'}</label>
          <textarea
            style={{ ...styles.input, minHeight: '70px', resize: 'vertical' }}
            value={selected.notes || ''}
            onChange={e => onUpdate({ ...selected, notes: e.target.value })}
            placeholder="Add notes..."
          />
        </div>

        {isZone && (
          <>
            <div style={styles.sectionDivider} />

            <div style={styles.statCard}>
              <div style={styles.blockTitle}>Zone Type</div>
              <div style={styles.field}>
                <label style={styles.label}>Category</label>
                <select
                  style={styles.select}
                  value={selected.zoneType?.id || ''}
                  onChange={e => {
                    const nextType = zoneTypes.find(zoneType => zoneType.id === e.target.value)
                    if (!nextType) return
                    const defaultSubType = nextType.defaultSubTypeId
                      ? (nextType.subTypes || []).find(subType => subType.id === nextType.defaultSubTypeId) || null
                      : null
                    const nextZone = {
                      ...selected,
                      zoneType: { ...nextType },
                      subType: defaultSubType,
                      layoutType: (selected.showGrid ?? ['grid', 'rows'].includes(selected.layoutType)) ? 'grid' : 'free',
                      showGrid: Boolean(selected.showGrid ?? ['grid', 'rows'].includes(selected.layoutType)),
                      gridSize: selected.gridSize || selected.rowSpacing || 3,
                      allowedAssetTypes: nextType.allowedAssetTypes || [],
                      contentLocked: !!(nextType.allowedAssetTypes || []).length,
                    }
                    onUpdate({
                      ...nextZone,
                      capacity: computeZoneCapacity(nextZone, selected.density || 0.5),
                    })
                  }}
                >
                  {zoneTypes.map(zoneType => (
                    <option key={zoneType.id} value={zoneType.id}>
                      {zoneType.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.blockTitle}>Zone Status</div>
              <div style={styles.field}>
                <label style={styles.label}>Status</label>
                <select
                  style={styles.select}
                  value={selected.status || 'planned'}
                  onChange={e => onUpdate({ ...selected, status: e.target.value })}
                >
                  <option value="planned">Planned</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="installed">Installed</option>
                  <option value="removed">Removed</option>
                </select>
              </div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.blockTitle}>Zone Appearance</div>

              {/* Fill Color & Opacity */}
              <div style={{ marginBottom: '12px' }}>
                <label style={styles.label}>Fill Color</label>
                <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr', gap: '8px' }}>
                  <input
                    type="color"
                    style={{ ...styles.input, padding: '4px', height: '36px' }}
                    value={selected.fillColor || selected.zoneType?.color || '#3d8ef8'}
                    onChange={e => onUpdate({ ...selected, fillColor: e.target.value })}
                  />
                  <input
                    style={styles.input}
                    value={selected.fillColor || selected.zoneType?.color || '#3d8ef8'}
                    onChange={e => {
                      const value = e.target.value.trim()
                      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return
                      onUpdate({ ...selected, fillColor: value })
                    }}
                    placeholder="#3d8ef8"
                  />
                </div>
              </div>

              {/* Fill Opacity */}
              <div style={{ marginBottom: '12px' }}>
                <label style={styles.label}>Fill Opacity</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={(selected.fillOpacity !== undefined ? selected.fillOpacity : (selected.zoneType?.fillOpacity || 0.2)) * 100}
                    onChange={e => onUpdate({ ...selected, fillOpacity: Number(e.target.value) / 100 })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ ...styles.statValue, minWidth: '40px', textAlign: 'right' }}>
                    {Math.round((selected.fillOpacity !== undefined ? selected.fillOpacity : (selected.zoneType?.fillOpacity || 0.2)) * 100)}%
                  </span>
                </div>
              </div>

              {/* Border Color */}
              <div style={{ marginBottom: '12px' }}>
                <label style={styles.label}>Border Color</label>
                <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr', gap: '8px' }}>
                  <input
                    type="color"
                    style={{ ...styles.input, padding: '4px', height: '36px' }}
                    value={selected.strokeColor || selected.zoneType?.color || '#3d8ef8'}
                    onChange={e => onUpdate({ ...selected, strokeColor: e.target.value })}
                  />
                  <input
                    style={styles.input}
                    value={selected.strokeColor || selected.zoneType?.color || '#3d8ef8'}
                    onChange={e => {
                      const value = e.target.value.trim()
                      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return
                      onUpdate({ ...selected, strokeColor: value })
                    }}
                    placeholder="#3d8ef8"
                  />
                </div>
              </div>

              {/* Border Thickness */}
              <div style={{ marginBottom: '0' }}>
                <label style={styles.label}>Border Thickness</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="range"
                    min="0.5"
                    max="8"
                    step="0.5"
                    value={selected.strokeWeight || 2}
                    onChange={e => onUpdate({ ...selected, strokeWeight: Number(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ ...styles.statValue, minWidth: '40px', textAlign: 'right' }}>
                    {(selected.strokeWeight || 2).toFixed(1)}px
                  </span>
                </div>
              </div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.blockTitle}>Zone Grid Overlay</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(selected.showGrid ?? ['grid', 'rows'].includes(selected.layoutType))}
                  onChange={e => {
                    const enabled = e.target.checked
                    onUpdate({
                      ...selected,
                      showGrid: enabled,
                      layoutType: enabled ? 'grid' : 'free',
                      gridSize: selected.gridSize || selected.rowSpacing || 3,
                    })
                  }}
                />
                Show grid inside this zone
              </label>

              {Boolean(selected.showGrid ?? ['grid', 'rows'].includes(selected.layoutType)) && (
                <div style={{ marginTop: '12px' }}>
                  <div style={styles.field}>
                    <label style={styles.label}>Grid Spacing (m)</label>
                    <input
                      type="number"
                      min="1"
                      step="0.5"
                      style={styles.input}
                      value={selected.gridSize || selected.rowSpacing || 3}
                      onChange={e => onUpdate({
                        ...selected,
                        showGrid: true,
                        layoutType: 'grid',
                        gridSize: Math.max(1, Number(e.target.value) || 3),
                      })}
                    />
                  </div>
                  
                </div>
              )}
            </div>

            {subTypes.length > 0 && (
              <div style={styles.field}>
                <label style={styles.label}>Subtype</label>
                <select
                  style={styles.select}
                  value={selected.subType?.id || ''}
                  onChange={e => {
                    const subType = subTypes.find(sub => sub.id === e.target.value) || null
                    onUpdate({
                      ...selected,
                      subType,
                      capacity: computeZoneCapacity({ ...selected, subType }, selected.density || 0.5),
                    })
                  }}
                >
                  <option value="">Select subtype</option>
                  {subTypes.map(subType => (
                    <option key={subType.id} value={subType.id}>
                      {subType.label || subType.id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={styles.field}>
              <label style={styles.label}>Zone Content Rule</label>
              <select
                style={styles.select}
                value={selected.contentLocked ? 'restricted' : 'open'}
                onChange={e => onUpdate({ ...selected, contentLocked: e.target.value === 'restricted' })}
              >
                <option value="restricted">Restricted by zone type</option>
                <option value="open">Open placement</option>
              </select>
            </div>

            {allowedAssetTypes.length > 0 && (
              <div style={styles.statCard}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>
                  ALLOWED ASSETS
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  {allowedAssetTypes.join(', ')}
                </div>
              </div>
            )}

            {/* Measurements */}
            <div style={styles.statCard}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Ruler size={12} /> MEASUREMENTS
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Area</span>
                <span style={styles.statValue} title={formatArea(selected.areaM2, measurementUnit)}>
                  {formatArea(selected.areaM2, measurementUnit) || '—'}
                </span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Perimeter</span>
                <span style={styles.statValue}>
                  {formatDistance(selected.perimeterM, measurementUnit) || '—'}
                </span>
              </div>
            </div>

            {/* Zone Capacity */}
            <div style={styles.statCard}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Users size={12} /> {capLabel.title}
              </div>
              {!isCarPark && subTypes.length === 0 && (
                <div style={styles.field}>
                  <label style={styles.label}>Density Model</label>
                  <select
                    style={styles.select}
                    value={selected.density || 0.5}
                    onChange={e => onUpdate({ ...selected, density: Number(e.target.value) })}
                  >
                    {crowdDensityOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} ({opt.description})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {isCarPark && parkingStandard && (
                <div style={{ marginBottom: '8px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Standard: {parkingStandard.label} | Stall {parkingStandard.stallSize} | Aisle {parkingStandard.aisleWidth}
                </div>
              )}
              {(isCarPark ? parkingCapacity : crowdCapacity) !== null && (
                <div style={styles.capacityBig}>
                  <div style={styles.capacityNum}>{effectiveZoneCapacity.toLocaleString()}</div>
                  <div style={styles.capacityLabel}>
                    {isCarPark
                      ? `${parkingStandard?.label || 'vehicle'} slots (approx.)`
                      : selected.subType?.label
                        ? `${selected.subType.label}`
                        : `estimated ${capLabel.unit}`}
                  </div>
                </div>
              )}
              <div style={{ marginTop: '10px' }}>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Placed Assets</span>
                  <span style={styles.statValue}>{usedZoneCapacity}</span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Remaining {capLabel.unit}</span>
                  <span style={styles.statValue}>{remainingZoneCapacity !== null ? remainingZoneCapacity.toLocaleString() : '-'}</span>
                </div>
              </div>
            </div>

            {isCarPark && (
              <div style={styles.statCard}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>
                  VEHICLE ROUTING
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Route Lines</span>
                  <span style={styles.statValue}>{childLines.length}</span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Total Route Length</span>
                  <span style={styles.statValue}>{formatDistance(totalRouteLengthM, measurementUnit) || '-'}</span>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  Draw line tools inside this parking zone to define entry/exit movement paths.
                </div>
              </div>
            )}

            {childZones.length > 0 && (
              <div style={styles.statCard}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>
                  SUB ZONES
                </div>
                {childZones.map(zone => (
                  <div key={zone.id} style={{ ...styles.statRow, marginBottom: '8px' }}>
                    <span style={styles.statLabel}>{zone.zoneType?.name || 'Zone'}</span>
                    <span style={{ ...styles.statValue, fontSize: '11px' }}>
                      {zone.subType?.id || '-'} / {(zone.showGrid ?? ['grid', 'rows'].includes(zone.layoutType)) ? 'grid on' : 'grid off'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* <div style={styles.statCard}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>
                HIERARCHY
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Parent Zone</span>
                <span style={{ ...styles.statValue, fontSize: '11px' }}>{parentZone?.label || '-'}</span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Child Zones</span>
                <span style={styles.statValue}>{childZones.length}</span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Child Assets</span>
                <span style={styles.statValue}>{childAssets.length}</span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Annotations</span>
                <span style={styles.statValue}>{childAnnotations.length}</span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Lines</span>
                <span style={styles.statValue}>{childLines.length}</span>
              </div>
            </div> */}
          </>
        )}

        {isAsset && (
          <>
            <div style={styles.sectionDivider} />
            <button
              type="button"
              style={styles.actionBtn}
              onClick={() => onDuplicate?.(selected)}
            >
              Duplicate Asset
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={styles.field}>
                <label style={styles.label}>Width ({getUnitLabel(measurementUnit)})</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.1"
                  style={styles.input}
                  value={selected.widthM ? convertDistance(selected.widthM, measurementUnit).toFixed(2) : ''}
                  onChange={e => {
                    const displayValue = Number(e.target.value)
                    const metersValue = convertToMeters(displayValue, measurementUnit)
                    onUpdate({ ...selected, widthM: metersValue || 0.5 })
                  }}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Length ({getUnitLabel(measurementUnit)})</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.1"
                  style={styles.input}
                  value={selected.lengthM ? convertDistance(selected.lengthM, measurementUnit).toFixed(2) : ''}
                  onChange={e => {
                    const displayValue = Number(e.target.value)
                    const metersValue = convertToMeters(displayValue, measurementUnit)
                    onUpdate({ ...selected, lengthM: metersValue || 0.5 })
                  }}
                />
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Rotation (deg)</label>
              <input
                type="number"
                min="0"
                max="360"
                step="1"
                style={styles.input}
                value={selected.rotationDeg ?? 0}
                onChange={e => onUpdate({ ...selected, rotationDeg: Number(e.target.value) || 0 })}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Asset Color</label>
              <input
                type="color"
                style={{ ...styles.input, height: '40px', padding: '4px' }}
                value={selected.assetDef?.color || '#3d8ef8'}
                onChange={e => onUpdate({
                  ...selected,
                  assetDef: {
                    ...selected.assetDef,
                    color: e.target.value,
                    iconColor: e.target.value,
                  },
                })}
              />
            </div>

            {/* Asset Visual Styling */}
            <div style={styles.statCard}>
              <div style={styles.blockTitle}>Asset Appearance</div>

              {/* Fill Color & Opacity */}
              <div style={{ marginBottom: '12px' }}>
                <label style={styles.label}>Fill Color</label>
                <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr', gap: '8px' }}>
                  <input
                    type="color"
                    style={{ ...styles.input, padding: '4px', height: '36px' }}
                    value={selected.fillColor || selected.assetDef?.color || '#3d8ef8'}
                    onChange={e => onUpdate({ ...selected, fillColor: e.target.value })}
                  />
                  <input
                    style={styles.input}
                    value={selected.fillColor || selected.assetDef?.color || '#3d8ef8'}
                    onChange={e => {
                      const value = e.target.value.trim()
                      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return
                      onUpdate({ ...selected, fillColor: value })
                    }}
                    placeholder="#3d8ef8"
                  />
                </div>
              </div>

              {/* Fill Opacity */}
              <div style={{ marginBottom: '12px' }}>
                <label style={styles.label}>Fill Opacity</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={(selected.fillOpacity !== undefined ? selected.fillOpacity : 0.85) * 100}
                    onChange={e => onUpdate({ ...selected, fillOpacity: Number(e.target.value) / 100 })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ ...styles.statValue, minWidth: '40px', textAlign: 'right' }}>
                    {Math.round((selected.fillOpacity !== undefined ? selected.fillOpacity : 0.85) * 100)}%
                  </span>
                </div>
              </div>

              {/* Border Color */}
              <div style={{ marginBottom: '12px' }}>
                <label style={styles.label}>Border Color</label>
                <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr', gap: '8px' }}>
                  <input
                    type="color"
                    style={{ ...styles.input, padding: '4px', height: '36px' }}
                    value={selected.strokeColor || selected.assetDef?.color || '#3d8ef8'}
                    onChange={e => onUpdate({ ...selected, strokeColor: e.target.value })}
                  />
                  <input
                    style={styles.input}
                    value={selected.strokeColor || selected.assetDef?.color || '#3d8ef8'}
                    onChange={e => {
                      const value = e.target.value.trim()
                      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return
                      onUpdate({ ...selected, strokeColor: value })
                    }}
                    placeholder="#3d8ef8"
                  />
                </div>
              </div>

              {/* Border Thickness */}
              <div style={{ marginBottom: '0' }}>
                <label style={styles.label}>Border Thickness</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="range"
                    min="0.5"
                    max="8"
                    step="0.5"
                    value={selected.strokeWeight || 2}
                    onChange={e => onUpdate({ ...selected, strokeWeight: Number(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ ...styles.statValue, minWidth: '40px', textAlign: 'right' }}>
                    {(selected.strokeWeight || 2).toFixed(1)}px
                  </span>
                </div>
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Supplier</label>
              <input
                style={styles.input}
                value={selected.supplier || ''}
                onChange={e => onUpdate({ ...selected, supplier: e.target.value })}
                placeholder="Supplier name..."
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Cost Code</label>
              <input
                style={styles.input}
                value={selected.costCode || ''}
                onChange={e => onUpdate({ ...selected, costCode: e.target.value })}
                placeholder="e.g. INF-0042"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={styles.field}>
                <label style={styles.label}>Power (kW)</label>
                <input
                  type="number" min="0" step="0.1"
                  style={styles.input}
                  value={selected.powerNeed ?? ''}
                  onChange={e => onUpdate({ ...selected, powerNeed: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Water (litres)</label>
                <input
                  type="number" min="0" step="1"
                  style={styles.input}
                  value={selected.waterNeed ?? ''}
                  onChange={e => onUpdate({ ...selected, waterNeed: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={styles.field}>
                <label style={styles.label}>Delivery Date</label>
                <input type="date" style={styles.input} value={selected.deliveryDate || ''} onChange={e => onUpdate({ ...selected, deliveryDate: e.target.value })} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Install Date</label>
                <input type="date" style={styles.input} value={selected.installDate || ''} onChange={e => onUpdate({ ...selected, installDate: e.target.value })} />
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Removal Date</label>
              <input type="date" style={styles.input} value={selected.removeDate || ''} onChange={e => onUpdate({ ...selected, removeDate: e.target.value })} />
            </div>
            <div style={styles.statCard}>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Parent Zone</span>
                <span style={{ ...styles.statValue, fontSize: '11px' }}>{parentZone?.label || '-'}</span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Lat</span>
                <span style={{ ...styles.statValue, fontSize: '11px' }}>{selected.lat ? selected.lat.toFixed(5) : '—'}</span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Lng</span>
                <span style={{ ...styles.statValue, fontSize: '11px' }}>{selected.lng ? selected.lng.toFixed(5) : '—'}</span>
              </div>
            </div>
          </>
        )}

        {isLine && (
          <>
            <div style={styles.sectionDivider} />

            <div style={styles.statCard}>
              <div style={styles.blockTitle}>Route Details</div>
              <div style={styles.field}>
                <label style={styles.label}>Route Type</label>
                <select
                  style={styles.select}
                  value={selected.routeType || 'custom'}
                  onChange={e => {
                    const preset = getRouteStylePreset(e.target.value)
                    const autoLabels = new Set(['', 'Line', 'Route', 'Custom Route', ...ROUTE_TYPE_OPTIONS.map(option => option.label)])
                    const currentLabel = String(selected.label || '').trim()
                    onUpdate({
                      ...selected,
                      routeType: preset.routeType,
                      label: autoLabels.has(currentLabel) ? preset.label : selected.label,
                      color: preset.color,
                      strokeWeight: preset.weight,
                      pattern: preset.pattern,
                    })
                  }}
                >
                  {ROUTE_TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.45 }}>
                  {ROUTE_TYPE_OPTIONS.find(option => option.id === (selected.routeType || 'custom'))?.description || routeTypePreset?.label}
                </div>
              </div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.blockTitle}>Route Style</div>
              <div style={{ display: 'grid', gridTemplateColumns: '94px 1fr', gap: '8px' }}>
                <div style={styles.field}>
                  <label style={styles.label}>Color</label>
                  <input
                    type="color"
                    style={{ ...styles.input, padding: '4px', height: '36px' }}
                    value={selected.color || '#f59e0b'}
                    onChange={e => onUpdate({ ...selected, color: e.target.value })}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Hex</label>
                  <input
                    style={styles.input}
                    value={selected.color || '#f59e0b'}
                    onChange={e => {
                      const v = e.target.value.trim()
                      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return
                      onUpdate({ ...selected, color: v })
                    }}
                    placeholder="#f59e0b"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={styles.field}>
                  <label style={styles.label}>Weight (px)</label>
                  <input
                    type="number" min="1" max="12" step="1"
                    style={styles.input}
                    value={selected.strokeWeight || 4}
                    onChange={e => onUpdate({ ...selected, strokeWeight: Math.max(1, Number(e.target.value) || 4) })}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Pattern</label>
                  <select
                    style={styles.select}
                    value={selected.pattern || 'dashed'}
                    onChange={e => onUpdate({ ...selected, pattern: e.target.value })}
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Length</span>
                <span style={styles.statValue}>{formatDistance(selected.lengthM, measurementUnit)}</span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Parent Zone</span>
                <span style={{ ...styles.statValue, fontSize: '11px' }}>{parentZone?.label || '-'}</span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Points</span>
                <span style={styles.statValue}>{selected.path?.length || 0}</span>
              </div>
            </div>
          </>
        )}

        {isFloor && (
          <>
            <div style={styles.sectionDivider} />
            <div style={styles.field}>
              <label style={styles.label}>Opacity</label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={selected.opacity ?? 0.7}
                onChange={e => onUpdate({ ...selected, opacity: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Rotation (deg)</label>
              <input
                type="number"
                min="0"
                max="360"
                step="1"
                style={styles.input}
                value={selected.rotation ?? 0}
                onChange={e => onUpdate({ ...selected, rotation: Number(e.target.value) || 0 })}
              />
            </div>
            <div style={styles.statCard}>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Placed</span>
                <span style={styles.statValue}>{selected.bounds ? 'Yes' : 'No'}</span>
              </div>
              {selected.bounds && (
                <>
                  <div style={styles.statRow}>
                    <span style={styles.statLabel}>North</span>
                    <span style={{ ...styles.statValue, fontSize: '11px' }}>{selected.bounds.north?.toFixed(5)}</span>
                  </div>
                  <div style={styles.statRow}>
                    <span style={styles.statLabel}>South</span>
                    <span style={{ ...styles.statValue, fontSize: '11px' }}>{selected.bounds.south?.toFixed(5)}</span>
                  </div>
                  <div style={styles.statRow}>
                    <span style={styles.statLabel}>East</span>
                    <span style={{ ...styles.statValue, fontSize: '11px' }}>{selected.bounds.east?.toFixed(5)}</span>
                  </div>
                  <div style={styles.statRow}>
                    <span style={styles.statLabel}>West</span>
                    <span style={{ ...styles.statValue, fontSize: '11px' }}>{selected.bounds.west?.toFixed(5)}</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {isAnnotation && (
          <>
            <div style={styles.sectionDivider} />
            <div style={styles.statCard}>
              <div style={styles.blockTitle}>Pin Style & Preview</div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: '10px' }}>
                Double-click the pin on the map to edit it directly. Hover it to see the tooltip details.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={styles.field}>
                  <label style={styles.label}>Text Color</label>
                  <input
                    type="color"
                    style={{ ...styles.input, padding: '4px', height: '36px' }}
                    value={selected.color || '#111827'}
                    onChange={e => onUpdate({ ...selected, color: e.target.value })}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Background</label>
                  <input
                    type="color"
                    style={{ ...styles.input, padding: '4px', height: '36px' }}
                    value={selected.backgroundColor || '#fff7d6'}
                    onChange={e => onUpdate({ ...selected, backgroundColor: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={styles.field}>
                  <label style={styles.label}>Font Size</label>
                  <input
                    type="number"
                    min="10"
                    max="32"
                    step="1"
                    style={styles.input}
                    value={selected.fontSize || 14}
                    onChange={e => onUpdate({ ...selected, fontSize: Number(e.target.value) || 14 })}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Font Weight</label>
                  <select
                    style={styles.select}
                    value={selected.fontWeight || 700}
                    onChange={e => onUpdate({ ...selected, fontWeight: Number(e.target.value) || 700 })}
                  >
                    <option value="500">Medium</option>
                    <option value="600">Semi Bold</option>
                    <option value="700">Bold</option>
                    <option value="800">Extra Bold</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={styles.field}>
                  <label style={styles.label}>Border</label>
                  <input
                    type="color"
                    style={{ ...styles.input, padding: '4px', height: '36px' }}
                    value={selected.borderColor?.startsWith('#') ? selected.borderColor : '#334155'}
                    onChange={e => onUpdate({ ...selected, borderColor: e.target.value })}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Border Width</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    step="1"
                    style={styles.input}
                    value={selected.borderWidth ?? 1}
                    onChange={e => onUpdate({ ...selected, borderWidth: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </div>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Corner Radius</label>
                <input
                  type="number"
                  min="4"
                  max="24"
                  step="1"
                  style={styles.input}
                  value={selected.borderRadius ?? 10}
                  onChange={e => onUpdate({ ...selected, borderRadius: Math.max(4, Number(e.target.value) || 10) })}
                />
              </div>
              <div
                style={{
                  marginTop: '6px',
                  padding: '10px 12px',
                  borderRadius: `${Math.max(4, Number(selected.borderRadius ?? 10))}px`,
                  border: `${Math.max(1, Number(selected.borderWidth ?? 1))}px solid ${selected.borderColor || 'rgba(15,23,42,0.18)'}`,
                  background: selected.backgroundColor || '#fff7d6',
                  color: selected.color || '#111827',
                  fontSize: `${Math.max(10, Number(selected.fontSize || 14))}px`,
                  fontWeight: Math.max(500, Number(selected.fontWeight || 700)),
                  lineHeight: 1.4,
                  boxShadow: '0 8px 18px rgba(15,23,42,0.16)',
                }}
              >
                {selected.text || 'Annotation preview'}
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Parent Zone</span>
                <span style={{ ...styles.statValue, fontSize: '11px' }}>{parentZone?.label || '-'}</span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Lat</span>
                <span style={{ ...styles.statValue, fontSize: '11px' }}>{selected.lat?.toFixed(5)}</span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Lng</span>
                <span style={{ ...styles.statValue, fontSize: '11px' }}>{selected.lng?.toFixed(5)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
