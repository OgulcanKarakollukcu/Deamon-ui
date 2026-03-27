import type { CheckMetadata, CreateBordroRequest, ScanColorMode, Scanner } from '../types'

const BASE_URL = import.meta.env.VITE_BRANCH_ADDR ?? 'http://127.0.0.1:8080'

const GRPC_WEB_BINARY_HEADERS = {
  'Content-Type': 'application/grpc-web+proto',
  Accept: 'application/grpc-web+proto',
  'x-grpc-web': '1',
  'x-user-agent': 'grpc-web-javascript/0.1',
}

const GRPC_WEB_DATA_FRAME_FLAG = 0x00
const GRPC_WEB_TRAILER_FRAME_FLAG = 0x80
const GRPC_WEB_FRAME_HEADER_LEN = 5

const FRONT_IMAGE_FILE_NAME = 'front.png'
const BACK_IMAGE_FILE_NAME = 'back.png'
const FRONT_IMAGE_LEGACY_FILE_NAME = 'front.bin'
const BACK_IMAGE_LEGACY_FILE_NAME = 'back.bin'
const CHECK_METADATA_FILE_NAME = 'metadata.json'

const LIST_SCANNERS_PATH = '/daemon.management.ManagementService/ListScanners'
const RESERVE_SCANNER_PATH = '/daemon.management.ManagementService/ReserveScanner'
const RELEASE_SCANNER_PATH = '/daemon.management.ManagementService/ReleaseScanner'
const CREATE_BORDRO_PATH = '/daemon.check.CheckService/CreateBordro'
const SCAN_CHECK_PATH = '/daemon.check.CheckService/ScanCheck'
const SCAN_BORDRO_PATH = '/daemon.check.CheckService/ScanBordro'
const STORAGE_LIST_OBJECTS_PATH = '/daemon.storage.StorageService/ListObjects'
const STORAGE_GET_OBJECT_PATH = '/daemon.storage.StorageService/GetObject'
const HEALTH_CHECK_PATH = '/grpc.health.v1.Health/Check'

type ProtoCheckMetadata = {
  bordro_id: string
  check_no: string
  micr_data: string
  qr_data: string
  object_path: string
  front_image_path: string
  back_image_path: string
  front_image_content_type: string
  back_image_content_type: string
  page_count: number
  micr_qr_match: boolean
  has_duplex: boolean
  duplex: boolean
  has_dpi: boolean
  dpi: number
  has_color_mode: boolean
  color_mode: number
  has_effective_duplex: boolean
  effective_duplex: boolean
  has_effective_dpi: boolean
  effective_dpi: number
  has_effective_color_mode: boolean
  effective_color_mode: number
  has_duplex_verified: boolean
  duplex_verified: boolean
  has_dpi_verified: boolean
  dpi_verified: boolean
  has_color_mode_verified: boolean
  color_mode_verified: boolean
}

type PcDaemonStatus = 'available' | 'reserved' | 'unavailable'

export type StorageObjectPaths = {
  front_path: string | null
  front_is_png: boolean
  back_path: string | null
  back_is_png: boolean
  metadata_path: string | null
}

export type StorageObjectData = {
  data: Uint8Array
  contentType: string | null
}

function mapScanColorModeToProto(mode: ScanColorMode): number {
  if (mode === 'COLOR') {
    return 1
  }

  if (mode === 'GRAYSCALE') {
    return 2
  }

  if (mode === 'BLACK_AND_WHITE') {
    return 3
  }

  return 0
}

function mapProtoScanColorModeToUi(mode: number): ScanColorMode {
  if (mode === 1) {
    return 'COLOR'
  }

  if (mode === 2) {
    return 'GRAYSCALE'
  }

  if (mode === 3) {
    return 'BLACK_AND_WHITE'
  }

  return 'UNSPECIFIED'
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value)
}

function decodeGrpcMessage(value: string | null): string | null {
  if (value === null) {
    return null
  }

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}

