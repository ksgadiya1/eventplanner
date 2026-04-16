import { useRef, useCallback, useState } from 'react'
import {
    clientPointToLatLng,
    latLngToContainerPoint,
    projectScreenDelta,
    localDeltaToScreen,
    shortestAngleDelta,
    normalizeAngle,
    buildRectanglePath,
    computePolygonMetrics
} from '../utils/mapGeometry'

const MIN_ASSET_SIZE_PX = 28
const MIN_ZONE_SIZE_PX = 24
const MIN_FLOOR_SIZE_PX = 80

export function useMapInteraction({
    map,
    gridSize = 3,
    snapEnabled = true,
    onUpdate,
    onComplete
}) {
    const [isInteracting, setIsInteracting] = useState(false)
    const stateRef = useRef(null)
    const rafRef = useRef(null)

    const snapLatLng = useCallback((lat, lng, size) => {
        const latStep = size / 111111
        const lngStep = size / (111111 * Math.cos(lat * Math.PI / 180))
        return {
            lat: Math.round(lat / latStep) * latStep,
            lng: Math.round(lng / lngStep) * lngStep,
        }
    }, [])

    const startInteraction = useCallback((e, object, type, metadata = {}) => {
        if (!map) return

        const latLng = clientPointToLatLng(map, e.clientX, e.clientY)
        if (!latLng) return

        const mapRect = map.getDiv().getBoundingClientRect()
        const centerPoint = (object.lat && object.lng)
            ? latLngToContainerPoint(map, object.lat, object.lng)
            : (object.center ? latLngToContainerPoint(map, object.center.lat, object.center.lng) : null)

        const centerClient = centerPoint ? {
            x: mapRect.left + centerPoint.x,
            y: mapRect.top + centerPoint.y
        } : { x: e.clientX, y: e.clientY }

        const objectType = object.type || (object.lat ? 'asset' : (object.path ? 'zone' : 'floor'))
        const rotation = object.rotationDeg || object.rotation || object.gridRotation || 0

        // For resizing, calculate metersPerPixel at this latitude
        const mpp = 156543.03392 * Math.cos(latLng.lat() * Math.PI / 180) / Math.pow(2, map.getZoom())

        stateRef.current = {
            type,
            object,
            objectType,
            startX: e.clientX,
            startY: e.clientY,
            center: centerClient,
            latLngOffset: {
                lat: latLng.lat() - (object.lat || object.center?.lat || 0),
                lng: latLng.lng() - (object.lng || object.center?.lng || 0),
            },
            startWidthPx: (object.widthM || 0) / mpp,
            startLengthPx: (object.lengthM || object.heightM || 0) / mpp,
            startWidthM: object.widthM || 0,
            startLengthM: object.lengthM || object.heightM || 0,
            startRotation: rotation,
            startPointerAngle: Math.atan2(e.clientY - centerClient.y, e.clientX - centerClient.x) * 180 / Math.PI,
            startPath: object.path ? [...object.path] : null,
            mpp,
            resizeHandle: metadata,
            snap: snapEnabled,
        }

        setIsInteracting(true)
        document.body.style.userSelect = 'none'
    }, [map, snapEnabled])

    const move = useCallback((e) => {
        const ds = stateRef.current
        if (!ds || !map || !onUpdate) return

        if (rafRef.current) cancelAnimationFrame(rafRef.current)

        rafRef.current = requestAnimationFrame(() => {
            const latLng = clientPointToLatLng(map, e.clientX, e.clientY)
            if (!latLng) return

            let updated = { ...ds.object }

            if (ds.type === 'move') {
                const rawLat = latLng.lat() - ds.latLngOffset.lat
                const rawLng = latLng.lng() - ds.latLngOffset.lng
                const snapped = ds.snap ? snapLatLng(rawLat, rawLng, gridSize) : { lat: rawLat, lng: rawLng }

                if (ds.object.lat !== undefined) {
                    updated.lat = snapped.lat
                    updated.lng = snapped.lng
                } else if (ds.object.center) {
                    updated.center = snapped
                }

                if (ds.startPath) {
                    const latShift = snapped.lat - (ds.object.lat || ds.object.center.lat)
                    const lngShift = snapped.lng - (ds.object.lng || ds.object.center.lng)
                    updated.path = ds.startPath.map(p => ({ lat: p.lat + latShift, lng: p.lng + lngShift }))
                }
            }

            if (ds.type === 'resize') {
                const dx = e.clientX - ds.startX
                const dy = e.clientY - ds.startY
                const { localX, localY } = projectScreenDelta(dx, dy, ds.startRotation)
                const handle = ds.resizeHandle || { xSign: 1, ySign: 1 }

                const widthPx = Math.max(ds.objectType === 'floor' ? MIN_FLOOR_SIZE_PX : (ds.objectType === 'zone' ? MIN_ZONE_SIZE_PX : MIN_ASSET_SIZE_PX), ds.startWidthPx + (localX * handle.xSign))
                const lengthPx = Math.max(ds.objectType === 'floor' ? MIN_FLOOR_SIZE_PX : (ds.objectType === 'zone' ? MIN_ZONE_SIZE_PX : MIN_ASSET_SIZE_PX), ds.startLengthPx + (localY * handle.ySign))

                const appliedWidthDelta = widthPx - ds.startWidthPx
                const appliedLengthDelta = lengthPx - ds.startLengthPx

                const localCenterShift = {
                    x: (appliedWidthDelta / 2) * handle.xSign,
                    y: (appliedLengthDelta / 2) * handle.ySign,
                }

                const screenShift = localDeltaToScreen(localCenterShift.x, localCenterShift.y, ds.startRotation)
                const nextCenter = clientPointToLatLng(map, ds.center.x + screenShift.x, ds.center.y + screenShift.y)

                if (nextCenter) {
                    const nextWidthM = Number((widthPx * ds.mpp).toFixed(2))
                    const nextLengthM = Number((lengthPx * ds.mpp).toFixed(2))
                    const nextCenterLatLng = { lat: nextCenter.lat(), lng: nextCenter.lng() }

                    if (updated.lat !== undefined) {
                        updated.lat = nextCenterLatLng.lat
                        updated.lng = nextCenterLatLng.lng
                    } else {
                        updated.center = nextCenterLatLng
                    }

                    updated.widthM = nextWidthM
                    if (updated.heightM !== undefined) updated.heightM = nextLengthM
                    else updated.lengthM = nextLengthM

                    if (ds.objectType === 'zone' && ds.object.shapeType === 'rectangle') {
                        updated.path = buildRectanglePath(nextCenterLatLng, nextWidthM / 2, nextLengthM / 2, window.google, updated.rotation || 0)
                    }
                }
            }

            if (ds.type === 'rotate') {
                const nextAngle = Math.atan2(e.clientY - ds.center.y, e.clientX - ds.center.x) * 180 / Math.PI
                const delta = shortestAngleDelta(ds.startPointerAngle, nextAngle)
                const nextRotation = Number(normalizeAngle(ds.startRotation + delta).toFixed(1))

                if (updated.rotationDeg !== undefined) updated.rotationDeg = nextRotation
                else if (updated.rotation !== undefined) updated.rotation = nextRotation
                else if (updated.gridRotation !== undefined) updated.gridRotation = nextRotation

                if (ds.objectType === 'zone' && ds.startPath) {
                    // Rotation logic for paths (optional, but keep consistent with previous)
                    // If it's a rectangle, we prefer regenerating the path
                    if (ds.object.shapeType === 'rectangle') {
                        updated.path = buildRectanglePath(updated.center || updated, updated.widthM / 2, updated.lengthM / 2, window.google, nextRotation)
                    }
                }
            }

            onUpdate(updated)
        })
    }, [map, gridSize, onUpdate, snapLatLng])

    const end = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        const ds = stateRef.current
        if (ds && onComplete) onComplete(ds.object)
        stateRef.current = null
        setIsInteracting(false)
        document.body.style.userSelect = ''
    }, [onComplete])

    return { startInteraction, move, end, isInteracting }
}
