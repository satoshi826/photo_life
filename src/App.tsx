import {useEffect} from 'react'
import {useCanvas, useCanvasPointer, useCanvasResize} from './useCanvas'
import Worker from './worker?worker'
import {bitmapToImageData} from './functions'

export function App() {
  const {canvas, post, ref} = useCanvas({Worker, id: 'root'})
  useCanvasPointer({post, ref})
  useCanvasResize({post, ref})

  useEffect(() => {
    const image = new Image()
    image.src = './test3.jpg'
    image.onload = () => {
      createImageBitmap(image).then((b) => {
        bitmapToImageData(b).then((data) => {
          post({image: {
            data,
            width : image.width,
            height: image.height
          }})
        })
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return(
    <div style={{display: 'flex', justifyContent: 'center', height: '100%', backgroundColor: '#222'}}>
      <div style={{width: '100%', height: '100%', display: 'flex'}}>
        {canvas}
      </div>
    </div>
  )

}
