/**
 * Web Worker: Document edge detection pipeline.
 *
 * Message protocol:
 *   IN  { type: 'INIT' }
 *   IN  { type: 'DETECT', imageData: ImageData, width: number, height: number }
 *   IN  { type: 'DETECT_MULTI', imageData: ImageData, width: number, height: number, maxResults?: number }
 *   OUT { type: 'READY', engine: 'opencv' | 'fallback' }
 *   OUT { type: 'CORNERS', corners: [{x,y}×4] | null }
 *   OUT { type: 'CORNERS_MULTI', cornersList: [{x,y}×4][] }
 *   OUT { type: 'LOG', level: 'info' | 'warn' | 'error', message: string, details?: object }
 *   OUT { type: 'ERROR', message: string, details?: object }
 */

let cvReady = false;
let engine = 'fallback';
let processingFrame = false;
const OPEN_CV_SCRIPT_SOURCES = [
  '/opencv.js',
  'https://cdn.jsdelivr.net/npm/opencv.js@1.2.1/opencv.js',
];

self.addEventListener('error', (event) => {
  postError('Unhandled worker error', event.error || event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

self.addEventListener('unhandledrejection', (event) => {
  postError('Unhandled worker rejection', event.reason);
});

self.onmessage = (e) => {
  const { type } = e.data;

  if (type === 'INIT') {
    postLog('info', 'INIT received');
    initOpenCV();
    return;
  }

  if (type === 'DETECT') {
    if (!processingFrame) {
      processingFrame = true;
      try {
        const corners = cvReady && engine === 'opencv'
          ? detectWithOpenCV(e.data.imageData, e.data.width, e.data.height)
          : detectFallback(e.data.imageData, e.data.width, e.data.height);
        self.postMessage({ type: 'CORNERS', corners });
      } catch (err) {
        postError('Detection failed', err, {
          engine,
          cvReady,
          width: e.data.width,
          height: e.data.height,
        });
        self.postMessage({ type: 'CORNERS', corners: null });
      } finally {
        processingFrame = false;
      }
    }
  }

  if (type === 'DETECT_MULTI') {
    if (!processingFrame) {
      processingFrame = true;
      try {
        const maxResults = typeof e.data.maxResults === 'number' ? e.data.maxResults : 6;
        const cornersList = cvReady && engine === 'opencv'
          ? detectMultiWithOpenCV(e.data.imageData, e.data.width, e.data.height, maxResults)
          : detectMultiFallback(e.data.imageData, e.data.width, e.data.height, maxResults);
        self.postMessage({ type: 'CORNERS_MULTI', cornersList });
      } catch (err) {
        postError('Multi detection failed', err, {
          engine,
          cvReady,
          width: e.data.width,
          height: e.data.height,
        });
        self.postMessage({ type: 'CORNERS_MULTI', cornersList: [] });
      } finally {
        processingFrame = false;
      }
    }
  }
};

// ─── OpenCV.js loading ────────────────────────────────────────────────────────

function initOpenCV() {
  const waitForCV = () => {
    if (typeof cv !== 'undefined') {
      if (cv.getBuildInformation) {
        // Already initialized
        cvReady = true;
        engine = 'opencv';
        postLog('info', 'OpenCV runtime ready', { engine });
        self.postMessage({ type: 'READY', engine: 'opencv' });
      } else {
        // Emscripten async init
        cv['onRuntimeInitialized'] = () => {
          cvReady = true;
          engine = 'opencv';
          postLog('info', 'OpenCV runtime initialized asynchronously', { engine });
          self.postMessage({ type: 'READY', engine: 'opencv' });
        };
      }
      return;
    }

    setTimeout(waitForCV, 50);
  };

  for (const scriptSource of OPEN_CV_SCRIPT_SOURCES) {
    try {
      postLog('info', `Loading OpenCV from ${scriptSource}`);
      self.importScripts(scriptSource);
      waitForCV();
      return;
    } catch (err) {
      postLog('warn', `OpenCV load failed from ${scriptSource}`, {
        error: serializeError(err),
      });
    }
  }

  // OpenCV.js not available — use fallback
  try {
    engine = 'fallback';
    cvReady = true;
    postLog('warn', 'OpenCV load failed, falling back to built-in detector', {
      engine,
      error: 'All OpenCV script sources failed',
    });
    self.postMessage({ type: 'READY', engine: 'fallback' });
  } catch {
    self.postMessage({ type: 'READY', engine: 'fallback' });
  }
}

// ─── OpenCV detection pipeline ───────────────────────────────────────────────

function detectWithOpenCV(imageData, width, height) {
  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const binary = new cv.Mat();
  const inverted = new cv.Mat();
  const edges = new cv.Mat();
  const combined = new cv.Mat();
  const morphed = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const closeKernel = cv.Mat.ones(5, 5, cv.CV_8U);
  const dilateKernel = cv.Mat.ones(3, 3, cv.CV_8U);

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.adaptiveThreshold(
      blurred,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      31,
      15
    );
    cv.bitwise_not(binary, inverted);
    cv.Canny(blurred, edges, 60, 180);
    cv.bitwise_or(edges, inverted, combined);
    cv.morphologyEx(combined, morphed, cv.MORPH_CLOSE, closeKernel);
    cv.dilate(morphed, morphed, dilateKernel);

    cv.findContours(morphed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = width * height;
    let bestCorners = null;
    let bestScore = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area < frameArea * 0.05 || area > frameArea * 0.98) {
        contour.delete();
        continue;
      }

      const candidate = extractCandidateQuad(contour);
      if (candidate) {
        const score = scoreQuad(candidate, width, height, frameArea, blurred.data);
        if (score > bestScore) {
          bestScore = score;
          bestCorners = candidate;
        }
      }

      contour.delete();
    }

    return bestCorners || detectFallback(imageData, width, height);
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    binary.delete();
    inverted.delete();
    edges.delete();
    combined.delete();
    morphed.delete();
    contours.delete();
    hierarchy.delete();
    closeKernel.delete();
    dilateKernel.delete();
  }
}

function detectMultiWithOpenCV(imageData, width, height, maxResults = 6) {
  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const binary = new cv.Mat();
  const inverted = new cv.Mat();
  const edges = new cv.Mat();
  const combined = new cv.Mat();
  const morphed = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const closeKernel = cv.Mat.ones(5, 5, cv.CV_8U);
  const dilateKernel = cv.Mat.ones(3, 3, cv.CV_8U);

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.adaptiveThreshold(
      blurred,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      31,
      15
    );
    cv.bitwise_not(binary, inverted);
    cv.Canny(blurred, edges, 60, 180);
    cv.bitwise_or(edges, inverted, combined);
    cv.morphologyEx(combined, morphed, cv.MORPH_CLOSE, closeKernel);
    cv.dilate(morphed, morphed, dilateKernel);

    cv.findContours(morphed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = width * height;
    const candidates = [];

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area < frameArea * 0.04 || area > frameArea * 0.98) {
        contour.delete();
        continue;
      }

      const corners = extractCandidateQuad(contour);
      if (corners) {
        const score = scoreQuad(corners, width, height, frameArea, blurred.data);
        if (score > 0) {
          candidates.push({ corners, score, bbox: bboxOfCorners(corners) });
        }
      }

      contour.delete();
    }

    candidates.sort((a, b) => b.score - a.score);

    const selected = [];
    for (const candidate of candidates) {
      if (selected.length >= maxResults) break;
      if (!candidate.bbox) continue;

      let overlaps = false;
      for (const kept of selected) {
        const iou = bboxIou(candidate.bbox, kept.bbox);
        if (iou > 0.28) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        selected.push(candidate);
      }
    }

    return selected.map((item) => item.corners);
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    binary.delete();
    inverted.delete();
    edges.delete();
    combined.delete();
    morphed.delete();
    contours.delete();
    hierarchy.delete();
    closeKernel.delete();
    dilateKernel.delete();
  }
}

