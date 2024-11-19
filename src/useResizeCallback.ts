import {resizeObserver} from 'glaku'
import {useEffect} from 'react'
import type {CanvasWrapperRef} from './useCanvas'

type Callback = (arg: { width: number; height: number }) => void;

export function useResizeCallback({
  callback,
  ref
}: { callback: Callback; ref: CanvasWrapperRef }) {
  const sendResize = resizeObserver(({width, height}) => callback({width, height}))
  useEffect(() => {
    if (ref.current) sendResize.observe(ref.current)
    return () => {
      if (ref.current) sendResize.unobserve(ref.current)
    }
  }, [ref, sendResize])
}
