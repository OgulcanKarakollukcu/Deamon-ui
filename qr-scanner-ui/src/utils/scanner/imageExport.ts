/**
 * Converts canvas to blob.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType = 'image/jpeg',
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }

        reject(new Error('Canvas toBlob failed'))
      },
      mimeType,
      quality,
    )
  })
}
