import type { CornerPoint, CornerQuad } from '../../types/scanner'

export interface CoverTransform {
  scale: number
  offsetX: number
  offsetY: number
  renderedWidth: number
  renderedHeight: number
}

export interface QuadEdgeLengths {
  top: number
  right: number
  bottom: number
  left: number
}

function asCornerQuad(points: CornerPoint[]): CornerQuad {
  return [points[0], points[1], points[2], points[3]]
}

/**
 * Orders 4 points as top-left, top-right, bottom-right, bottom-left.
 */
export function orderCorners(points: CornerPoint[]): CornerQuad {
  if (points.length !== 4) {
    return asCornerQuad(points)
  }

  const center = points.reduce(
    (acc, point) => ({
      x: acc.x + point.x / 4,
      y: acc.y + point.y / 4,
    }),
    { x: 0, y: 0 },
  )

  const byAngle = [...points].sort(
    (a, b) =>
      Math.atan2(a.y - center.y, a.x - center.x) -
      Math.atan2(b.y - center.y, b.x - center.x),
  )

  const startIndex = byAngle.reduce((bestIndex, point, index, values) => {
    const best = values[bestIndex]
    const pointScore = point.x + point.y
    const bestScore = best.x + best.y

    if (pointScore !== bestScore) {
      return pointScore < bestScore ? index : bestIndex
    }

    return point.x < best.x ? index : bestIndex
  }, 0)

  const ordered = byAngle.slice(startIndex).concat(byAngle.slice(0, startIndex))
  return asCornerQuad(ordered)
}

/**
 * Linearly interpolates a point.
 */
export function lerpPoint(a: CornerPoint, b: CornerPoint, t: number): CornerPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

/**
 * Smooths detected corners towards the new values.
 */
export function smoothCorners(
  current: CornerQuad | null,
  target: CornerQuad | null,
  factor = 0.3,
): CornerQuad | null {
  if (!current || !target) {
    return target
  }

  const smoothed = current.map((point, index) =>
    lerpPoint(point, target[index], factor),
  )

  return asCornerQuad(smoothed)
}

/**
 * Scales corners from one resolution to another.
 */
export function scaleCorners(
  corners: CornerQuad,
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
): CornerQuad {
  const scaleX = toWidth / fromWidth
  const scaleY = toHeight / fromHeight
  return asCornerQuad(
    corners.map((point) => ({
      x: point.x * scaleX,
      y: point.y * scaleY,
    })),
  )
}

/**
 * Computes object-fit cover transform metrics.
 */
export function computeCoverTransform(
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
): CoverTransform | null {
  if (!fromWidth || !fromHeight || !toWidth || !toHeight) {
    return null
  }

  const scale = Math.max(toWidth / fromWidth, toHeight / fromHeight)
  const renderedWidth = fromWidth * scale
  const renderedHeight = fromHeight * scale

  return {
    scale,
    offsetX: (toWidth - renderedWidth) / 2,
    offsetY: (toHeight - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
  }
}

/**
 * Scales corners with cover-fit transform.
 */
export function scaleCornersToCover(
  corners: CornerQuad,
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
): CornerQuad | null {
  const transform = computeCoverTransform(fromWidth, fromHeight, toWidth, toHeight)
  if (!transform) {
    return null
  }

  return asCornerQuad(
    corners.map((point) => ({
      x: point.x * transform.scale + transform.offsetX,
      y: point.y * transform.scale + transform.offsetY,
    })),
  )
}

/**
 * Creates centered guide corners with cheque-like aspect ratio.
 */
export function createGuideCorners(width: number, height: number): CornerQuad {
  const targetAspect = 2.35
  let guideWidth = width * 0.84
  let guideHeight = guideWidth / targetAspect

  if (guideHeight > height * 0.58) {
    guideHeight = height * 0.58
    guideWidth = guideHeight * targetAspect
  }

  const x = (width - guideWidth) / 2
  const y = (height - guideHeight) / 2

  return [
    { x, y },
    { x: x + guideWidth, y },
    { x: x + guideWidth, y: y + guideHeight },
    { x, y: y + guideHeight },
  ]
}

/**
 * Checks if two corner quads are close enough.
 */
export function cornersAreClose(
  first: CornerQuad,
  second: CornerQuad,
  threshold = 5,
): boolean {
  return first.every((point, index) => {
    const dx = point.x - second[index].x
    const dy = point.y - second[index].y
    return Math.hypot(dx, dy) < threshold
  })
}

/**
 * Computes bounding dimensions for a corner quad.
 */
export function quadDimensions(corners: CornerQuad): { width: number; height: number } {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners
  const topWidth = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y)
  const bottomWidth = Math.hypot(
    bottomRight.x - bottomLeft.x,
    bottomRight.y - bottomLeft.y,
  )
  const leftHeight = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y)
  const rightHeight = Math.hypot(
    bottomRight.x - topRight.x,
    bottomRight.y - topRight.y,
  )

  return {
    width: Math.round(Math.max(topWidth, bottomWidth)),
    height: Math.round(Math.max(leftHeight, rightHeight)),
  }
}

