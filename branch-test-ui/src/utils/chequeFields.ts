export type ParsedMicrFields = {
  chequeSerialNo: string
  bankCode: string
  branchCode: string
  accountNumber: string
}

export type ParsedQrFields = {
  chequeSerialNo: string
  bankCode: string
  branchCode: string
  accountNumber: string
  identityNumber: string
  mersisNumber: string
}

const MICR_SERIAL_LEN = 7
const MICR_BANK_LEN = 3
const MICR_BRANCH_LEN = 4
const MICR_ACCOUNT_LEN = 16

function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '')
}

export function normalizeMicrValue(value: string): string {
  const parsed = parseMicrFields(value)
  if (parsed !== null) {
    return `${parsed.chequeSerialNo}${parsed.bankCode}${parsed.branchCode}${parsed.accountNumber}`
  }

  const digits = digitsOnly(value)
  return digits.length > 0 ? digits : value.trim()
}

export function parseMicrFieldsWithQrHint(
  micrValue: string,
  qrValue: string,
): ParsedMicrFields | null {
  const direct = parseMicrFields(micrValue)
  const qr = parseQrFields(qrValue)
  const digits = digitsOnly(micrValue)
  if (qr === null || digits.length === 0) {
    return direct
  }

  let best = direct
  let bestScore = direct ? scoreMicrFieldsAgainstQr(direct, qr) : -1

  for (const candidate of generateZeroPaddedCandidates(digits)) {
    const parsed = parseMicrFields(candidate)
    if (parsed === null) {
      continue
    }

    const score = scoreMicrFieldsAgainstQr(parsed, qr)
    if (score > bestScore) {
      best = parsed
      bestScore = score
    }
  }

  return best
}

function extractDigitRuns(value: string): string[] {
  const matches = value.match(/\d+/g)
  return matches ?? []
}

function rightmostDigits(value: string, count: number): string {
  const digits = digitsOnly(value)
  if (digits.length < count) {
    return digits
  }

  return digits.slice(-count)
}

export function parseMicrFields(value: string): ParsedMicrFields | null {
  const digits = digitsOnly(value)
  if (digits.length < MICR_SERIAL_LEN + MICR_BANK_LEN + MICR_BRANCH_LEN) {
    return null
  }
  const serialEnd = Math.min(MICR_SERIAL_LEN, digits.length)
  const bankEnd = Math.min(MICR_SERIAL_LEN + MICR_BANK_LEN, digits.length)
  const branchEnd = Math.min(MICR_SERIAL_LEN + MICR_BANK_LEN + MICR_BRANCH_LEN, digits.length)
  const accountEnd = Math.min(branchEnd + MICR_ACCOUNT_LEN, digits.length)
  return {
    chequeSerialNo: digits.slice(0, serialEnd),
    bankCode: digits.slice(MICR_SERIAL_LEN, bankEnd),
    branchCode: digits.slice(bankEnd, branchEnd),
    accountNumber: digits.slice(branchEnd, accountEnd),
  }
}

