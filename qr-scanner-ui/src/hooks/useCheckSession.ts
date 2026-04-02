import { useReducer } from 'react'
import type {
  CapturedCheck,
  CheckCaptureStep,
  CheckSession,
} from '../types/check'

interface CheckSessionState {
  session: CheckSession
  step: CheckCaptureStep
  currentCheck: Partial<CapturedCheck>
}

export interface UseCheckSessionResult {
  session: CheckSession
  step: CheckCaptureStep
  currentCheck: Partial<CapturedCheck>
  saveCheckPhoto: (dataUrl: string) => void
  saveQrValue: (value: string) => void
  confirmCheck: () => void
  addAnotherCheck: () => void
  goToBatchPhoto: () => void
  saveBatchPhoto: (dataUrl: string) => void
  finish: () => void
  reset: () => void
}

type CheckSessionAction =
  | { type: 'SAVE_CHECK_PHOTO'; dataUrl: string }
  | { type: 'SAVE_QR_VALUE'; value: string }
  | { type: 'CONFIRM_CHECK' }
  | { type: 'ADD_ANOTHER_CHECK' }
  | { type: 'GO_TO_BATCH_PHOTO' }
  | { type: 'SAVE_BATCH_PHOTO'; dataUrl: string }
  | { type: 'FINISH' }
  | { type: 'RESET' }

function createCurrentCheck(): Partial<CapturedCheck> {
  return {
    id: crypto.randomUUID(),
  }
}

function createInitialState(): CheckSessionState {
  return {
    session: {
      checks: [],
      batchPhotoDataUrl: null,
    },
    step: 'check-photo',
    currentCheck: createCurrentCheck(),
  }
}

function toCapturedCheck(currentCheck: Partial<CapturedCheck>): CapturedCheck | null {
  const { id, photoDataUrl, qrValue } = currentCheck

  if (!id || !photoDataUrl || !qrValue) {
    return null
  }

  return {
    id,
    photoDataUrl,
    qrValue,
  }
}

function confirmCurrentCheck(
  state: CheckSessionState,
  currentCheck: Partial<CapturedCheck> = state.currentCheck,
): CheckSessionState {
  const capturedCheck = toCapturedCheck(currentCheck)

  if (!capturedCheck) {
    return {
      ...state,
      currentCheck,
      step: 'check-summary',
    }
  }

  const alreadyExists = state.session.checks.some(
    (check) => check.id === capturedCheck.id,
  )

  return {
    ...state,
    session: {
      ...state.session,
      checks: alreadyExists
        ? state.session.checks
        : [...state.session.checks, capturedCheck],
    },
    currentCheck,
    step: 'check-summary',
  }
}

function checkSessionReducer(
  state: CheckSessionState,
  action: CheckSessionAction,
): CheckSessionState {
  switch (action.type) {
    case 'SAVE_CHECK_PHOTO':
      return {
        ...state,
        currentCheck: {
          ...state.currentCheck,
          photoDataUrl: action.dataUrl,
        },
        step: 'qr-scan',
      }

    case 'SAVE_QR_VALUE': {
      const nextCurrentCheck: Partial<CapturedCheck> = {
        ...state.currentCheck,
        qrValue: action.value,
      }
      return confirmCurrentCheck(state, nextCurrentCheck)
    }

    case 'CONFIRM_CHECK':
      return confirmCurrentCheck(state)

    case 'ADD_ANOTHER_CHECK':
      return {
        ...state,
        currentCheck: createCurrentCheck(),
        step: 'check-photo',
      }

    case 'GO_TO_BATCH_PHOTO':
      return {
        ...state,
        step: 'batch-photo',
      }

    case 'SAVE_BATCH_PHOTO':
      return {
        ...state,
        session: {
          ...state.session,
          batchPhotoDataUrl: action.dataUrl,
        },
        step: 'session-summary',
      }

    case 'FINISH':
      return {
        ...state,
        step: 'session-summary',
      }

    case 'RESET':
      return createInitialState()

    default:
      return state
  }
}

export function useCheckSession(): UseCheckSessionResult {
  const [state, dispatch] = useReducer(checkSessionReducer, undefined, createInitialState)

  const saveCheckPhoto = (dataUrl: string): void => {
    dispatch({ type: 'SAVE_CHECK_PHOTO', dataUrl })
  }

  const saveQrValue = (value: string): void => {
    dispatch({ type: 'SAVE_QR_VALUE', value })
  }

  const confirmCheck = (): void => {
    dispatch({ type: 'CONFIRM_CHECK' })
  }

  const addAnotherCheck = (): void => {
    dispatch({ type: 'ADD_ANOTHER_CHECK' })
  }

  const goToBatchPhoto = (): void => {
    dispatch({ type: 'GO_TO_BATCH_PHOTO' })
  }

  const saveBatchPhoto = (dataUrl: string): void => {
    dispatch({ type: 'SAVE_BATCH_PHOTO', dataUrl })
  }

  const finish = (): void => {
    dispatch({ type: 'FINISH' })
  }

  const reset = (): void => {
    dispatch({ type: 'RESET' })
  }

  return {
    session: state.session,
    step: state.step,
    currentCheck: state.currentCheck,
    saveCheckPhoto,
    saveQrValue,
    confirmCheck,
    addAnotherCheck,
    goToBatchPhoto,
    saveBatchPhoto,
    finish,
    reset,
  }
}
