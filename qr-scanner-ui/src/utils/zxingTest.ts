export async function runZxingSmokeTest(): Promise<void> {
  const { readBarcodesFromImageData } = await import('zxing-wasm/reader')
  const imageData = new ImageData(
    new Uint8ClampedArray([0, 0, 0, 255]),
    1,
    1,
  )

  await readBarcodesFromImageData(imageData)
}
