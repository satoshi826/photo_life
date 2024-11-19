import {useEffect, useRef, useState} from 'react'
import type {CanvasWrapperRef} from './useCanvas'

type Callback = (arg: { x: number; y: number; scroll?: number }) => void;

const frictionCoff = 0.025

export function useDragCallback({
  callback,
  ref
}: { callback: Callback; ref: CanvasWrapperRef }) {
  const start = useRef<[x: number, y: number, t: number] | null>(null)
  const points = useRef<[x: number, y: number, t: number][] | null>(null)
  const vel = useRef<[x: number, y: number] | null>(null)
  const lastTimestamp = useRef(performance.now())
  const baseDistance = useRef<number | null>(null)

  const [initVel, setInitVel] = useState<[x: number, y: number] | null>(null)

  const reset = () => {
    start.current = null
    points.current = null
    vel.current = null
    baseDistance.current = null
  }

  const tapStart = (clientX: number, clientY: number) => {
    if (vel.current) {
      reset()
      setInitVel(null)
    }
    start.current ??= [clientX, clientY, Date.now()]
    points.current ??= [[0, 0, Date.now()]]
  }

  const sendTarget = (x: number, y: number) => callback({x, y})

  const drag = (clientX: number, clientY: number) => {
    if (!start.current || !ref.current || !points.current) return
    const [startX, startY] = start.current
    const shortSide = Math.min(
      ref.current.clientWidth,
      ref.current.clientHeight
    )
    const x = (clientX - startX) / shortSide
    const y = -((clientY - startY) / shortSide)
    points.current.unshift([x, y, Date.now()])
    const dx = x - points.current[1][0]
    const dy = y - points.current[1][1]
    sendTarget(dx, dy)
    if (points.current.length > 4) points.current.pop()
  }

  const tapEnd = () => {
    if (!points.current || points.current.length < 4) {
      reset()
      return
    }
    const latestPoints = points.current[0]
    const pastPoints = points.current[3]

    const diffX = latestPoints[0] - pastPoints[0]
    const diffY = latestPoints[1] - pastPoints[1]
    const diffT = latestPoints[2] - pastPoints[2]

    const velX = (0.05 * diffX) / (0.01 * diffT)
    const velY = (0.05 * diffY) / (0.01 * diffT)
    setInitVel([velX, velY])
    reset()
  }

  const sendZoom = (scroll: number) => callback({x: 0, y: 0, scroll})

  //----------------------------------------------------------------

  const handleMouseDown = ({clientX, clientY}: MouseEvent) =>
    tapStart(clientX, clientY)
  const handleTouchStart = ({changedTouches, touches}: TouchEvent) => {
    if (touches.length > 1) return
    const touch = changedTouches[0]
    const {clientX, clientY} = touch
    tapStart(clientX, clientY)
    return
  }

  const handleMouseMove = ({clientX, clientY}: MouseEvent) =>
    drag(clientX, clientY)
  const handleTouchMove = ({changedTouches, touches}: TouchEvent) => {
    if (touches.length === 1) {
      const touch = changedTouches[0]
      const {clientX, clientY} = touch
      drag(clientX, clientY)
      return
    }
    const {
      0: {clientX: x1, clientY: y1},
      1: {clientX: x2, clientY: y2}
    } = changedTouches
    const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
    baseDistance.current ??= distance
    const z = 500 * (distance / baseDistance.current - 1)
    sendZoom(z)
  }

  const handleWheel = ({deltaY}: WheelEvent) => sendZoom(deltaY)
  const handleMouseUp: (e: MouseEvent) => void = tapEnd
  const handleTouchEnd: (e: TouchEvent) => void = tapEnd
  const handleMouseLeave: (e: MouseEvent) => void = () =>
    (start.current = null)

  useEffect(() => {
    let animationFrameId: number

    function tick() {
      const currentTimestamp = performance.now()
      const deltaTime = (currentTimestamp - lastTimestamp.current) / 1000 // convert ms to s
      lastTimestamp.current = currentTimestamp

      vel.current ??= initVel
      if (!vel.current) return
      const [x, y] = vel.current
      const norm = Math.sqrt(x * x + y * y)
      const frictionX = (frictionCoff * x * deltaTime) / norm
      const frictionY = (frictionCoff * y * deltaTime) / norm
      let nextX = x - frictionX
      let nextY = y - frictionY
      nextX = Math.abs(nextX) < 0.0001 || nextX * x < 0 ? 0 : nextX
      nextY = Math.abs(nextY) < 0.0001 || nextY * y < 0 ? 0 : nextY
      vel.current = nextX === 0 && nextY === 0 ? null : [nextX, nextY]
      if (!vel.current) {
        setInitVel(null)
        return
      }
      sendTarget(nextX, nextY)
      animationFrameId = requestAnimationFrame(tick)
    }

    if (initVel || vel.current) {
      lastTimestamp.current = performance.now()
      animationFrameId = requestAnimationFrame(tick)
    }

    return () => cancelAnimationFrame(animationFrameId)
  }, [initVel, frictionCoff, sendTarget])

  useEffect(() => {
    if (!ref.current) return
    ref.current.onmousemove = handleMouseMove
    ref.current.onmousedown = handleMouseDown
    ref.current.onmouseup = handleMouseUp
    ref.current.onmouseleave = handleMouseLeave
    ref.current.ontouchstart = handleTouchStart
    ref.current.ontouchmove = handleTouchMove
    ref.current.ontouchend = handleTouchEnd
    ref.current.onwheel = handleWheel
    return () => {
      if (!ref.current) return
      ref.current.onmousemove = null
      ref.current.onmousedown = null
      ref.current.onmouseup = null
      ref.current.onmouseleave = null
      ref.current.ontouchstart = null
      ref.current.ontouchmove = null
      ref.current.ontouchend = null
      ref.current.onwheel = null
    }
  }, [])
}
