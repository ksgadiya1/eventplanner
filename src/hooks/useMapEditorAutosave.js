import { useEffect, useRef } from 'react'
import useMapEditorStore, { saveToLocalStorage } from '../store/mapEditorStore'

/**
 * Debounce function to delay execution
 */
function debounce(func, delayMs) {
  let timeoutId
  return function debounced(...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delayMs)
  }
}

/**
 * Hook to autosave map editor state to localStorage
 * Debounces saves to avoid excessive writes
 * Only triggers on meaningful state changes
 * 
 * @param {number} debounceMs - Debounce delay in milliseconds (default: 3000)
 * @param {boolean} autoSaveEnabled - Enable/disable autosave (default: true)
 * 
 * @example
 * function MapEditor() {
 *   useMapEditorAutosave(4000, true)
 *   // ... rest of component
 * }
 */
export function useMapEditorAutosave(debounceMs = 3000, autoSaveEnabled = true) {
  const previousStateRef = useRef(null)
  const debouncedSaveRef = useRef(null)

  // Subscribe to store changes
  useEffect(() => {
    if (!autoSaveEnabled) return

    // Create debounced save function
    const debouncedSave = debounce(() => {
      saveToLocalStorage()
    }, debounceMs)

    debouncedSaveRef.current = debouncedSave

    // Subscribe to every store change
    const unsubscribe = useMapEditorStore.subscribe(
      (state) => {
        // Extract only saveable data
        const currentSaveableState = {
          eventId: state.eventId,
          map: state.map,
          grid: state.grid,
          zones: state.zones,
          assets: state.assets,
          version: state.version,
        }

        // Deep comparison to detect meaningful changes
        const hasChanged = !deepEqual(
          previousStateRef.current,
          currentSaveableState
        )

        if (hasChanged) {
          previousStateRef.current = JSON.parse(JSON.stringify(currentSaveableState))
          debouncedSave()
        }
      },
      // Select only saveable state to avoid unnecessary triggers
      (state) => ({
        eventId: state.eventId,
        map: state.map,
        grid: state.grid,
        zones: state.zones,
        assets: state.assets,
        version: state.version,
      })
    )

    // Cleanup
    return () => {
      unsubscribe()
      if (debouncedSaveRef.current) {
        debouncedSaveRef.current.cancel?.()
      }
    }
  }, [debounceMs, autoSaveEnabled])

  // Manual save trigger
  const triggerSave = () => {
    if (debouncedSaveRef.current) {
      debouncedSaveRef.current()
    }
  }

  return { triggerSave }
}

/**
 * Deep equality check for objects and arrays
 * Used to detect meaningful state changes
 */
function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true
  if (obj1 == null || obj2 == null) return false
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false

  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)

  if (keys1.length !== keys2.length) return false

  for (const key of keys1) {
    if (!keys2.includes(key)) return false
    if (!deepEqual(obj1[key], obj2[key])) return false
  }

  return true
}

export default useMapEditorAutosave
