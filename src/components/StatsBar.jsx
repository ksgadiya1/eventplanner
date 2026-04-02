import React, { useMemo } from 'react'
import { Map, Layers, Package, Users, Type } from 'lucide-react'
import { computeZoneCapacity } from '../data/assets'

const styles = {
  bar: {
    height: '36px',
    background: 'var(--bg-secondary)',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: '20px',
    flexShrink: 0,
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '11px',
    color: 'var(--text-dim)',
  },
  statValue: {
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
  },
  divider: {
    width: '1px',
    height: '16px',
    background: 'var(--border)',
  },
}

export default function StatsBar({ zones, assets, annotations = [], selectedId }) {
  const { totalArea, totalCapacity } = useMemo(() => ({
    totalArea: zones.reduce((sum, zone) => sum + (zone.areaM2 || 0), 0),
    totalCapacity: zones.reduce((sum, zone) => sum + (computeZoneCapacity(zone) || 0), 0),
  }), [zones])

  return (
    <div style={styles.bar}>
      <div style={styles.stat}>
        <Map size={11} />
        <span>Zones:</span>
        <span style={styles.statValue}>{zones.length}</span>
      </div>
      <div style={styles.divider} />
      <div style={styles.stat}>
        <Package size={11} />
        <span>Assets:</span>
        <span style={styles.statValue}>{assets.length}</span>
      </div>
      <div style={styles.divider} />
      <div style={styles.stat}>
        <Type size={11} />
        <span>Notes:</span>
        <span style={styles.statValue}>{annotations.length}</span>
      </div>
      <div style={styles.divider} />
      <div style={styles.stat}>
        <Layers size={11} />
        <span>Total area:</span>
        <span style={styles.statValue}>
          {totalArea > 0 ? `${totalArea.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} m²` : '-'}
        </span>
      </div>
      <div style={styles.divider} />
      <div style={styles.stat}>
        <Users size={11} />
        <span>Est. capacity:</span>
        <span style={styles.statValue}>{totalCapacity > 0 ? totalCapacity.toLocaleString() : '-'}</span>
      </div>
      {selectedId && (
        <>
          <div style={styles.divider} />
          <div style={{ ...styles.stat, color: 'var(--accent)' }}>
            • Item selected
          </div>
        </>
      )}
      <div style={{ marginLeft: 'auto', ...styles.stat }}>
        EventWiz Mapping POC - v1.0
      </div>
    </div>
  )
}
