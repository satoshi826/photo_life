import {useEffect, useState} from 'react'
import {useCanvas} from './useCanvas'
import Worker from './worker?worker'
import {bitmapToImageData} from './functions'
import {useResizeCallback} from './useResizeCallback'
import {useDragCallback} from './useDragCallback'
import {clamp} from 'jittoku'

export function App() {
  const {canvas, post, ref} = useCanvas({Worker})
  const [camera, setCamera] = useState({x: 0, y: 0, z: 1})
  useResizeCallback({callback: ({width, height}) => post({resize: {width, height}}), ref})
  useDragCallback({
    callback: ({x, y, scroll}) => {
      setCamera((prev) => {
        const nextZ = scroll ? clamp(prev.z + (prev.z * (scroll) / 1500), 1, 10) : prev.z
        return {
          x: prev.x + (-x * nextZ),
          y: prev.y + (-y * nextZ),
          z: nextZ
        }
      })
    }, ref
  })


  useEffect(() => {
    post({camera})
  }, [camera])


  return(
    <div style={{display: 'flex', justifyContent: 'center', height: '100%', backgroundColor: '#222'}}>
      <div style={{width: '100%', height: '100%', display: 'flex'}}>
        {canvas}
      </div>
    </div>
  )

}
