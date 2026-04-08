import type { CustomerScanInviteStatus } from '../types'

export function formatDateTime(value: string | null): string {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }

  return parsed.toLocaleString('tr-TR')
}

export function statusLabel(status: CustomerScanInviteStatus): string {
  if (status === 'claimed') {
    return 'Link Açıldı'
  }

  if (status === 'submitted') {
    return 'Gönderildi'
  }

  if (status === 'expired') {
    return 'Süresi Doldu'
  }

  return 'Bekliyor'
}

export function statusBadge(status: CustomerScanInviteStatus): string {
  if (status === 'submitted') {
    return 'border-[#BFE0CC] bg-[#EAF4EE] text-[#007A3D] dark:border-[#2f5a43] dark:bg-[#1d3829] dark:text-[#95d4ad]'
  }

  if (status === 'claimed') {
    return 'border-[#D6E5DC] bg-[#F3F8F5] text-[#018342] dark:border-[#335c45] dark:bg-[#203629] dark:text-[#a2ddba]'
  }

  if (status === 'expired') {
    return 'border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200'
  }

  return 'border-[#E5EDD5] bg-[#F4FBF6] text-[#6A8F00] dark:border-[#4a5f2b] dark:bg-[#263120] dark:text-[#c4dd84]'
}