function encodeVarint(value: number): Uint8Array {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`invalid varint value: ${value.toString()}`)
  }

  const bytes: number[] = []
  let current = Math.trunc(value)

  while (current >= 0x80) {
    bytes.push((current & 0x7f) | 0x80)
    current = Math.floor(current / 128)
  }

  bytes.push(current)
  return Uint8Array.from(bytes)
}

function decodeVarint(value: Uint8Array, offset: number): { value: number; offset: number } {
  let result = 0
  let shift = 0
  let cursor = offset

  while (cursor < value.length) {
    const current = value[cursor]
    result += (current & 0x7f) * 2 ** shift
    cursor += 1

    if ((current & 0x80) === 0) {
      return { value: result, offset: cursor }
    }

    shift += 7
    if (shift > 63) {
      break
    }
  }

  throw new Error('malformed varint payload')
}

function encodeTag(fieldNumber: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wireType)
}

function encodeStringField(fieldNumber: number, value: string): Uint8Array {
  const encodedValue = encodeUtf8(value)
  return concatBytes([
    encodeTag(fieldNumber, 2),
    encodeVarint(encodedValue.length),
    encodedValue,
  ])
}

function encodeInt32Field(fieldNumber: number, value: number): Uint8Array {
  return concatBytes([encodeTag(fieldNumber, 0), encodeVarint(value)])
}

function encodeBoolField(fieldNumber: number, value: boolean): Uint8Array {
  return concatBytes([encodeTag(fieldNumber, 0), encodeVarint(value ? 1 : 0)])
}

function readLengthDelimited(
  value: Uint8Array,
  offset: number,
): { value: Uint8Array; offset: number } {
  const lengthInfo = decodeVarint(value, offset)
  const nextOffset = lengthInfo.offset + lengthInfo.value

  if (nextOffset > value.length) {
    throw new Error('invalid length-delimited payload')
  }

  return {
    value: value.slice(lengthInfo.offset, nextOffset),
    offset: nextOffset,
  }
}

function skipUnknownField(value: Uint8Array, offset: number, wireType: number): number {
  if (wireType === 0) {
    return decodeVarint(value, offset).offset
  }

  if (wireType === 1) {
    const nextOffset = offset + 8
    if (nextOffset > value.length) {
      throw new Error('invalid fixed64 payload')
    }
    return nextOffset
  }

  if (wireType === 2) {
    return readLengthDelimited(value, offset).offset
  }

  if (wireType === 5) {
    const nextOffset = offset + 4
    if (nextOffset > value.length) {
      throw new Error('invalid fixed32 payload')
    }
    return nextOffset
  }

  throw new Error(`unsupported protobuf wire type: ${wireType.toString()}`)
}

function frameGrpcWebMessage(message: Uint8Array): Uint8Array {
  const framed = new Uint8Array(GRPC_WEB_FRAME_HEADER_LEN + message.length)
  framed[0] = GRPC_WEB_DATA_FRAME_FLAG

  const view = new DataView(framed.buffer, framed.byteOffset, framed.byteLength)
  view.setUint32(1, message.length, false)
  framed.set(message, GRPC_WEB_FRAME_HEADER_LEN)

  return framed
}

type ParsedGrpcWebFrames = {
  messages: Uint8Array[]
  trailerStatus: string | null
  trailerMessage: string | null
}

