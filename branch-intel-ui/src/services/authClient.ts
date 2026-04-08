import type { EmployeeLoginRequest, EmployeeLoginResponse } from '../types'

function resolveBaseUrl(): string {
  const envBaseUrl = import.meta.env.VITE_SCAN_LINK_API_ADDR?.trim()
  if (envBaseUrl) {
    return envBaseUrl.replace(/\/+$/, '')
  }

  return ''
}

const BASE_URL = resolveBaseUrl()

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const requestUrl = `${BASE_URL}${path}`
  let response: Response

  try {
    response = await fetch(requestUrl, init)
  } catch {
    throw new Error('Backend baglantisi kurulamadi.')
  }

  if (!response.ok) {
    const textBody = await response.text()
    let message = textBody

    if (textBody) {
      try {
        const parsed = JSON.parse(textBody) as { message?: string }
        if (parsed.message) {
          message = parsed.message
        }
      } catch {
        // fallback to text body
      }
    }

    throw new Error(message || `HTTP ${response.status.toString()}`)
  }

  return (await response.json()) as T
}

export async function loginEmployee(
  payload: EmployeeLoginRequest,
): Promise<EmployeeLoginResponse> {
  return await requestJson<EmployeeLoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}
