import { useReducer } from 'react'
import type {
  CapturedCheck,
  CheckCaptureStep,
  CheckSession,
} from '../types/check'

// Hook içinde tutulan ana durum: oturum, aktif adım ve o an işlenen çek.
interface CheckSessionState {
  session: CheckSession
  step: CheckCaptureStep
  currentCheck: Partial<CapturedCheck>
}

// Hook'un dışarı açtığı state ve aksiyon fonksiyonlarının tipi.
export interface UseCheckSessionResult {
  session: CheckSession
  step: CheckCaptureStep
  currentCheck: Partial<CapturedCheck>
  start: () => void
  proceedToCheckPhoto: () => void
  goToHomeLanding: () => void
  saveCheckPhoto: (dataUrl: string, qrValue?: string) => void
  confirmCheck: () => void
  addAnotherCheck: () => void
  retakeCheck: (checkId: string) => void
  finish: () => void
  reset: () => void
}

// Reducer'ın kabul ettiği tüm aksiyon tiplerini tek bir union altında topluyoruz.
type CheckSessionAction =
  | { type: 'START' }
  | { type: 'PROCEED_TO_CHECK_PHOTO' }
  | { type: 'GO_TO_HOME_LANDING' }
  | { type: 'SAVE_CHECK_PHOTO'; dataUrl: string; qrValue?: string }
  | { type: 'CONFIRM_CHECK' }
  | { type: 'ADD_ANOTHER_CHECK' }
  | { type: 'RETAKE_CHECK'; checkId: string }
  | { type: 'FINISH' }
  | { type: 'RESET' }

// Yeni bir çek için benzersiz id oluşturarak boş çek nesnesi üretir.
function createCurrentCheck(): Partial<CapturedCheck> {
  return {
    id: crypto.randomUUID(),
  }
}

// Hook ilk açıldığında kullanılacak başlangıç state'ini üretir.
function createInitialState(): CheckSessionState {
  return {
    // Oturum başında çek listesi boştur.
    session: {
      checks: [],
    },
    // Uygulama ilk ekranda açılır.
    step: 'home-landing',
    // İlk çek nesnesini hazırlarız.
    currentCheck: createCurrentCheck(),
  }
}

// Kısmi currentCheck verisini tam CapturedCheck nesnesine çevirmeye çalışır.
function toCapturedCheck(currentCheck: Partial<CapturedCheck>): CapturedCheck | null {
  const { id, photoDataUrl, qrValue } = currentCheck

  // Zorunlu alanlardan biri eksikse tam bir çek oluşmamıştır.
  if (!id || !photoDataUrl || !qrValue) {
    return null
  }

  // Tüm zorunlu alanlar mevcutsa tam çek nesnesi döndürürüz.
  return {
    id,
    photoDataUrl,
    qrValue,
  }
}