// ─── Pure-JS fallback detection ──────────────────────────────────────────────

function detectFallback(imageData, width, height) {
  const { data } = imageData;
  const grayBuf = new Uint8Array(width * height);

  // Grayscale
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    grayBuf[i] = (data[base] * 77 + data[base + 1] * 150 + data[base + 2] * 29) >> 8;
  }

  // Gaussian blur 5x5
  const blurred = gaussianBlur5(grayBuf, width, height);

  // Sobel edge detection
  const edgesBuf = sobelEdges(blurred, width, height);

  const threshold = computeEdgeThreshold(edgesBuf);
  let binaryBuf = new Uint8Array(width * height);
  for (let i = 0; i < edgesBuf.length; i++) {
    binaryBuf[i] = edgesBuf[i] > threshold ? 1 : 0;
  }

  binaryBuf = dilateBinary(binaryBuf, width, height, 2);
  binaryBuf = erodeBinary(binaryBuf, width, height, 1);

  const bounds = estimateDocumentBounds(binaryBuf, width, height);
  if (!bounds) return null;

  const corners = estimateCornersFromBounds(binaryBuf, width, height, bounds);
  if (!corners) return null;

  const ordered = orderCorners(corners);
  const area = quadArea(ordered);
  const meanBrightness = estimateBoundsBrightness(grayBuf, width, bounds);

  const boundsAspect = (bounds.right - bounds.left) / Math.max(1, bounds.bottom - bounds.top);
  if (meanBrightness < 108) return null;
  if (boundsAspect < 1.6 || boundsAspect > 3.2) return null;
  return area >= width * height * 0.06 ? ordered : null;
}