function parseGrpcWebFrames(payload: Uint8Array): ParsedGrpcWebFrames {
  let offset = 0
  const messages: Uint8Array[] = []
  let trailerStatus: string | null = null
  let trailerMessage: string | null = null

  while (offset + GRPC_WEB_FRAME_HEADER_LEN <= payload.length) {
    const frameFlag = payload[offset]
    const frameLength = new DataView(
      payload.buffer,
      payload.byteOffset + offset + 1,
      4,
    ).getUint32(0, false)
    const frameStart = offset + GRPC_WEB_FRAME_HEADER_LEN
    const frameEnd = frameStart + frameLength

    if (frameEnd > payload.length) {
      throw new Error('invalid gRPC-Web frame length')
    }

    const framePayload = payload.slice(frameStart, frameEnd)
    if ((frameFlag & GRPC_WEB_TRAILER_FRAME_FLAG) === GRPC_WEB_TRAILER_FRAME_FLAG) {
      const trailerText = decodeUtf8(framePayload)
      const trailerLines = trailerText.split('\r\n')

      for (const line of trailerLines) {
        const separatorIndex = line.indexOf(':')
        if (separatorIndex <= 0) {
          continue
        }

        const key = line.slice(0, separatorIndex).trim().toLowerCase()
        const rawValue = line.slice(separatorIndex + 1).trim()

        if (key === 'grpc-status') {
          trailerStatus = rawValue
        }

        if (key === 'grpc-message') {
          trailerMessage = decodeGrpcMessage(rawValue)
        }
      }
    } else {
      messages.push(framePayload)
    }

    offset = frameEnd
  }

  if (offset !== payload.length) {
    throw new Error('invalid gRPC-Web payload')
  }

  return {
    messages,
    trailerStatus,
    trailerMessage,
  }
}

function parseScannerInfo(payload: Uint8Array): Scanner {
  let offset = 0
  let scannerId = ''
  let pcDaemonId = ''
  let pcDaemonAddr = ''
  let scanGrpcAddr = ''
  let pcDaemonStatus: PcDaemonStatus = 'unavailable'
  let lastHeartbeatUnix = 0
  let isReserved = false

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      scannerId = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 2 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      pcDaemonId = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 3 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      isReserved = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 5 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      pcDaemonAddr = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 6 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      scanGrpcAddr = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 7 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      const rawStatus = decodeUtf8(value.value).trim()
      if (rawStatus === 'available' || rawStatus === 'reserved' || rawStatus === 'unavailable') {
        pcDaemonStatus = rawStatus
      }
      offset = value.offset
      continue
    }

    if (fieldNumber === 8 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      lastHeartbeatUnix = value.value
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  if (pcDaemonStatus === 'unavailable' && isReserved) {
    pcDaemonStatus = 'reserved'
  }

  const lastHeartbeat =
    Number.isFinite(lastHeartbeatUnix) && lastHeartbeatUnix > 0
      ? new Date(lastHeartbeatUnix * 1000).toISOString()
      : '-'

  return {
    scanner_id: scannerId,
    pc_daemon_id: pcDaemonId || '-',
    pc_daemon_addr: pcDaemonAddr || '-',
    scan_grpc_addr: scanGrpcAddr || '-',
    pc_daemon_status: pcDaemonStatus,
    last_heartbeat_unix: lastHeartbeatUnix,
    last_heartbeat: lastHeartbeat,
  }
}

function parseListScannersResponse(payload: Uint8Array): Scanner[] {
  let offset = 0
  const scanners: Scanner[] = []

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      scanners.push(parseScannerInfo(value.value))
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return scanners
}

function parseCreateBordroResponse(payload: Uint8Array): { bordro_id: string } {
  let offset = 0
  let bordroId = ''

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      bordroId = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return { bordro_id: bordroId }
}

