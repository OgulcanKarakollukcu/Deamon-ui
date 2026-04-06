/// Sayfayı güvenli şekilde kapatmayı dener, kapanamazsa boş sayfaya yönlendirir.
export function closePageSafely(): void {
  if (typeof window === 'undefined') {
    return
  }

  const tryDirectClose = (): boolean => {
    try {
      window.close()
    } catch {
      // Bazı tarayıcılar bu çağrıyı güvenlik sebebiyle engelleyebilir.
    }
    return window.closed
  }

  if (tryDirectClose()) {
    return
  }

  try {
    const currentWindow = window.open('', '_self')
    currentWindow?.close()
  } catch {
    // Aynı sekmeyi kapatma hilesi bazı tarayıcılarda engellenebilir.
  }

  if (window.closed) {
    return
  }

  // Kapatma engellenirse kullanıcıyı boş bir ekrana alarak akışı sonlandırırız.
  window.location.replace('about:blank')
}