function detectMultiFallback(imageData, width, height, maxResults = 6) {
  const one = detectFallback(imageData, width, height);
  return one ? [one].slice(0, Math.max(1, maxResults)) : [];
}

function bboxOfCorners(corners) {
  if (!corners || corners.length !== 4) return null;
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY };
}

function bboxIou(a, b) {
  const ix0 = Math.max(a.minX, b.minX);
  const iy0 = Math.max(a.minY, b.minY);
  const ix1 = Math.min(a.maxX, b.maxX);
  const iy1 = Math.min(a.maxY, b.maxY);
  const iw = Math.max(0, ix1 - ix0);
  const ih = Math.max(0, iy1 - iy0);
  const inter = iw * ih;
  if (!inter) return 0;
  const areaA = Math.max(0, (a.maxX - a.minX)) * Math.max(0, (a.maxY - a.minY));
  const areaB = Math.max(0, (b.maxX - b.minX)) * Math.max(0, (b.maxY - b.minY));
  const denom = areaA + areaB - inter;
  return denom ? inter / denom : 0;
}

function gaussianBlur5(buf, w, h) {
  const kernel = [1, 4, 6, 4, 1, 4, 16, 24, 16, 4, 6, 24, 36, 24, 6, 4, 16, 24, 16, 4, 1, 4, 6, 4, 1];
  const kSum = 256;
  const out = new Uint8Array(w * h);

  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      let sum = 0;
      for (let ky = -2; ky <= 2; ky++) {
        for (let kx = -2; kx <= 2; kx++) {
          sum += buf[(y + ky) * w + (x + kx)] * kernel[(ky + 2) * 5 + (kx + 2)];
        }
      }
      out[y * w + x] = sum / kSum;
    }
  }
  return out;
}

function sobelEdges(buf, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -buf[(y - 1) * w + (x - 1)] - 2 * buf[y * w + (x - 1)] - buf[(y + 1) * w + (x - 1)] +
         buf[(y - 1) * w + (x + 1)] + 2 * buf[y * w + (x + 1)] + buf[(y + 1) * w + (x + 1)];
      const gy =
        -buf[(y - 1) * w + (x - 1)] - 2 * buf[(y - 1) * w + x] - buf[(y - 1) * w + (x + 1)] +
         buf[(y + 1) * w + (x - 1)] + 2 * buf[(y + 1) * w + x] + buf[(y + 1) * w + (x + 1)];
      out[y * w + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }
  return out;
}

/**
 * OpenCV contour -> best-effort quadrilateral.
 */
