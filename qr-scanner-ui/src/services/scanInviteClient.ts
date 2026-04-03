import type {
  ClaimInviteResponse,
  SubmitInviteSessionPayload,
  SubmitInviteSessionResponse,
} from '../types/invite'

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
    throw new Error(
      'Backend baglantisi kurulamadi. API adresini ve nginx /api proxy ayarini kontrol edin.',
    )
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
        // Fallback to plain text body.
      }
    }

    throw new Error(message || `HTTP ${response.status.toString()}`)
  }

  return (await response.json()) as T
}

/// Claims invite token and returns active session token.
export async function claimInvite(inviteToken: string): Promise<ClaimInviteResponse> {
  return await requestJson<ClaimInviteResponse>(`/api/public/invites/${inviteToken}/claim`)
}

/// Submits captured cheques and metadata for a claimed invite.
export async function submitInviteSession(
  inviteId: string,
  sessionToken: string,
  payload: SubmitInviteSessionPayload,
): Promise<SubmitInviteSessionResponse> {
  return await requestJson<SubmitInviteSessionResponse>(`/api/public/sessions/${inviteId}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-token': sessionToken,
    },
    body: JSON.stringify(payload),
  })
}
