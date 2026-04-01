export type DotsMocrDisplayField = {
  keyPath: string
  label: string
  value: string
}

const KNOWN_FIELD_LABELS: Record<string, string> = {
  Bank_Name: 'Banka',
  Branch_Info: 'Sube',
  Date_of_Issue: 'Keside Tarihi',
  Place_of_Issue: 'Keside Yeri',
  Currency: 'Para Birimi',
  Amount_Numeric: 'Tutar (Sayisal)',
  Amount_Words: 'Yalniz',
  Payee_Name: 'Emrine',
  Drawer_Name: 'Kesideci',
  IBAN: 'IBAN',
  Check_Number: 'Cek No',
  MICR_Line: 'MICR',
  Check_Type: 'Cek Tipi',
}

function normalizeScalarValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-'
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : '-'
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return '-'
}

function prettifySegment(segment: string): string {
  if (segment in KNOWN_FIELD_LABELS) {
    return KNOWN_FIELD_LABELS[segment]!
  }

  const indexMatch = /^\[(\d+)\]$/.exec(segment)
  if (indexMatch) {
    return `Kayit ${String(Number(indexMatch[1]) + 1)}`
  }

  const normalized = segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized.length === 0) {
    return 'Alan'
  }

  return normalized
    .split(' ')
    .map((part) => {
      const upper = part.toUpperCase()
      if (['IBAN', 'MICR', 'OCR', 'QR', 'JSON', 'VKN', 'TCKN'].includes(upper)) {
        return upper
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

function formatKeyPathLabel(pathSegments: string[]): string {
  if (pathSegments.length === 0) {
    return 'Yanit'
  }

  return pathSegments.map(prettifySegment).join(' / ')
}

function flattenValue(
  value: unknown,
  pathSegments: string[],
  fields: DotsMocrDisplayField[],
): void {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    fields.push({
      keyPath: pathSegments.join('.'),
      label: formatKeyPathLabel(pathSegments),
      value: normalizeScalarValue(value),
    })
    return
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      fields.push({
        keyPath: pathSegments.join('.'),
        label: formatKeyPathLabel(pathSegments),
        value: '-',
      })
      return
    }

    if (value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
      fields.push({
        keyPath: pathSegments.join('.'),
        label: formatKeyPathLabel(pathSegments),
        value: value.map(normalizeScalarValue).join(', '),
      })
      return
    }

    value.forEach((item, index) => {
      flattenValue(item, [...pathSegments, `[${index}]`], fields)
    })
    return
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      fields.push({
        keyPath: pathSegments.join('.'),
        label: formatKeyPathLabel(pathSegments),
        value: '-',
      })
      return
    }

    for (const [key, nestedValue] of entries) {
      flattenValue(nestedValue, [...pathSegments, key], fields)
    }
    return
  }

  fields.push({
    keyPath: pathSegments.join('.'),
    label: formatKeyPathLabel(pathSegments),
    value: String(value),
  })
}

function toDisplayFields(value: unknown): DotsMocrDisplayField[] | null {
  const fields: DotsMocrDisplayField[] = []
  flattenValue(value, [], fields)
  return fields.length > 0 ? fields : null
}

function tryParseJsonValue(candidate: string): unknown | null {
  const trimmed = candidate.trim()
  if (trimmed.length === 0) {
    return null
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function stripMarkdownCodeFence(content: string): string | null {
  const trimmed = content.trim()
  const fenceMatch = /^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/u.exec(trimmed)
  if (!fenceMatch) {
    return null
  }

  return fenceMatch[1]?.trim() ?? null
}

function extractFirstBalancedJsonBlock(content: string): string | null {
  const trimmed = content.trim()
  const starts = ['{', '[']

  for (let startIndex = 0; startIndex < trimmed.length; startIndex += 1) {
    const startChar = trimmed[startIndex]
    if (!starts.includes(startChar)) {
      continue
    }

    const stack: string[] = [startChar]
    let inString = false
    let isEscaped = false

    for (let index = startIndex + 1; index < trimmed.length; index += 1) {
      const char = trimmed[index]

      if (inString) {
        if (isEscaped) {
          isEscaped = false
          continue
        }

        if (char === '\\') {
          isEscaped = true
          continue
        }

        if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === '{' || char === '[') {
        stack.push(char)
        continue
      }

      if (char === '}' || char === ']') {
        const last = stack[stack.length - 1]
        const matches =
          (char === '}' && last === '{') ||
          (char === ']' && last === '[')
        if (!matches) {
          break
        }

        stack.pop()
        if (stack.length === 0) {
          return trimmed.slice(startIndex, index + 1)
        }
      }
    }
  }

  return null
}

function parseFromTextCandidate(content: string): DotsMocrDisplayField[] | null {
  const direct = tryParseJsonValue(content)
  if (direct !== null) {
    return toDisplayFields(direct)
  }

  const unfenced = stripMarkdownCodeFence(content)
  if (unfenced) {
    const parsedUnfenced = tryParseJsonValue(unfenced)
    if (parsedUnfenced !== null) {
      return toDisplayFields(parsedUnfenced)
    }
  }

  const extracted = extractFirstBalancedJsonBlock(content)
  if (extracted) {
    const parsedExtracted = tryParseJsonValue(extracted)
    if (parsedExtracted !== null) {
      return toDisplayFields(parsedExtracted)
    }
  }

  return null
}

function parseFromRawMessageContent(rawResponseJson: string): DotsMocrDisplayField[] | null {
  const rawParsed = tryParseJsonValue(rawResponseJson) as
    | {
        choices?: Array<{
          message?: {
            content?: unknown
          }
        }>
      }
    | null

  const messageContent = rawParsed?.choices?.[0]?.message?.content
  if (typeof messageContent === 'string') {
    return parseFromTextCandidate(messageContent)
  }

  if (Array.isArray(messageContent)) {
    const combinedText = messageContent
      .map((part) => {
        if (!part || typeof part !== 'object') {
          return null
        }

        const textPart = part as { type?: unknown; text?: unknown }
        return textPart.type === 'text' && typeof textPart.text === 'string' ? textPart.text : null
      })
      .filter((value): value is string => value !== null)
      .join('')

    if (combinedText.trim().length > 0) {
      return parseFromTextCandidate(combinedText)
    }
  }

  if (
    messageContent &&
    typeof messageContent === 'object' &&
    'text' in messageContent &&
    typeof (messageContent as { text?: unknown }).text === 'string'
  ) {
    return parseFromTextCandidate((messageContent as { text: string }).text)
  }

  return null
}

export function parseDotsMocrDisplayFields(
  content: string,
  rawResponseJson?: string | null,
): DotsMocrDisplayField[] | null {
  const fromContent = parseFromTextCandidate(content)
  if (fromContent) {
    return fromContent
  }

  if (rawResponseJson && rawResponseJson.trim().length > 0) {
    return parseFromRawMessageContent(rawResponseJson)
  }

  return null
}