// Mevcut çeki oturuma ekleme/özet adıma geçiş akışını tek fonksiyonda toplar.
function confirmCurrentCheck(
  state: CheckSessionState,
  currentCheck: Partial<CapturedCheck> = state.currentCheck,
): CheckSessionState {
  // currentCheck verisini doğrulanmış çek nesnesine çeviriyoruz.
  const capturedCheck = toCapturedCheck(currentCheck)

  // Veri eksikse sadece özete geçip mevcut kısmi veriyi koruyoruz.
  if (!capturedCheck) {
    return {
      ...state,
      currentCheck,
      step: 'check-summary',
    }
  }

  // Aynı id daha önce eklendiyse tekrar push etmemek için kontrol ediyoruz.
  const alreadyExists = state.session.checks.some(
    (check) => check.id === capturedCheck.id,
  )

  // Çeki gerekiyorsa listeye ekleyip adımı check-summary'e taşıyoruz.
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
  // Her aksiyona göre state geçişini merkezi olarak yöneten reducer.
  switch (action.type) {
    case 'START':
      // Başlat butonundan sonra kullanıcı bilgilendirme ekranına gider.
      return {
        ...state,
        step: 'pre-start-info',
      }

    case 'PROCEED_TO_CHECK_PHOTO':
      // Bilgilendirmeden sonra çek fotoğrafı alma adımına geçilir.
      return {
        ...state,
        step: 'check-photo',
      }

    case 'GO_TO_HOME_LANDING':
      // Kullanıcı ana giriş ekranına geri döner.
      return {
        ...state,
        step: 'home-landing',
      }

    case 'SAVE_CHECK_PHOTO': {
      // Fotoğrafla birlikte aynı aşamada okunan QR değerini kaydederiz.
      if (!action.qrValue) {
        // QR bulunamadıysa kullanıcı aynı adımda tekrar denemelidir.
        return {
          ...state,
          currentCheck: {
            ...state.currentCheck,
            photoDataUrl: action.dataUrl,
          },
          step: 'check-photo',
        }
      }
      // QR bulunduysa çeki doğrudan onay akışına göndeririz.
      const nextCurrentCheck: Partial<CapturedCheck> = {
        ...state.currentCheck,
        photoDataUrl: action.dataUrl,
        qrValue: action.qrValue,
      }
      return confirmCurrentCheck(state, nextCurrentCheck)
    }

    case 'CONFIRM_CHECK':
      // Kullanıcı manuel onay verdiyse mevcut çeki onay akışına alıyoruz.
      return confirmCurrentCheck(state)

    case 'ADD_ANOTHER_CHECK':
      // Yeni bir çek için currentCheck'i sıfırlayıp fotoğraf adımına dönüyoruz.
      return {
        ...state,
        currentCheck: createCurrentCheck(),
        step: 'check-photo',
      }

    case 'RETAKE_CHECK': {
      // Seçilen çeki listeden çıkarıp kullanıcıyı yeniden çekim adımına alır.
      const nextChecks = state.session.checks.filter((check) => check.id !== action.checkId)
      return {
        ...state,
        session: {
          ...state.session,
          checks: nextChecks,
        },
        currentCheck: createCurrentCheck(),
        step: 'check-photo',
      }
    }

    case 'FINISH':
      // Akışı bitirme çağrısında da özet ekranında kalınır/gösterilir.
      return {
        ...state,
        step: 'session-summary',
      }

    case 'RESET':
      // Tüm oturumu en baştaki temiz duruma döndürür.
      return createInitialState()

    default:
      // Tanımsız aksiyonlarda mevcut state korunur.
      return state
  }
}

export function useCheckSession(): UseCheckSessionResult {
  // Reducer'ı lazy initializer ile başlatıyoruz ki initial state tek yerden üretilebilsin.
  const [state, dispatch] = useReducer(checkSessionReducer, undefined, createInitialState)

  // Akışı başlatır.
  const start = (): void => {
    dispatch({ type: 'START' })
  }

  // Çek fotoğrafını kaydeder.
  const saveCheckPhoto = (dataUrl: string, qrValue?: string): void => {
    dispatch({ type: 'SAVE_CHECK_PHOTO', dataUrl, qrValue })
  }

  // Bilgilendirme adımından çek fotoğrafı adımına geçirir.
  const proceedToCheckPhoto = (): void => {
    dispatch({ type: 'PROCEED_TO_CHECK_PHOTO' })
  }

  // Ana başlangıç ekranına geri götürür.
  const goToHomeLanding = (): void => {
    dispatch({ type: 'GO_TO_HOME_LANDING' })
  }

  // Mevcut çeki onaylayıp özet adımına geçirir.
  const confirmCheck = (): void => {
    dispatch({ type: 'CONFIRM_CHECK' })
  }

  // Yeni bir çek ekleme akışını başlatır.
  const addAnotherCheck = (): void => {
    dispatch({ type: 'ADD_ANOTHER_CHECK' })
  }

  // Seçilen çeki silip yeniden çekim başlatır.
  const retakeCheck = (checkId: string): void => {
    dispatch({ type: 'RETAKE_CHECK', checkId })
  }

  // Akışı tamamlayıp özet adımına taşır.
  const finish = (): void => {
    dispatch({ type: 'FINISH' })
  }

  // Tüm state'i sıfırdan başlatır.
  const reset = (): void => {
    dispatch({ type: 'RESET' })
  }

  // Hook'un state ve aksiyon API'sini dışarıya açıyoruz.
  return {
    session: state.session,
    step: state.step,
    currentCheck: state.currentCheck,
    start,
    proceedToCheckPhoto,
    goToHomeLanding,
    saveCheckPhoto,
    confirmCheck,
    addAnotherCheck,
    retakeCheck,
    finish,
    reset,
  }
}