function extractCandidateQuad(contour) {
  const hull = new cv.Mat();
  const approx = new cv.Mat();

  try {
    const contourPerimeter = cv.arcLength(contour, true);
    cv.approxPolyDP(contour, approx, 0.02 * contourPerimeter, true);
    if (approx.rows === 4 && cv.isContourConvex(approx)) {
      return contourMatToCorners(approx);
    }

    cv.convexHull(contour, hull, false, true);
    const hullPerimeter = cv.arcLength(hull, true);

    for (const epsilonFactor of [0.02, 0.03, 0.04]) {
      cv.approxPolyDP(hull, approx, epsilonFactor * hullPerimeter, true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        return contourMatToCorners(approx);
      }
    }

    const rotatedRect = cv.minAreaRect(hull.rows >= 4 ? hull : contour);
    return orderCorners(cv.RotatedRect.points(rotatedRect));
  } finally {
    hull.delete();
    approx.delete();
  }
}

function contourMatToCorners(mat) {
  const pts = [];
  for (let i = 0; i < 4; i++) {
    pts.push({ x: mat.data32S[i * 2], y: mat.data32S[i * 2 + 1] });
  }
  return orderCorners(pts);
}

function scoreQuad(corners, frameWidth, frameHeight, frameArea, grayData = null) {
  if (!corners || corners.length !== 4) return 0;

  const area = quadArea(corners);
  if (area < frameArea * 0.04) return 0;

  const { width, height } = quadDimensions(corners);
  if (!width || !height) return 0;

  const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
  if (aspect < 1.55 || aspect > 3.3) return 0;

  const fillRatio = area / (width * height);
  if (fillRatio < 0.35) return 0;

  const { meanBrightness, deviation } = grayData
    ? estimateQuadStats(grayData, frameWidth, frameHeight, corners)
    : { meanBrightness: 180, deviation: 24 };
  if (meanBrightness < 100) return 0;

  const preferredAspect = 2.35;
  const paperBias = 0.45 + Math.pow(meanBrightness / 255, 1.85);
  const aspectBias = Math.max(0.45, 1 - Math.abs(aspect - preferredAspect) / 1.2);
  const texturePenalty = Math.max(0.58, 1 - Math.max(0, deviation - 48) / 80);
  const centerBias = estimateCenterBias(corners, frameWidth, frameHeight);
  const minInset = Math.min(...corners.map(({ x, y }) => Math.min(
    x,
    y,
    frameWidth - x,
    frameHeight - y
  )));
  const borderPenalty = minInset < 4 ? 0.8 : 1;

  return area * fillRatio * paperBias * aspectBias * texturePenalty * centerBias * borderPenalty;
}

function estimateQuadStats(grayData, frameWidth, frameHeight, corners) {
  const xs = corners.map(pt => pt.x);
  const ys = corners.map(pt => pt.y);
  const minX = clampInt(Math.floor(Math.max(0, Math.min(...xs))), 0, frameWidth - 1);
  const maxX = clampInt(Math.ceil(Math.min(frameWidth - 1, Math.max(...xs))), 0, frameWidth - 1);
  const minY = clampInt(Math.floor(Math.max(0, Math.min(...ys))), 0, frameHeight - 1);
  const maxY = clampInt(Math.ceil(Math.min(frameHeight - 1, Math.max(...ys))), 0, frameHeight - 1);
  const stepX = Math.max(1, Math.floor((maxX - minX) / 6));
  const stepY = Math.max(1, Math.floor((maxY - minY) / 6));

  let sum = 0;
  let sumSquares = 0;
  let count = 0;

  for (let y = minY; y <= maxY; y += stepY) {
    for (let x = minX; x <= maxX; x += stepX) {
      if (!pointInQuad(x, y, corners)) continue;
      const value = grayData[y * frameWidth + x];
      sum += value;
      sumSquares += value * value;
      count++;
    }
  }

  if (!count) return { meanBrightness: 0, deviation: 0 };

  const meanBrightness = sum / count;
  const variance = Math.max(0, sumSquares / count - meanBrightness * meanBrightness);
  return {
    meanBrightness,
    deviation: Math.sqrt(variance),
  };
}

