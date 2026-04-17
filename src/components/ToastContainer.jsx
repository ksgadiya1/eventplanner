import React, { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, X, Info } from 'lucide-react'

const styles = {
  container: {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    pointerEvents: 'none',
  },
  toast: {
    background: 'var(--bg-panel)',
    backdropFilter: 'blur(12px)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.3)',
    color: 'var(--text-primary)',
    minWidth: '280px',
    maxWidth: '450px',
    animation: 'toast-slide-down 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    pointerEvents: 'auto',
  },
  iconSuccess: { color: '#10b981' },
  iconError: { color: '#ef4444' },
  iconInfo: { color: '#3b82f6' },
  message: {
    fontSize: '13px',
    fontWeight: '500',
    flex: 1,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    borderRadius: '6px',
    transition: 'background 0.2s',
  },
}

// Add keyframes via standard CSS in JS is tricky, so we inject them once
if (typeof document !== 'undefined') {
  const styleTag = document.createElement('style')
  styleTag.innerHTML = `
    @keyframes toast-slide-down {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `
  document.head.appendChild(styleTag)
}

export function Toast({ id, message, type = 'success', onRemove }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(id)
    }, 4000)
    return () => clearTimeout(timer)
  }, [id, onRemove])

  const Icon = type === 'success' ? CheckCircle : type === 'error' ? AlertCircle : Info
  const iconStyle = type === 'success' ? styles.iconSuccess : type === 'error' ? styles.iconError : styles.iconInfo

  return (
    <div style={styles.toast}>
      <Icon size={18} style={iconStyle} />
      <div style={styles.message}>{message}</div>
      <button style={styles.closeBtn} onClick={() => onRemove(id)}>
        <X size={14} />
      </button>
    </div>
  )
}

export default function ToastContainer({ toasts = [], onRemove }) {
  return (
    <div style={styles.container}>
      {toasts.map(toast => (
        <Toast key={toast.id} {...toast} onRemove={onRemove} />
      ))}
    </div>
  )
}
