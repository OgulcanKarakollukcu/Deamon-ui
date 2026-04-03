export interface OpenCvLike {
  getBuildInformation?: () => string
  onRuntimeInitialized?: () => void
  [key: string]: unknown
}

declare global {
  interface Window {
    cv?: OpenCvLike
  }
}

let openCVPromise: Promise<OpenCvLike> | null = null

const OPEN_CV_LOAD_TIMEOUT_MS = 6000
const OPEN_CV_POLL_INTERVAL_MS = 50
const OPEN_CV_SCRIPT_SOURCES = [
  '/opencv.js',
  'https://cdn.jsdelivr.net/npm/opencv.js@1.2.1/opencv.js',
] as const

function getReadyCv(): OpenCvLike | null {
  if (typeof window === 'undefined') {
    return null
  }

  return typeof window.cv?.getBuildInformation === 'function' ? window.cv : null
}

export function loadOpenCV(): Promise<OpenCvLike> {
  const readyCv = getReadyCv()
  if (readyCv) {
    return Promise.resolve(readyCv)
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('OpenCV can only be loaded in the browser'))
  }

  if (openCVPromise) {
    return openCVPromise
  }

  openCVPromise = new Promise((resolve, reject) => {
    let settled = false
    let timeoutId: number | null = null
    let pollId: number | null = null

    const resolveOnce = (cv: OpenCvLike): void => {
      if (settled) {
        return
      }

      settled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (pollId !== null) {
        window.clearInterval(pollId)
      }
      resolve(cv)
    }

    const rejectOnce = (error: Error): void => {
      if (settled) {
        return
      }

      settled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (pollId !== null) {
        window.clearInterval(pollId)
      }
      openCVPromise = null
      reject(error)
    }

    const resolveIfReady = (): boolean => {
      const currentCv = getReadyCv()
      if (currentCv) {
        resolveOnce(currentCv)
        return true
      }

      return false
    }

    if (resolveIfReady()) {
      return
    }

    const attachRuntimeHandler = (): void => {
      if (!window.cv) {
        return
      }

      const previousInit = window.cv.onRuntimeInitialized
      window.cv.onRuntimeInitialized = () => {
        if (typeof previousInit === 'function') {
          previousInit()
        }
        resolveIfReady()
      }
    }

    const handleLoad = (): void => {
      attachRuntimeHandler()
      resolveIfReady()
    }

    const tryLoadSource = (sourceIndex: number): void => {
      const source = OPEN_CV_SCRIPT_SOURCES[sourceIndex]
      if (!source) {
        rejectOnce(new Error('Failed to load OpenCV script on the main thread'))
        return
      }

      let script = document.querySelector<HTMLScriptElement>(
        `script[data-opencv-main-src="${source}"]`,
      )
      if (!script) {
        script = document.createElement('script')
        script.src = source
        script.async = true
        script.dataset.opencvMainSrc = source
        document.head.appendChild(script)
      }

      script.addEventListener('load', handleLoad, { once: true })
      script.addEventListener(
        'error',
        () => {
          tryLoadSource(sourceIndex + 1)
        },
        { once: true },
      )
    }

    tryLoadSource(0)

    attachRuntimeHandler()
    pollId = window.setInterval(resolveIfReady, OPEN_CV_POLL_INTERVAL_MS)
    timeoutId = window.setTimeout(() => {
      rejectOnce(new Error('Timed out waiting for OpenCV on the main thread'))
    }, OPEN_CV_LOAD_TIMEOUT_MS)
  })

  return openCVPromise
}
