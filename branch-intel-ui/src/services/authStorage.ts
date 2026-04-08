const AUTH_TOKEN_KEY = 'branch-intel-auth-token'
const AUTH_USERNAME_KEY = 'branch-intel-auth-username'
const AUTH_EXPIRES_AT_KEY = 'branch-intel-auth-expires-at'

export function getAuthToken(): string | null {
  return window.localStorage.getItem(AUTH_TOKEN_KEY)
}

export function getAuthUsername(): string | null {
  return window.localStorage.getItem(AUTH_USERNAME_KEY)
}

export function getAuthExpiresAt(): string | null {
  return window.localStorage.getItem(AUTH_EXPIRES_AT_KEY)
}

export function setAuthSession(token: string, username: string, expiresAt: string): void {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  window.localStorage.setItem(AUTH_USERNAME_KEY, username)
  window.localStorage.setItem(AUTH_EXPIRES_AT_KEY, expiresAt)
}

export function clearAuthSession(): void {
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
  window.localStorage.removeItem(AUTH_USERNAME_KEY)
  window.localStorage.removeItem(AUTH_EXPIRES_AT_KEY)
}

export function hasValidStoredSession(): boolean {
  const token = getAuthToken()
  const username = getAuthUsername()
  const expiresAtRaw = getAuthExpiresAt()

  if (!token || !username || !expiresAtRaw) {
    return false
  }

  const expiresAt = new Date(expiresAtRaw)
  if (Number.isNaN(expiresAt.getTime())) {
    return false
  }

  return expiresAt.getTime() > Date.now()
}