function parseCheckMetadata(payload: Uint8Array): ProtoCheckMetadata {
  let offset = 0
  const metadata: ProtoCheckMetadata = {
    bordro_id: '',
    check_no: '',
    micr_data: '',
    qr_data: '',
    object_path: '',
    front_image_path: '',
    back_image_path: '',
    front_image_content_type: '',
    back_image_content_type: '',
    page_count: 0,
    micr_qr_match: false,
    has_duplex: false,
    duplex: false,
    has_dpi: false,
    dpi: 0,
    has_color_mode: false,
    color_mode: 0,
    has_effective_duplex: false,
    effective_duplex: false,
    has_effective_dpi: false,
    effective_dpi: 0,
    has_effective_color_mode: false,
    effective_color_mode: 0,
    has_duplex_verified: false,
    duplex_verified: false,
    has_dpi_verified: false,
    dpi_verified: false,
    has_color_mode_verified: false,
    color_mode_verified: false,
  }

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      const decoded = decodeUtf8(value.value)

      if (fieldNumber === 1) {
        metadata.bordro_id = decoded
      } else if (fieldNumber === 2) {
        metadata.check_no = decoded
      } else if (fieldNumber === 3) {
        metadata.micr_data = decoded
      } else if (fieldNumber === 4) {
        metadata.qr_data = decoded
      } else if (fieldNumber === 5) {
        metadata.object_path = decoded
      } else if (fieldNumber === 17) {
        metadata.front_image_path = decoded
      } else if (fieldNumber === 18) {
        metadata.back_image_path = decoded
      } else if (fieldNumber === 19) {
        metadata.front_image_content_type = decoded
      } else if (fieldNumber === 20) {
        metadata.back_image_content_type = decoded
      }

      offset = value.offset
      continue
    }

    if (fieldNumber === 6 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.page_count = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 7 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.micr_qr_match = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 8 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.has_duplex = true
      metadata.duplex = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 9 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.has_dpi = true
      metadata.dpi = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 10 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.has_color_mode = true
      metadata.color_mode = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 11 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.has_effective_duplex = true
      metadata.effective_duplex = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 12 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.has_effective_dpi = true
      metadata.effective_dpi = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 13 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.has_effective_color_mode = true
      metadata.effective_color_mode = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 14 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.has_duplex_verified = true
      metadata.duplex_verified = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 15 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.has_dpi_verified = true
      metadata.dpi_verified = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 16 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.has_color_mode_verified = true
      metadata.color_mode_verified = value.value !== 0
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return metadata
}

function parseScanCheckResponse(payload: Uint8Array): ProtoCheckMetadata {
  let offset = 0

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      return parseCheckMetadata(value.value)
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  throw new Error('scanCheck response did not include metadata')
}

function parseScanBordroResponse(payload: Uint8Array): ProtoCheckMetadata[] {
  let offset = 0
  const checks: ProtoCheckMetadata[] = []

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      checks.push(parseCheckMetadata(value.value))
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return checks
}

function mapProtoMetadataToUi(
  metadata: ProtoCheckMetadata,
  request: {
    scanner_id: string
    session_id: string
    bordro_id: string
    check_no: number
    duplex: boolean
    dpi: number
    color_mode: ScanColorMode
  },
): CheckMetadata {
  const parsedCheckNo = Number.parseInt(metadata.check_no, 10)
  const checkNo = Number.isInteger(parsedCheckNo) && parsedCheckNo > 0
    ? parsedCheckNo
    : request.check_no
  const requestedDuplex = metadata.has_duplex ? metadata.duplex : request.duplex
  const requestedDpi = metadata.has_dpi && metadata.dpi > 0 ? metadata.dpi : request.dpi
  const requestedColorMode = metadata.has_color_mode
    ? mapProtoScanColorModeToUi(metadata.color_mode)
    : request.color_mode
  const effectiveDuplex = metadata.has_effective_duplex ? metadata.effective_duplex : requestedDuplex
  const effectiveDpi = metadata.has_effective_dpi && metadata.effective_dpi > 0
    ? metadata.effective_dpi
    : requestedDpi
  const effectiveColorMode = metadata.has_effective_color_mode
    ? mapProtoScanColorModeToUi(metadata.effective_color_mode)
    : requestedColorMode
  const pageCount = metadata.page_count > 0
    ? metadata.page_count
    : effectiveDuplex
      ? 2
      : 1

  return {
    object_path: metadata.object_path,
    scanner_id: request.scanner_id,
    session_id: request.session_id,
    bordro_id: metadata.bordro_id || request.bordro_id,
    check_no: checkNo,
    micr_data: metadata.micr_data,
    qr_data: metadata.qr_data,
    front_image_path: metadata.front_image_path,
    back_image_path: metadata.back_image_path,
    front_image_content_type: metadata.front_image_content_type,
    back_image_content_type: metadata.back_image_content_type,
    micr: metadata.micr_data,
    qr: metadata.qr_data,
    page_count: pageCount,
    micr_qr_match: metadata.micr_qr_match,
    duplex: requestedDuplex,
    dpi: requestedDpi,
    color_mode: requestedColorMode,
    effective_duplex: effectiveDuplex,
    effective_dpi: effectiveDpi,
    effective_color_mode: effectiveColorMode,
    duplex_verified: metadata.has_duplex_verified ? metadata.duplex_verified : false,
    dpi_verified: metadata.has_dpi_verified ? metadata.dpi_verified : false,
    color_mode_verified: metadata.has_color_mode_verified ? metadata.color_mode_verified : false,
    // Front/back object path values can arrive from API, otherwise are resolved via ListObjects.
    front_path: metadata.front_image_path,
    back_path: metadata.back_image_path,
  }
}

