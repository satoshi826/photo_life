
export async function bitmapToImageData(imageBitmap: ImageBitmap) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = imageBitmap.width
  canvas.height = imageBitmap.height
  ctx!.drawImage(imageBitmap, 0, 0)
  const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height)
  const pixelArray = imageData.data
  return pixelArray
}