/**
 * Measures edge lengths of a corner quad.
 */
export function quadEdgeLengths(corners: CornerQuad): QuadEdgeLengths {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners
  return {
    top: Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y),
    right: Math.hypot(bottomRight.x - topRight.x, bottomRight.y - topRight.y),
    bottom: Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y),
    left: Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y),
  }
}

/**
 * Computes a homography matrix from source to destination points.
 */
export function computeHomography(
  src: CornerQuad,
  dst: CornerQuad,
): number[] | null {
  const matrixA: number[][] = []
  const vectorB: number[] = []

  for (let index = 0; index < 4; index += 1) {
    const sourcePoint = src[index]
    const destinationPoint = dst[index]

    matrixA.push([
      sourcePoint.x,
      sourcePoint.y,
      1,
      0,
      0,
      0,
      -destinationPoint.x * sourcePoint.x,
      -destinationPoint.x * sourcePoint.y,
    ])

    matrixA.push([
      0,
      0,
      0,
      sourcePoint.x,
      sourcePoint.y,
      1,
      -destinationPoint.y * sourcePoint.x,
      -destinationPoint.y * sourcePoint.y,
    ])

    vectorB.push(destinationPoint.x)
    vectorB.push(destinationPoint.y)
  }

  const solved = gaussianElimination(matrixA, vectorB)
  if (!solved) {
    return null
  }

  return [...solved, 1]
}

function gaussianElimination(
  matrixA: number[][],
  vectorB: number[],
): number[] | null {
  const size = 8
  const matrix = matrixA.map((row, index) => [...row, vectorB[index]])

  for (let col = 0; col < size; col += 1) {
    let maxRow = col
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[maxRow][col])) {
        maxRow = row
      }
    }

    ;[matrix[col], matrix[maxRow]] = [matrix[maxRow], matrix[col]]

    if (Math.abs(matrix[col][col]) < 1e-10) {
      return null
    }

    for (let row = col + 1; row < size; row += 1) {
      const factor = matrix[row][col] / matrix[col][col]
      for (let k = col; k <= size; k += 1) {
        matrix[row][k] -= factor * matrix[col][k]
      }
    }
  }

  const result = new Array<number>(size).fill(0)
  for (let row = size - 1; row >= 0; row -= 1) {
    result[row] = matrix[row][size]
    for (let col = row + 1; col < size; col += 1) {
      result[row] -= matrix[row][col] * result[col]
    }
    result[row] /= matrix[row][row]
  }

  return result
}

/**
 * Applies a homography matrix to a point.
 */
export function applyHomography(
  homography: number[],
  x: number,
  y: number,
): CornerPoint {
  const w = homography[6] * x + homography[7] * y + homography[8]
  return {
    x: (homography[0] * x + homography[1] * y + homography[2]) / w,
    y: (homography[3] * x + homography[4] * y + homography[5]) / w,
  }
}