function decodeUtf8Strict(value: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value)
  } catch {
    return null
  }
}

function isLikelyObjectPath(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return false
  }

  if (trimmed.includes('\n') || trimmed.includes('\r')) {
    return false
  }

  return (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.endsWith(FRONT_IMAGE_FILE_NAME) ||
    trimmed.endsWith(BACK_IMAGE_FILE_NAME) ||
    trimmed.endsWith(FRONT_IMAGE_LEGACY_FILE_NAME) ||
    trimmed.endsWith(BACK_IMAGE_LEGACY_FILE_NAME) ||
    trimmed.endsWith(CHECK_METADATA_FILE_NAME)
  )
}

function collectLikelyObjectPaths(payload: Uint8Array, depth = 0): string[] {
  if (depth > 4 || payload.length === 0) {
    return []
  }

  const paths: string[] = []
  let offset = 0

  try {
    while (offset < payload.length) {
      const tagInfo = decodeVarint(payload, offset)
      offset = tagInfo.offset

      const wireType = tagInfo.value & 0x07
      if (wireType === 2) {
        const value = readLengthDelimited(payload, offset)
        const decoded = decodeUtf8Strict(value.value)
        if (decoded !== null && isLikelyObjectPath(decoded)) {
          paths.push(decoded.trim())
        }

        if (value.value.length > 0) {
          paths.push(...collectLikelyObjectPaths(value.value, depth + 1))
        }

        offset = value.offset
        continue
      }

      offset = skipUnknownField(payload, offset, wireType)
    }
  } catch {
    return paths
  }

  return paths
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/gu, '/').replace(/\/+$/u, '')
}

function isPathWithFileName(path: string, fileName: string): boolean {
  const normalized = normalizePath(path)
  return normalized === fileName || normalized.endsWith(`/${fileName}`)
}

function findObjectPathBySuffix(paths: string[], fileName: string): string | null {
  for (const path of paths) {
    if (isPathWithFileName(path, fileName)) {
      return path.trim()
    }
  }

  return null
}

function findPreferredObjectPathBySuffix(
  paths: string[],
  preferredFileName: string,
  fallbackFileName: string,
): { path: string | null; isPng: boolean } {
  const preferred = findObjectPathBySuffix(paths, preferredFileName)
  if (preferred) {
    return { path: preferred, isPng: true }
  }

  const fallback = findObjectPathBySuffix(paths, fallbackFileName)
  if (fallback) {
    return { path: fallback, isPng: false }
  }

  return { path: null, isPng: false }
}