export function parseQrFields(value: string): ParsedQrFields | null {
  const digitRuns = extractDigitRuns(value)
  let fields: [string, string, string, string, string, string] | null = null

  if (digitRuns.length >= 7 && digitRuns[0]?.length === 2) {
    fields = [
      `${digitRuns[0]}${digitRuns[1]}`,
      digitRuns[2],
      digitRuns[3],
      digitRuns[4],
      digitRuns[5],
      digitRuns[6],
    ]
  } else if (digitRuns.length >= 6 && digitRuns[0]?.length === 2) {
    fields = [
      `${digitRuns[0]}${digitRuns[1]}`,
      digitRuns[2],
      digitRuns[3],
      digitRuns[4],
      digitRuns[5],
      '',
    ]
  } else if (digitRuns.length >= 5 && digitRuns[0]?.length === 2) {
    fields = [
      `${digitRuns[0]}${digitRuns[1]}`,
      digitRuns[2],
      digitRuns[3],
      digitRuns[4],
      '',
      '',
    ]
  } else if (digitRuns.length >= 6) {
    fields = [
      digitRuns[0],
      digitRuns[1],
      digitRuns[2],
      digitRuns[3],
      digitRuns[4],
      digitRuns[5],
    ]
  } else if (digitRuns.length >= 5) {
    fields = [
      digitRuns[0],
      digitRuns[1],
      digitRuns[2],
      digitRuns[3],
      digitRuns[4],
      '',
    ]
  } else if (digitRuns.length >= 4) {
    fields = [
      digitRuns[0],
      digitRuns[1],
      digitRuns[2],
      digitRuns[3],
      '',
      '',
    ]
  }

  if (fields === null) {
    return null
  }

  const [chequeSerialNo, bankCode, branchCode, accountNumber, identityNumber, mersisNumber] =
    fields

  if (
    chequeSerialNo.length < MICR_SERIAL_LEN ||
    bankCode.length < MICR_BANK_LEN ||
    branchCode.length < MICR_BRANCH_LEN ||
    accountNumber.length === 0
  ) {
    return null
  }

  return {
    chequeSerialNo,
    bankCode,
    branchCode,
    accountNumber,
    identityNumber,
    mersisNumber,
  }
}

export function micrAndQrFieldsMatch(micrValue: string, qrValue: string): boolean {
  const micr = parseMicrFieldsWithQrHint(micrValue, qrValue) ?? parseMicrFields(micrValue)
  const qr = parseQrFields(qrValue)
  if (micr === null || qr === null) {
    return false
  }

  return (
    micr.chequeSerialNo === rightmostDigits(qr.chequeSerialNo, MICR_SERIAL_LEN) &&
    micr.bankCode === rightmostDigits(qr.bankCode, MICR_BANK_LEN) &&
    micr.branchCode === rightmostDigits(qr.branchCode, MICR_BRANCH_LEN) &&
    micr.accountNumber === rightmostDigits(qr.accountNumber, MICR_ACCOUNT_LEN)
  )
}

function scoreMicrFieldsAgainstQr(micr: ParsedMicrFields, qr: ParsedQrFields): number {
  return (
    fieldMatchScore(micr.chequeSerialNo, qr.chequeSerialNo, MICR_SERIAL_LEN) +
    fieldMatchScore(micr.bankCode, qr.bankCode, MICR_BANK_LEN) +
    fieldMatchScore(micr.branchCode, qr.branchCode, MICR_BRANCH_LEN) +
    fieldMatchScore(micr.accountNumber, qr.accountNumber, MICR_ACCOUNT_LEN)
  )
}

function fieldMatchScore(left: string, right: string, maxLen: number): number {
  const leftDigits = digitsOnly(left)
  const rightDigits = digitsOnly(right)
  const compareLen = Math.min(leftDigits.length, rightDigits.length, maxLen)
  if (compareLen === 0) {
    return 0
  }

  return leftDigits.slice(-compareLen) === rightDigits.slice(-compareLen) ? compareLen : 0
}

function generateZeroPaddedCandidates(digits: string): string[] {
  const targetLength = MICR_SERIAL_LEN + MICR_BANK_LEN + MICR_BRANCH_LEN + MICR_ACCOUNT_LEN
  if (digits.length === 0 || digits.length >= targetLength) {
    return []
  }

  const missing = targetLength - digits.length
  if (missing <= 0 || missing > 2) {
    return []
  }

  let candidates = [digits]
  for (let round = 0; round < missing; round += 1) {
    const next: string[] = []
    for (const candidate of candidates) {
      for (let position = 0; position <= candidate.length; position += 1) {
        next.push(`${candidate.slice(0, position)}0${candidate.slice(position)}`)
      }
    }
    candidates = next
  }

  return candidates
}