function estimateCenterBias(corners, frameWidth, frameHeight) {
  const center = corners.reduce((acc, pt) => ({
    x: acc.x + pt.x / 4,
    y: acc.y + pt.y / 4,
  }), { x: 0, y: 0 });

  const dx = (center.x - frameWidth / 2) / frameWidth;
  const dy = (center.y - frameHeight / 2) / frameHeight;
  return Math.max(0.78, 1 - Math.hypot(dx, dy) * 1.2);
}

function estimateBoundsBrightness(grayBuf, width, bounds) {
  let sum = 0;
  let count = 0;

  for (let y = bounds.top; y <= bounds.bottom; y += 2) {
    for (let x = bounds.left; x <= bounds.right; x += 2) {
      sum += grayBuf[y * width + x];
      count++;
    }
  }

  return count ? sum / count : 0;
}

function pointInQuad(x, y, corners) {
  let sign = 0;

  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);

    if (cross === 0) continue;
    if (sign === 0) {
      sign = Math.sign(cross);
      continue;
    }
    if (Math.sign(cross) !== sign) return false;
  }

  return true;
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeEdgeThreshold(edgesBuf) {
  let sum = 0;
  let max = 0;

  for (let i = 0; i < edgesBuf.length; i++) {
    const value = edgesBuf[i];
    sum += value;
    if (value > max) max = value;
  }

  const mean = sum / Math.max(1, edgesBuf.length);
  return Math.max(38, Math.min(120, Math.max(mean * 2.4, max * 0.35)));
}

function dilateBinary(buf, w, h, iterations = 1) {
  let src = buf;

  for (let iter = 0; iter < iterations; iter++) {
    const out = new Uint8Array(src.length);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;

        if (
          src[idx] ||
          src[idx - 1] ||
          src[idx + 1] ||
          src[idx - w] ||
          src[idx + w] ||
          src[idx - w - 1] ||
          src[idx - w + 1] ||
          src[idx + w - 1] ||
          src[idx + w + 1]
        ) {
          out[idx] = 1;
        }
      }
    }
    src = out;
  }

  return src;
}

function erodeBinary(buf, w, h, iterations = 1) {
  let src = buf;

  for (let iter = 0; iter < iterations; iter++) {
    const out = new Uint8Array(src.length);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;

        if (
          src[idx] &&
          src[idx - 1] &&
          src[idx + 1] &&
          src[idx - w] &&
          src[idx + w]
        ) {
          out[idx] = 1;
        }
      }
    }
    src = out;
  }

  return src;
}

function estimateDocumentBounds(binary, w, h) {
  const rowCounts = new Uint16Array(h);
  const colCounts = new Uint16Array(w);
  const rowFirst = new Int32Array(h).fill(-1);
  const rowLast = new Int32Array(h).fill(-1);
  const colFirst = new Int32Array(w).fill(-1);
  const colLast = new Int32Array(w).fill(-1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!binary[y * w + x]) continue;

      rowCounts[y]++;
      colCounts[x]++;

      if (rowFirst[y] === -1) rowFirst[y] = x;
      rowLast[y] = x;

      if (colFirst[x] === -1) colFirst[x] = y;
      colLast[x] = y;
    }
  }

  let maxRowCount = 0;
  let maxColCount = 0;
  for (let i = 0; i < h; i++) maxRowCount = Math.max(maxRowCount, rowCounts[i]);
  for (let i = 0; i < w; i++) maxColCount = Math.max(maxColCount, colCounts[i]);

  if (!maxRowCount || !maxColCount) return null;

  const minRowCount = Math.max(8, Math.round(maxRowCount * 0.2));
  const minColCount = Math.max(8, Math.round(maxColCount * 0.2));
  const minRowSpan = Math.round(w * 0.18);
  const minColSpan = Math.round(h * 0.18);

  const top = findBoundary(rowCounts.length, (y) => (
    rowCounts[y] >= minRowCount &&
    rowFirst[y] !== -1 &&
    rowLast[y] - rowFirst[y] >= minRowSpan
  ));

  const bottom = findBoundary(rowCounts.length, (y) => (
    rowCounts[y] >= minRowCount &&
    rowFirst[y] !== -1 &&
    rowLast[y] - rowFirst[y] >= minRowSpan
  ), true);

  const left = findBoundary(colCounts.length, (x) => (
    colCounts[x] >= minColCount &&
    colFirst[x] !== -1 &&
    colLast[x] - colFirst[x] >= minColSpan
  ));

  const right = findBoundary(colCounts.length, (x) => (
    colCounts[x] >= minColCount &&
    colFirst[x] !== -1 &&
    colLast[x] - colFirst[x] >= minColSpan
  ), true);

  if (top === -1 || bottom === -1 || left === -1 || right === -1) return null;
  if (bottom <= top || right <= left) return null;

  const area = (right - left) * (bottom - top);
  if (area < w * h * 0.05) return null;

  return { top, right, bottom, left };
}

