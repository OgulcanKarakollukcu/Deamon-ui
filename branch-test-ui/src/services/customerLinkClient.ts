import type {
  CustomerScanInviteCreateRequest,
  CustomerScanInviteCreateResponse,
  CustomerScanInviteDetail,
  CustomerScanInviteSummary,
} from '../types'

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
      'Backend baglantisi kurulamadi. API adresini ve reverse proxy ayarini kontrol edin.',
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
        // Use plain text body when JSON parse fails.
      }
    }

    throw new Error(message || `HTTP ${response.status.toString()}`)
  }

  return (await response.json()) as T
}

/// Creates a one-time customer scan invite.
export async function createCustomerScanInvite(
  payload: CustomerScanInviteCreateRequest,
): Promise<CustomerScanInviteCreateResponse> {
  return await requestJson<CustomerScanInviteCreateResponse>('/api/branch/invites', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

/// Lists invite summaries for branch employee dashboard.
export async function listCustomerScanInvites(): Promise<CustomerScanInviteSummary[]> {
  return await requestJson<CustomerScanInviteSummary[]>('/api/branch/invites')
}

/// Gets detailed invite result including submitted cheque entries.
export async function getCustomerScanInviteDetail(
  inviteId: string,
): Promise<CustomerScanInviteDetail> {
  return await requestJson<CustomerScanInviteDetail>(`/api/branch/invites/${inviteId}`)
}
