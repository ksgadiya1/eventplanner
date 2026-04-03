import React from 'react'

const Tooltip = ({ children, content, ...props }) => {
  const [showTooltip, setShowTooltip] = React.useState(false)
  const [tooltipPos, setTooltipPos] = React.useState({ x: 0, y: 0 })
  const wrapperRef = React.useRef(null)
  const hoverTimeoutRef = React.useRef(null)

  const handleMouseEnter = React.useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    
    hoverTimeoutRef.current = setTimeout(() => {
      if (wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect()
        setTooltipPos({
          x: rect.left + rect.width / 2,
          y: rect.top,
        })
        setShowTooltip(true)
      }
    }, 100)
  }, [])

  const handleMouseLeave = React.useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    setShowTooltip(false)
  }, [])

  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    }
  }, [])

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        display: 'inline-block',
        width: '100%',
        position: 'relative'
      }}
      {...props}
    >
      {children}
      {showTooltip && (
        <div
          style={{
            position: 'fixed',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '10px 12px',
            fontSize: '11px',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            zIndex: 50000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            pointerEvents: 'none',
          }}
        >
          {content}
          <div
            style={{
              position: 'absolute',
              bottom: '-6px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid var(--bg-panel)',
            }}
          />
        </div>
      )}
    </div>
  )
}

export default Tooltip