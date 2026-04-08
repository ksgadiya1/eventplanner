import React from 'react'
import { Icon } from '@iconify/react'

export default function AssetGlyph({ asset, size = 20, color, fallback = 'P' }) {
  if (!asset) return <span>{fallback}</span>

  const resolvedColor = color || asset.iconColor || asset.color || 'currentColor'
  const iconValue = asset.icon
  const isIconifyIcon = asset.iconType === 'iconify' || (typeof iconValue === 'string' && iconValue.includes(':'))

  if (asset.imageUrl) {
    return (
      <img
        src={asset.imageUrl}
        alt={asset.name || 'Asset'}
        width={size}
        height={size}
        style={{ display: 'block', objectFit: 'contain', borderRadius: '4px' }}
      />
    )
  }

  if (isIconifyIcon && iconValue) {
    return <Icon icon={iconValue} width={size} height={size} style={{ color: resolvedColor, display: 'block' }} />
  }

  return (
    <span style={{ color: resolvedColor, fontSize: `${size}px`, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {iconValue || fallback}
    </span>
  )
}