function findBoundary(length, predicate, reverse = false) {
  if (reverse) {
    for (let i = length - 1; i >= 0; i--) {
      if (predicate(i)) return i;
    }
    return -1;
  }

  for (let i = 0; i < length; i++) {
    if (predicate(i)) return i;
  }

  return -1;
}

function estimateCornersFromBounds(binary, w, h, bounds) {
  const fallbackCorners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ];

  let tl = null;
  let tr = null;
  let br = null;
  let bl = null;

  for (let y = bounds.top; y <= bounds.bottom; y++) {
    for (let x = bounds.left; x <= bounds.right; x++) {
      if (!binary[y * w + x]) continue;

      const tlScore = (x - bounds.left) + (y - bounds.top);
      const trScore = (bounds.right - x) + (y - bounds.top);
      const brScore = (bounds.right - x) + (bounds.bottom - y);
      const blScore = (x - bounds.left) + (bounds.bottom - y);

      if (!tl || tlScore < tl.score) tl = { x, y, score: tlScore };
      if (!tr || trScore < tr.score) tr = { x, y, score: trScore };
      if (!br || brScore < br.score) br = { x, y, score: brScore };
      if (!bl || blScore < bl.score) bl = { x, y, score: blScore };
    }
  }

  if (!tl || !tr || !br || !bl) return fallbackCorners;

  return orderCorners([
    { x: tl.x, y: tl.y },
    { x: tr.x, y: tr.y },
    { x: br.x, y: br.y },
    { x: bl.x, y: bl.y },
  ]);
}

function quadArea(pts) {
  // Shoelace formula
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function quadDimensions(pts) {
  const [tl, tr, br, bl] = pts;
  return {
    width: Math.max(
      Math.hypot(tr.x - tl.x, tr.y - tl.y),
      Math.hypot(br.x - bl.x, br.y - bl.y)
    ),
    height: Math.max(
      Math.hypot(bl.x - tl.x, bl.y - tl.y),
      Math.hypot(br.x - tr.x, br.y - tr.y)
    ),
  };
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

function postLog(level, message, details = undefined) {
  self.postMessage({
    type: 'LOG',
    level,
    message,
    details,
  });
}

function postError(message, error, details = undefined) {
  self.postMessage({
    type: 'ERROR',
    message,
    details: {
      ...details,
      error: serializeError(error),
    },
  });
}

function serializeError(error) {
  if (!error) return null;

  if (typeof error === 'string') {
    return { message: error };
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function orderCorners(points) {
  const center = points.reduce((acc, pt) => ({
    x: acc.x + pt.x / 4,
    y: acc.y + pt.y / 4,
  }), { x: 0, y: 0 });

  const byAngle = [...points].sort((a, b) => (
    Math.atan2(a.y - center.y, a.x - center.x) -
    Math.atan2(b.y - center.y, b.x - center.x)
  ));

  const startIndex = byAngle.reduce((bestIndex, point, index, arr) => {
    const best = arr[bestIndex];
    const pointScore = point.x + point.y;
    const bestScore = best.x + best.y;
    if (pointScore !== bestScore) return pointScore < bestScore ? index : bestIndex;
    return point.x < best.x ? index : bestIndex;
  }, 0);

  return byAngle.slice(startIndex).concat(byAngle.slice(0, startIndex));
}