function parseListObjectsResponse(payload: Uint8Array): string[] {
  const candidates = collectLikelyObjectPaths(payload)
  const deduped = new Set<string>()

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    if (trimmed.length > 0) {
      deduped.add(trimmed)
    }
  }

  return [...deduped]
}

function parseGetObjectChunkData(payload: Uint8Array): Uint8Array {
  let offset = 0
  let longestField: Uint8Array | null = null
  let longestNonPathField: Uint8Array | null = null

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const wireType = tagInfo.value & 0x07
    if (wireType !== 2) {
      offset = skipUnknownField(payload, offset, wireType)
      continue
    }

    const value = readLengthDelimited(payload, offset)
    if (longestField === null || value.value.length > longestField.length) {
      longestField = value.value
    }

    const decoded = decodeUtf8Strict(value.value)
    if (decoded === null || !isLikelyObjectPath(decoded)) {
      if (longestNonPathField === null || value.value.length > longestNonPathField.length) {
        longestNonPathField = value.value
      }
    }

    offset = value.offset
  }

  return longestNonPathField ?? longestField ?? new Uint8Array()
}

type GrpcWebCallResult = {
  messages: Uint8Array[]
}

async function callGrpcWeb(
  method: string,
  path: string,
  encodedRequest: Uint8Array,
): Promise<GrpcWebCallResult> {
  let response: Response

  try {
    const framedRequest = frameGrpcWebMessage(encodedRequest)
    const framedRequestBody = framedRequest.buffer.slice(
      framedRequest.byteOffset,
      framedRequest.byteOffset + framedRequest.byteLength,
    ) as ArrayBuffer

    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: GRPC_WEB_BINARY_HEADERS,
      body: framedRequestBody,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${method} failed: 0 ${message}`)
  }

  const responseBody = new Uint8Array(await response.arrayBuffer())
  const parsed = parseGrpcWebFrames(responseBody)

  const grpcStatus = parsed.trailerStatus ?? response.headers.get('grpc-status')
  const grpcMessage = parsed.trailerMessage ?? decodeGrpcMessage(response.headers.get('grpc-message'))

  if (!response.ok) {
    throw new Error(
      `${method} failed: HTTP ${response.status.toString()}${grpcMessage ? ` ${grpcMessage}` : ''}`,
    )
  }

  if (grpcStatus !== null && grpcStatus !== '0') {
    throw new Error(
      `${method} failed: gRPC ${grpcStatus}${grpcMessage ? ` ${grpcMessage}` : ''}`,
    )
  }

  return { messages: parsed.messages }
}

async function callGrpcWebUnary(
  method: string,
  path: string,
  encodedRequest: Uint8Array,
): Promise<Uint8Array> {
  const response = await callGrpcWeb(method, path, encodedRequest)
  return response.messages[0] ?? new Uint8Array()
}

async function callGrpcWebServerStreaming(
  method: string,
  path: string,
  encodedRequest: Uint8Array,
): Promise<Uint8Array[]> {
  const response = await callGrpcWeb(method, path, encodedRequest)
  return response.messages
}

function encodeHealthCheckRequest(service: string): Uint8Array {
  if (service.trim().length === 0) {
    return new Uint8Array()
  }

  return encodeStringField(1, service)
}

function encodeReserveOrReleaseRequest(scanner_id: string, session_id: string): Uint8Array {
  return concatBytes([
    encodeStringField(1, scanner_id),
    encodeStringField(2, session_id),
  ])
}

function encodeCreateBordroRequest(params: CreateBordroRequest): Uint8Array {
  return concatBytes([
    encodeInt32Field(1, params.check_count),
    encodeStringField(2, params.check_type),
    encodeStringField(3, params.bordro_amount),
    encodeStringField(4, params.account_no),
    encodeStringField(5, params.customer_name),
    encodeStringField(6, params.account_branch),
    encodeStringField(7, params.currency),
  ])
}

function encodeScanCheckRequest(params: {
  scanner_id: string
  session_id: string
  bordro_id: string
  check_no: number
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
}): Uint8Array {
  const scanOptions = encodeScanOptionsFields({
    duplex: params.duplex,
    dpi: params.dpi,
    color_mode: params.color_mode,
  })
  return concatBytes([
    encodeStringField(1, params.scanner_id),
    encodeStringField(2, params.session_id),
    encodeStringField(3, params.bordro_id),
    encodeStringField(4, params.check_no.toString()),
    ...scanOptions,
  ])
}

function encodeScanBordroRequest(params: {
  scanner_id: string
  session_id: string
  bordro_id: string
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
}): Uint8Array {
  const scanOptions = encodeScanOptionsFields({
    duplex: params.duplex,
    dpi: params.dpi,
    color_mode: params.color_mode,
  })
  return concatBytes([
    encodeStringField(1, params.scanner_id),
    encodeStringField(2, params.session_id),
    encodeStringField(3, params.bordro_id),
    ...scanOptions,
  ])
}

function encodeScanOptionsFields(params: {
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
}): Uint8Array[] {
  const duplex = params.duplex === true
  return [
    encodeBoolField(7, duplex),
    encodeInt32Field(8, params.dpi),
    encodeInt32Field(9, mapScanColorModeToProto(params.color_mode)),
  ]
}

function encodeListObjectsRequest(prefix: string): Uint8Array {
  return encodeStringField(1, prefix)
}

function encodeGetObjectRequest(path: string): Uint8Array {
  return encodeStringField(1, path)
}

function getListObjectsPrefixCandidates(prefix: string): string[] {
  const trimmed = prefix.trim()
  if (trimmed.length === 0) {
    return ['']
  }

  const candidates = [trimmed]
  const withoutDriveDot = trimmed.replace(/^[a-z]\.(?=[/\\])/iu, '')
  if (withoutDriveDot !== trimmed) {
    candidates.push(withoutDriveDot)
  }

  return [...new Set(candidates)]
}

function getGetObjectPathCandidates(path: string): string[] {
  const trimmed = path.trim()
  if (trimmed.length === 0) {
    return ['']
  }

  const candidates = [trimmed]

  const withoutCurrentDirPrefix = trimmed.replace(/^\.([/\\]+)/u, '')
  if (withoutCurrentDirPrefix !== trimmed) {
    candidates.push(withoutCurrentDirPrefix)
  }

  const withoutLeadingSlash = trimmed.replace(/^[/\\]+/u, '')
  if (withoutLeadingSlash !== trimmed) {
    candidates.push(withoutLeadingSlash)
  }

  const normalizedSlashes = trimmed.replace(/\\/gu, '/')
  if (normalizedSlashes !== trimmed) {
    candidates.push(normalizedSlashes)
    candidates.push(normalizedSlashes.replace(/^\.\/+/u, ''))
    candidates.push(normalizedSlashes.replace(/^\/+/u, ''))
  }

  return [...new Set(candidates.map((candidate) => candidate.trim()).filter((candidate) => candidate.length > 0))]
}

export async function listScanners(): Promise<Scanner[]> {
  const response = await callGrpcWebUnary(
    'listScanners',
    LIST_SCANNERS_PATH,
    new Uint8Array(),
  )

  return parseListScannersResponse(response)
}

export function getBranchDaemonBaseUrl(): string {
  return BASE_URL
}

export async function checkHealth(): Promise<boolean> {
  try {
    await callGrpcWebUnary(
      'checkHealth',
      HEALTH_CHECK_PATH,
      encodeHealthCheckRequest(''),
    )
    return true
  } catch {
    // Fallback for daemon versions that do not expose the standard health service.
  }

  try {
    await listScanners()
    return true
  } catch {
    return false
  }
}

export async function reserveScanner(scanner_id: string, session_id: string): Promise<void> {
  await callGrpcWebUnary(
    'reserveScanner',
    RESERVE_SCANNER_PATH,
    encodeReserveOrReleaseRequest(scanner_id, session_id),
  )
}

export async function releaseScanner(scanner_id: string, session_id: string): Promise<void> {
  await callGrpcWebUnary(
    'releaseScanner',
    RELEASE_SCANNER_PATH,
    encodeReserveOrReleaseRequest(scanner_id, session_id),
  )
}

export async function createBordro(request: CreateBordroRequest): Promise<{ bordro_id: string }> {
  const response = await callGrpcWebUnary(
    'createBordro',
    CREATE_BORDRO_PATH,
    encodeCreateBordroRequest(request),
  )

  return parseCreateBordroResponse(response)
}

export async function scanCheck(params: {
  scanner_id: string
  session_id: string
  bordro_id: string
  check_no: number
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
}): Promise<CheckMetadata> {
  const response = await callGrpcWebUnary(
    'scanCheck',
    SCAN_CHECK_PATH,
    encodeScanCheckRequest(params),
  )

  const metadata = parseScanCheckResponse(response)
  return mapProtoMetadataToUi(metadata, params)
}

export async function scanBordro(params: {
  scanner_id: string
  session_id: string
  bordro_id: string
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
}): Promise<CheckMetadata[]> {
  const response = await callGrpcWebUnary(
    'scanBordro',
    SCAN_BORDRO_PATH,
    encodeScanBordroRequest(params),
  )

  return parseScanBordroResponse(response)
    .map((metadata, index) =>
      mapProtoMetadataToUi(metadata, {
        ...params,
        check_no: index + 1,
      }),
    )
    .sort((left, right) => left.check_no - right.check_no)
}

export async function listStorageObjects(prefix: string): Promise<string[]> {
  const prefixCandidates = getListObjectsPrefixCandidates(prefix)
  let lastParsedPaths: string[] = []

  for (const currentPrefix of prefixCandidates) {
    const response = await callGrpcWebUnary(
      'listObjects',
      STORAGE_LIST_OBJECTS_PATH,
      encodeListObjectsRequest(currentPrefix),
    )

    const parsedPaths = parseListObjectsResponse(response)
    if (parsedPaths.length > 0) {
      return parsedPaths
    }

    lastParsedPaths = parsedPaths
  }

  return lastParsedPaths
}

export async function getStorageObject(path: string): Promise<Uint8Array> {
  const pathCandidates = getGetObjectPathCandidates(path)
  let lastError: unknown = null

  for (const candidatePath of pathCandidates) {
    try {
      const messages = await callGrpcWebServerStreaming(
        'getObject',
        STORAGE_GET_OBJECT_PATH,
        encodeGetObjectRequest(candidatePath),
      )

      const chunks = messages
        .map((message) => parseGetObjectChunkData(message))
        .filter((chunk) => chunk.length > 0)

      if (chunks.length === 0) {
        return new Uint8Array()
      }

      return concatBytes(chunks)
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error('getObject failed: geçerli bir obje yolu bulunamadı.')
}

export async function getStorageObjectWithContentType(path: string): Promise<StorageObjectData> {
  const data = await getStorageObject(path)
  return {
    data,
    contentType: null,
  }
}

export function resolveStorageObjectPaths(paths: string[]): StorageObjectPaths {
  const front = findPreferredObjectPathBySuffix(
    paths,
    FRONT_IMAGE_FILE_NAME,
    FRONT_IMAGE_LEGACY_FILE_NAME,
  )
  const back = findPreferredObjectPathBySuffix(
    paths,
    BACK_IMAGE_FILE_NAME,
    BACK_IMAGE_LEGACY_FILE_NAME,
  )

  return {
    front_path: front.path,
    front_is_png: front.isPng,
    back_path: back.path,
    back_is_png: back.isPng,
    metadata_path: findObjectPathBySuffix(paths, CHECK_METADATA_FILE_NAME),
  }
}
