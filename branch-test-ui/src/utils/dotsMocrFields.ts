export type DotsMocrDisplayField = {
  keyPath: string
  label: string
  value: string
  bbox: DotsMocrBoundingBox | null
}

export type DotsMocrBoundingBox = {
  x1: number
  y1: number
  x2: number
  y2: number
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

function formatRawKeyPath(pathSegments: string[]): string {
  if (pathSegments.length === 0) {
    return 'value'
  }

  return pathSegments.reduce((result, segment) => {
    if (segment.startsWith('[')) {
      return `${result}${segment}`
    }

    return result.length > 0 ? `${result}.${segment}` : segment
  }, '')
}

function parseBoundingBox(value: unknown): DotsMocrBoundingBox | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null
  }

  const [x1, y1, x2, y2] = value
  if (![x1, y1, x2, y2].every((item) => typeof item === 'number' && Number.isFinite(item))) {
    return null
  }

  const rawValues = [x1, y1, x2, y2]
  const usesUnitInterval = rawValues.every((item) => item >= 0 && item <= 1.000001)
  const scale = usesUnitInterval ? 1000 : 1

  return {
    x1: Math.min(1000, Math.max(0, x1 * scale)),
    y1: Math.min(1000, Math.max(0, y1 * scale)),
    x2: Math.min(1000, Math.max(0, x2 * scale)),
    y2: Math.min(1000, Math.max(0, y2 * scale)),
  }
}

function isFieldValueObject(
  value: unknown,
): value is {
  value?: unknown
  bbox?: unknown
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return 'value' in record || 'bbox' in record
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
    const keyPath = formatRawKeyPath(pathSegments)
    fields.push({
      keyPath,
      label: keyPath,
      value: normalizeScalarValue(value),
      bbox: null,
    })
    return
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      const keyPath = formatRawKeyPath(pathSegments)
      fields.push({
        keyPath,
        label: keyPath,
        value: '-',
        bbox: null,
      })
      return
    }

    if (value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
      const keyPath = formatRawKeyPath(pathSegments)
      fields.push({
        keyPath,
        label: keyPath,
        value: value.map(normalizeScalarValue).join(', '),
        bbox: null,
      })
      return
    }

    value.forEach((item, index) => {
      flattenValue(item, [...pathSegments, `[${index}]`], fields)
    })
    return
  }

  if (typeof value === 'object') {
    if (isFieldValueObject(value)) {
      const keyPath = formatRawKeyPath(pathSegments)
      const parsedBbox = parseBoundingBox(value.bbox)
      fields.push({
        keyPath,
        label: keyPath,
        value: normalizeScalarValue(value.value),
        bbox: parsedBbox,
      })
      return
    }

    const record = value as Record<string, unknown>
    const entries = Object.entries(record)
    if (entries.length === 0) {
      const keyPath = formatRawKeyPath(pathSegments)
      fields.push({
        keyPath,
        label: keyPath,
        value: '-',
        bbox: null,
      })
      return
    }

    for (const [key, nestedValue] of entries) {
      if (key.endsWith('_bbox')) {
        continue
      }

      const siblingBbox = parseBoundingBox(record[`${key}_bbox`])
      if (
        nestedValue === null ||
        nestedValue === undefined ||
        typeof nestedValue === 'string' ||
        typeof nestedValue === 'number' ||
        typeof nestedValue === 'boolean'
      ) {
        const keyPath = formatRawKeyPath([...pathSegments, key])
        fields.push({
          keyPath,
          label: keyPath,
          value: normalizeScalarValue(nestedValue),
          bbox: siblingBbox,
        })
        continue
      }

      flattenValue(nestedValue, [...pathSegments, key], fields)
    }
    return
  }

  const keyPath = formatRawKeyPath(pathSegments)
  fields.push({
    keyPath,
    label: keyPath,
    value: String(value),
    bbox: null,
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
