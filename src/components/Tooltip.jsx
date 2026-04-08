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
            top: `${tooltipPos.y - 12}px`,
            transform: 'translate(-50%, -100%)',
            background: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '13px',
            color: '#1a1a1a',
            whiteSpace: 'normal',
            maxWidth: '320px',
            zIndex: 50000,
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25)',
            pointerEvents: 'none',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            lineHeight: 1.5,
          }}
        >
          {content}
          <div
            style={{
              position: 'absolute',
              bottom: '-8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: '8px solid #ffffff',
            }}
          />
        </div>
      )}
    </div>
  )
}

export default Tooltip