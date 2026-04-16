import type {
  BordroScanMetadata,
  ChequeAnalysisModels,
  CleanupReservationsResponse,
  ChequeImageDebugResult,
  DotsMocrChequeAnalysisResult,
  QwenChequeAnalysisResult,
  ChequeMetadata,
  CreateBordroRequest,
  DocumentScanMetadata,
  DocumentScanProgress,
  DocumentType,
  ManagementDiagnostics,
  PcDaemon,
  ReservationInfo,
  ResetScannerResponse,
  ScanColorMode,
  ScanAllChequeProgress,
  ScanPageSize,
  Scanner,
  SupportSnapshot,
} from '../types'

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

const FRONT_IMAGE_FILE_NAME = 'front.jpg'
const BACK_IMAGE_FILE_NAME = 'back.jpg'
const FRONT_IMAGE_PNG_FILE_NAME = 'front.png'
const BACK_IMAGE_PNG_FILE_NAME = 'back.png'
const FRONT_IMAGE_LEGACY_FILE_NAME = 'front.bin'
const BACK_IMAGE_LEGACY_FILE_NAME = 'back.bin'
const CHEQUE_METADATA_FILE_NAME = 'metadata.json'

const LIST_SCANNERS_PATH = '/daemon.management.ManagementService/ListScanners'
const GET_DIAGNOSTICS_PATH = '/daemon.management.ManagementService/GetDiagnostics'
const GET_SUPPORT_SNAPSHOT_PATH = '/daemon.management.ManagementService/GetSupportSnapshot'
const RESERVE_SCANNER_PATH = '/daemon.management.ManagementService/ReserveScanner'
const RELEASE_SCANNER_PATH = '/daemon.management.ManagementService/ReleaseScanner'
const RESET_SCANNER_PATH = '/daemon.management.ManagementService/ResetScanner'
const CLEANUP_RESERVATIONS_PATH = '/daemon.management.ManagementService/CleanupReservations'
const CREATE_BORDRO_PATH = '/daemon.cheque.ChequeService/CreateBordro'
const LIST_CHEQUE_ANALYSIS_MODELS_PATH = '/daemon.cheque.ChequeService/ListChequeAnalysisModels'
const ANALYZE_CHEQUE_IMAGE_PATH = '/daemon.cheque.ChequeService/AnalyzeChequeImage'
const ANALYZE_CHEQUE_WITH_DOTS_MOCR_PATH = '/daemon.cheque.ChequeService/AnalyzeChequeWithDotsMocr'
const ANALYZE_CHEQUE_WITH_QWEN_PATH = '/daemon.cheque.ChequeService/AnalyzeChequeWithQwen'
const SCAN_CHEQUE_PATH = '/daemon.cheque.ChequeService/ScanCheque'
const SCAN_ALL_CHEQUE_PATH = '/daemon.cheque.ChequeService/ScanAllCheque'
const SCAN_BORDRO_PATH = '/daemon.cheque.ChequeService/ScanBordro'
const SCAN_DOCUMENT_PATH = '/daemon.scan.ScanService/ScanDocument'
const STORAGE_LIST_OBJECTS_PATH = '/daemon.storage.StorageService/ListObjects'
const STORAGE_GET_OBJECT_PATH = '/daemon.storage.StorageService/GetObject'
const HEALTH_CHECK_PATH = '/grpc.health.v1.Health/Check'

type ProtoChequeMetadata = {
  bordro_id: string
  cheque_no: string
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

type ProtoChequeImageDebugResult = {
  micr_data: string
  qr_data: string
  micr_qr_match: boolean
  effective_dpi: number
  image_size_bytes: number
  micr_ms: number
  qr_ms: number
  total_ms: number
}

type ProtoDotsMocrChequeAnalysisResult = {
  object_path: string
  front_image_path: string
  model: string
  prompt_mode: string
  content: string
  raw_response_json: string
  total_ms: number
}

type ProtoQwenChequeAnalysisResult = {
  object_path: string
  front_image_path: string
  model: string
  prompt_mode: string
  content: string
  raw_response_json: string
  total_ms: number
}

type ProtoChequeAnalysisModels = {
  dots_mocr_models: string[]
  qwen_models: string[]
  default_dots_mocr_model: string
  default_qwen_model: string
}

type PcDaemonStatus = 'available' | 'reserved' | 'unavailable'

type ProtoManagementDiagnostics = {
  node_role: string
  generated_at_unix: number
  online_pc_daemon_count: number
  scanner_count: number
  available_scanner_count: number
  reserved_scanner_count: number
  active_reservation_count: number
  expired_reservation_count: number
  reservation_timeout_secs: number
  heartbeat_timeout_secs: number
}

type ProtoDocumentPageMetadata = {
  sheet_index: number
  front_image_path: string
  front_image_content_type: string
  back_image_path: string | null
  back_image_content_type: string | null
}

type ProtoDocumentScanMetadata = {
  document_id: string
  document_type: number
  object_path: string
  sheet_count: number
  page_count: number
  pages: ProtoDocumentPageMetadata[]
  duplex: boolean
  dpi: number
  color_mode: number
  page_size: number
  effective_duplex: boolean
  effective_dpi: number
  effective_color_mode: number
  duplex_verified: boolean
  dpi_verified: boolean
  color_mode_verified: boolean
}

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

function mapScanPageSizeToProto(size: ScanPageSize): number {
  if (size === 'CHEQUE') {
    return 1
  }

  if (size === 'A4') {
    return 2
  }

  return 0
}

function mapProtoScanPageSizeToUi(size: number): ScanPageSize {
  if (size === 1) {
    return 'CHEQUE'
  }

  if (size === 2) {
    return 'A4'
  }

  return 'UNSPECIFIED'
}

function mapDocumentTypeToProto(type: DocumentType): number {
  if (type === 'GENERIC') {
    return 1
  }

  return 0
}

function mapProtoDocumentTypeToUi(type: number): DocumentType {
  if (type === 1) {
    return 'GENERIC'
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

type IncrementalGrpcWebFrames = ParsedGrpcWebFrames & {
  remaining: Uint8Array
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
  let reservedSessionId = ''

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

    if (fieldNumber === 4 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      reservedSessionId = decodeUtf8(value.value)
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
    is_reserved: isReserved || reservedSessionId.trim().length > 0,
    reserved_session_id: reservedSessionId,
    last_heartbeat_unix: lastHeartbeatUnix,
    last_heartbeat: lastHeartbeat,
  }
}

function encodeBytesField(fieldNumber: number, value: Uint8Array): Uint8Array {
  return concatBytes([
    encodeTag(fieldNumber, 2),
    encodeVarint(value.length),
    value,
  ])
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

function formatHeartbeatFromUnix(lastHeartbeatUnix: number): string {
  return Number.isFinite(lastHeartbeatUnix) && lastHeartbeatUnix > 0
    ? new Date(lastHeartbeatUnix * 1000).toISOString()
    : '-'
}

function parseDaemonInfo(payload: Uint8Array): PcDaemon {
  let offset = 0
  let pcDaemonId = ''
  let pcDaemonAddr = ''
  let scannerId = ''
  let status: PcDaemon['status'] = 'unavailable'
  let lastHeartbeatUnix = 0
  let scanGrpcAddr = ''

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      pcDaemonId = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 2 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      pcDaemonAddr = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 3 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      scannerId = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 4 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      const rawStatus = decodeUtf8(value.value).trim()
      if (rawStatus === 'available' || rawStatus === 'reserved' || rawStatus === 'unavailable') {
        status = rawStatus
      }
      offset = value.offset
      continue
    }

    if (fieldNumber === 5 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      lastHeartbeatUnix = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 6 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      scanGrpcAddr = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return {
    pc_daemon_id: pcDaemonId || '-',
    pc_daemon_addr: pcDaemonAddr || '-',
    scan_grpc_addr: scanGrpcAddr || '-',
    scanner_ids: scannerId.trim().length > 0 ? [scannerId] : [],
    status,
    last_heartbeat: formatHeartbeatFromUnix(lastHeartbeatUnix),
  }
}

function parseManagementDiagnostics(payload: Uint8Array): ManagementDiagnostics {
  let offset = 0
  const diagnostics: ProtoManagementDiagnostics = {
    node_role: '',
    generated_at_unix: 0,
    online_pc_daemon_count: 0,
    scanner_count: 0,
    available_scanner_count: 0,
    reserved_scanner_count: 0,
    active_reservation_count: 0,
    expired_reservation_count: 0,
    reservation_timeout_secs: 0,
    heartbeat_timeout_secs: 0,
  }

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      diagnostics.node_role = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (wireType === 0) {
      const value = decodeVarint(payload, offset)
      if (fieldNumber === 2) {
        diagnostics.generated_at_unix = value.value
      } else if (fieldNumber === 3) {
        diagnostics.online_pc_daemon_count = value.value
      } else if (fieldNumber === 4) {
        diagnostics.scanner_count = value.value
      } else if (fieldNumber === 5) {
        diagnostics.available_scanner_count = value.value
      } else if (fieldNumber === 6) {
        diagnostics.reserved_scanner_count = value.value
      } else if (fieldNumber === 7) {
        diagnostics.active_reservation_count = value.value
      } else if (fieldNumber === 8) {
        diagnostics.expired_reservation_count = value.value
      } else if (fieldNumber === 9) {
        diagnostics.reservation_timeout_secs = value.value
      } else if (fieldNumber === 10) {
        diagnostics.heartbeat_timeout_secs = value.value
      }

      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return diagnostics
}

function parseReservationInfo(payload: Uint8Array): ReservationInfo {
  let offset = 0
  let scannerId = ''
  let sessionId = ''
  let createdAtUnix = 0
  let lastActivityUnix = 0
  let expiresAtUnix = 0
  let isExpired = false

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
      sessionId = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (wireType === 0) {
      const value = decodeVarint(payload, offset)
      if (fieldNumber === 3) {
        createdAtUnix = value.value
      } else if (fieldNumber === 4) {
        lastActivityUnix = value.value
      } else if (fieldNumber === 5) {
        expiresAtUnix = value.value
      } else if (fieldNumber === 6) {
        isExpired = value.value !== 0
      }
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return {
    scanner_id: scannerId,
    session_id: sessionId,
    created_at_unix: createdAtUnix,
    last_activity_unix: lastActivityUnix,
    expires_at_unix: expiresAtUnix,
    is_expired: isExpired,
  }
}

function parseSupportSnapshotResponse(payload: Uint8Array): SupportSnapshot {
  let offset = 0
  let diagnostics: ManagementDiagnostics | null = null
  const daemons: PcDaemon[] = []
  const scanners: Scanner[] = []
  const reservations: ReservationInfo[] = []

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (wireType !== 2) {
      offset = skipUnknownField(payload, offset, wireType)
      continue
    }

    const value = readLengthDelimited(payload, offset)
    if (fieldNumber === 1) {
      diagnostics = parseManagementDiagnostics(value.value)
    } else if (fieldNumber === 2) {
      daemons.push(parseDaemonInfo(value.value))
    } else if (fieldNumber === 3) {
      scanners.push(parseScannerInfo(value.value))
    } else if (fieldNumber === 4) {
      reservations.push(parseReservationInfo(value.value))
    }
    offset = value.offset
  }

  return {
    diagnostics:
      diagnostics ?? {
        node_role: '',
        generated_at_unix: 0,
        online_pc_daemon_count: 0,
        scanner_count: 0,
        available_scanner_count: 0,
        reserved_scanner_count: 0,
        active_reservation_count: 0,
        expired_reservation_count: 0,
        reservation_timeout_secs: 0,
        heartbeat_timeout_secs: 0,
      },
    daemons,
    scanners,
    reservations,
  }
}

function parseResetScannerResponse(payload: Uint8Array): ResetScannerResponse {
  let offset = 0
  let reset = false
  let releasedSessionId = ''

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      reset = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 2 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      releasedSessionId = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return {
    reset,
    released_session_id: releasedSessionId,
  }
}

function parseCleanupReservationsResponse(payload: Uint8Array): CleanupReservationsResponse {
  let offset = 0
  let releasedCount = 0
  const releasedReservations: ReservationInfo[] = []

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      releasedCount = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 2 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      releasedReservations.push(parseReservationInfo(value.value))
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return {
    released_count: releasedCount,
    released_reservations: releasedReservations,
  }
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

function parseChequeMetadata(payload: Uint8Array): ProtoChequeMetadata {
  let offset = 0
  const metadata: ProtoChequeMetadata = {
    bordro_id: '',
    cheque_no: '',
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
        metadata.cheque_no = decoded
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

function parseScanChequeResponse(payload: Uint8Array): ProtoChequeMetadata {
  let offset = 0

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      return parseChequeMetadata(value.value)
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  throw new Error('scanCheque response did not include metadata')
}

function parseAnalyzeChequeImageResponse(payload: Uint8Array): ProtoChequeImageDebugResult {
  let offset = 0
  const result: ProtoChequeImageDebugResult = {
    micr_data: '',
    qr_data: '',
    micr_qr_match: false,
    effective_dpi: 0,
    image_size_bytes: 0,
    micr_ms: 0,
    qr_ms: 0,
    total_ms: 0,
  }

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      result.micr_data = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 2 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      result.qr_data = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 3 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      result.micr_qr_match = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 4 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      result.effective_dpi = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 5 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      result.image_size_bytes = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 6 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      result.micr_ms = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 7 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      result.qr_ms = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 8 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      result.total_ms = value.value
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return result
}

function parseAnalyzeChequeWithDotsMocrResponse(
  payload: Uint8Array,
): ProtoDotsMocrChequeAnalysisResult {
  let offset = 0
  const result: ProtoDotsMocrChequeAnalysisResult = {
    object_path: '',
    front_image_path: '',
    model: '',
    prompt_mode: '',
    content: '',
    raw_response_json: '',
    total_ms: 0,
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
        result.object_path = decoded
      } else if (fieldNumber === 2) {
        result.front_image_path = decoded
      } else if (fieldNumber === 3) {
        result.model = decoded
      } else if (fieldNumber === 4) {
        result.prompt_mode = decoded
      } else if (fieldNumber === 5) {
        result.content = decoded
      } else if (fieldNumber === 6) {
        result.raw_response_json = decoded
      }

      offset = value.offset
      continue
    }

    if (fieldNumber === 7 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      result.total_ms = value.value
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return result
}

function parseAnalyzeChequeWithQwenResponse(
  payload: Uint8Array,
): ProtoQwenChequeAnalysisResult {
  let offset = 0
  const result: ProtoQwenChequeAnalysisResult = {
    object_path: '',
    front_image_path: '',
    model: '',
    prompt_mode: '',
    content: '',
    raw_response_json: '',
    total_ms: 0,
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
        result.object_path = decoded
      } else if (fieldNumber === 2) {
        result.front_image_path = decoded
      } else if (fieldNumber === 3) {
        result.model = decoded
      } else if (fieldNumber === 4) {
        result.prompt_mode = decoded
      } else if (fieldNumber === 5) {
        result.content = decoded
      } else if (fieldNumber === 6) {
        result.raw_response_json = decoded
      }

      offset = value.offset
      continue
    }

    if (fieldNumber === 7 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      result.total_ms = value.value
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return result
}

function parseListChequeAnalysisModelsResponse(
  payload: Uint8Array,
): ProtoChequeAnalysisModels {
  let offset = 0
  const result: ProtoChequeAnalysisModels = {
    dots_mocr_models: [],
    qwen_models: [],
    default_dots_mocr_model: '',
    default_qwen_model: '',
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
        result.dots_mocr_models.push(decoded)
      } else if (fieldNumber === 2) {
        result.qwen_models.push(decoded)
      } else if (fieldNumber === 3) {
        result.default_dots_mocr_model = decoded
      } else if (fieldNumber === 4) {
        result.default_qwen_model = decoded
      }

      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return result
}

function parseScanAllChequeProgress(payload: Uint8Array): ProtoScanAllChequeProgress {
  let offset = 0
  let cheque: ProtoChequeMetadata | null = null
  let completedCount = 0
  let totalCount = 0

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      cheque = parseChequeMetadata(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 2 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      completedCount = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 3 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      totalCount = value.value
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return {
    cheque,
    completed_count: completedCount,
    total_count: totalCount,
  }
}

function parseGrpcWebFramesIncrementally(payload: Uint8Array): IncrementalGrpcWebFrames {
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
      break
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

  return {
    messages,
    trailerStatus,
    trailerMessage,
    remaining: payload.slice(offset),
  }
}

function parseBordroScanMetadata(payload: Uint8Array): ProtoBordroScanMetadata {
  let offset = 0
  const metadata: ProtoBordroScanMetadata = {
    bordro_id: '',
    object_path: '',
    page_count: 0,
    duplex: false,
    dpi: 0,
    color_mode: 0,
    effective_duplex: false,
    effective_dpi: 0,
    effective_color_mode: 0,
    duplex_verified: false,
    dpi_verified: false,
    color_mode_verified: false,
  }

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      metadata.bordro_id = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 2 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      metadata.object_path = decodeUtf8(value.value)
      offset = value.offset
      continue
    }

    if (fieldNumber === 3 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.page_count = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 4 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.duplex = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 5 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.dpi = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 6 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.color_mode = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 7 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.effective_duplex = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 8 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.effective_dpi = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 9 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.effective_color_mode = value.value
      offset = value.offset
      continue
    }

    if (fieldNumber === 10 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.duplex_verified = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 11 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.dpi_verified = value.value !== 0
      offset = value.offset
      continue
    }

    if (fieldNumber === 12 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.color_mode_verified = value.value !== 0
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return metadata
}

function parseScanBordroResponse(payload: Uint8Array): ProtoBordroScanMetadata {
  let offset = 0

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      return parseBordroScanMetadata(value.value)
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  throw new Error('scanBordro response did not include metadata')
}

function parseDocumentPageMetadata(payload: Uint8Array): ProtoDocumentPageMetadata {
  let offset = 0
  const metadata: ProtoDocumentPageMetadata = {
    sheet_index: 0,
    front_image_path: '',
    front_image_content_type: '',
    back_image_path: null,
    back_image_content_type: null,
  }

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 0) {
      const value = decodeVarint(payload, offset)
      metadata.sheet_index = value.value
      offset = value.offset
      continue
    }

    if (wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      const decoded = decodeUtf8(value.value)

      if (fieldNumber === 2) {
        metadata.front_image_path = decoded
      } else if (fieldNumber === 3) {
        metadata.front_image_content_type = decoded
      } else if (fieldNumber === 4) {
        metadata.back_image_path = decoded
      } else if (fieldNumber === 5) {
        metadata.back_image_content_type = decoded
      }

      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return metadata
}

function parseDocumentScanMetadata(payload: Uint8Array): ProtoDocumentScanMetadata {
  let offset = 0
  const metadata: ProtoDocumentScanMetadata = {
    document_id: '',
    document_type: 0,
    object_path: '',
    sheet_count: 0,
    page_count: 0,
    pages: [],
    duplex: false,
    dpi: 0,
    color_mode: 0,
    page_size: 0,
    effective_duplex: false,
    effective_dpi: 0,
    effective_color_mode: 0,
    duplex_verified: false,
    dpi_verified: false,
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
        metadata.document_id = decoded
      } else if (fieldNumber === 3) {
        metadata.object_path = decoded
      } else if (fieldNumber === 6) {
        metadata.pages.push(parseDocumentPageMetadata(value.value))
      }

      offset = value.offset
      continue
    }

    if (wireType === 0) {
      const value = decodeVarint(payload, offset)

      if (fieldNumber === 2) {
        metadata.document_type = value.value
      } else if (fieldNumber === 4) {
        metadata.sheet_count = value.value
      } else if (fieldNumber === 5) {
        metadata.page_count = value.value
      } else if (fieldNumber === 7) {
        metadata.duplex = value.value !== 0
      } else if (fieldNumber === 8) {
        metadata.dpi = value.value
      } else if (fieldNumber === 9) {
        metadata.color_mode = value.value
      } else if (fieldNumber === 10) {
        metadata.page_size = value.value
      } else if (fieldNumber === 11) {
        metadata.effective_duplex = value.value !== 0
      } else if (fieldNumber === 12) {
        metadata.effective_dpi = value.value
      } else if (fieldNumber === 13) {
        metadata.effective_color_mode = value.value
      } else if (fieldNumber === 14) {
        metadata.duplex_verified = value.value !== 0
      } else if (fieldNumber === 15) {
        metadata.dpi_verified = value.value !== 0
      } else if (fieldNumber === 16) {
        metadata.color_mode_verified = value.value !== 0
      }

      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  return metadata
}

function mapProtoDocumentScanMetadataToUi(metadata: ProtoDocumentScanMetadata): DocumentScanMetadata {
  return {
    document_id: metadata.document_id,
    document_type: mapProtoDocumentTypeToUi(metadata.document_type),
    object_path: metadata.object_path,
    sheet_count: metadata.sheet_count,
    page_count: metadata.page_count,
    pages: metadata.pages.map((page) => ({
      sheet_index: page.sheet_index,
      front_image_path: page.front_image_path,
      front_image_content_type: page.front_image_content_type,
      back_image_path: page.back_image_path,
      back_image_content_type: page.back_image_content_type,
    })),
    duplex: metadata.duplex,
    dpi: metadata.dpi,
    color_mode: mapProtoScanColorModeToUi(metadata.color_mode),
    page_size: mapProtoScanPageSizeToUi(metadata.page_size),
    effective_duplex: metadata.effective_duplex,
    effective_dpi: metadata.effective_dpi,
    effective_color_mode: mapProtoScanColorModeToUi(metadata.effective_color_mode),
    duplex_verified: metadata.duplex_verified,
    dpi_verified: metadata.dpi_verified,
    color_mode_verified: metadata.color_mode_verified,
  }
}

function parseScanDocumentProgress(payload: Uint8Array): DocumentScanProgress {
  let offset = 0
  let metadata: DocumentScanMetadata | null = null
  let completedSheetCount = 0
  let totalSheetCount = 0

  while (offset < payload.length) {
    const tagInfo = decodeVarint(payload, offset)
    offset = tagInfo.offset

    const fieldNumber = tagInfo.value >>> 3
    const wireType = tagInfo.value & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const value = readLengthDelimited(payload, offset)
      metadata = mapProtoDocumentScanMetadataToUi(parseDocumentScanMetadata(value.value))
      offset = value.offset
      continue
    }

    if (wireType === 0) {
      const value = decodeVarint(payload, offset)
      if (fieldNumber === 2) {
        completedSheetCount = value.value
      } else if (fieldNumber === 3) {
        totalSheetCount = value.value
      }
      offset = value.offset
      continue
    }

    offset = skipUnknownField(payload, offset, wireType)
  }

  if (metadata === null) {
    throw new Error('scanDocument progress did not include metadata')
  }

  return {
    metadata,
    completed_sheet_count: completedSheetCount,
    total_sheet_count: totalSheetCount,
  }
}

function mapProtoMetadataToUi(
  metadata: ProtoChequeMetadata,
  request: {
    scanner_id: string
    session_id: string
    bordro_id: string
    cheque_no: number
    duplex: boolean
    dpi: number
    color_mode: ScanColorMode
    page_size: ScanPageSize
  },
): ChequeMetadata {
  const parsedChequeNo = Number.parseInt(metadata.cheque_no, 10)
  const chequeNo = Number.isInteger(parsedChequeNo) && parsedChequeNo > 0
    ? parsedChequeNo
    : request.cheque_no
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
    cheque_no: chequeNo,
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
    page_size: request.page_size,
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

function mapProtoBordroScanMetadataToUi(
  metadata: ProtoBordroScanMetadata,
  requestPageSize: ScanPageSize,
): BordroScanMetadata {
  const requestedColorMode = mapProtoScanColorModeToUi(metadata.color_mode)
  const effectiveColorMode =
    metadata.effective_color_mode > 0
      ? mapProtoScanColorModeToUi(metadata.effective_color_mode)
      : requestedColorMode

  return {
    bordro_id: metadata.bordro_id,
    object_path: metadata.object_path,
    page_count: metadata.page_count > 0 ? metadata.page_count : metadata.effective_duplex ? 2 : 1,
    duplex: metadata.duplex,
    dpi: metadata.dpi,
    color_mode: requestedColorMode,
    page_size: requestPageSize,
    effective_duplex: metadata.effective_duplex,
    effective_dpi: metadata.effective_dpi > 0 ? metadata.effective_dpi : metadata.dpi,
    effective_color_mode: effectiveColorMode,
    duplex_verified: metadata.duplex_verified,
    dpi_verified: metadata.dpi_verified,
    color_mode_verified: metadata.color_mode_verified,
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
    trimmed.endsWith(FRONT_IMAGE_PNG_FILE_NAME) ||
    trimmed.endsWith(BACK_IMAGE_PNG_FILE_NAME) ||
    trimmed.endsWith(FRONT_IMAGE_LEGACY_FILE_NAME) ||
    trimmed.endsWith(BACK_IMAGE_LEGACY_FILE_NAME) ||
    trimmed.endsWith(CHEQUE_METADATA_FILE_NAME)
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

async function callGrpcWebServerStreamingLive(
  method: string,
  path: string,
  encodedRequest: Uint8Array,
  onMessage: (message: Uint8Array) => Promise<void> | void,
): Promise<void> {
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

  if (response.body === null) {
    const responseBody = new Uint8Array(await response.arrayBuffer())
    const parsed = parseGrpcWebFrames(responseBody)
    for (const message of parsed.messages) {
      await onMessage(message)
    }

    const grpcStatus = parsed.trailerStatus ?? response.headers.get('grpc-status')
    const grpcMessage =
      parsed.trailerMessage ?? decodeGrpcMessage(response.headers.get('grpc-message'))

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
    return
  }

  const reader = response.body.getReader()
  let buffered = new Uint8Array()
  let trailerStatus: string | null = null
  let trailerMessage: string | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffered = new Uint8Array(concatBytes(value ? [buffered, value] : [buffered]))
    const parsed = parseGrpcWebFramesIncrementally(buffered)
    buffered = new Uint8Array(parsed.remaining)
    trailerStatus = parsed.trailerStatus ?? trailerStatus
    trailerMessage = parsed.trailerMessage ?? trailerMessage

    for (const message of parsed.messages) {
      await onMessage(message)
    }
  }

  if (buffered.length > 0) {
    throw new Error(`${method} failed: incomplete gRPC-Web stream payload`)
  }

  const grpcStatus = trailerStatus ?? response.headers.get('grpc-status')
  const grpcMessage = trailerMessage ?? decodeGrpcMessage(response.headers.get('grpc-message'))

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
}

function encodeHealthChequeRequest(service: string): Uint8Array {
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

function encodeResetScannerRequest(
  scanner_id: string,
  session_id: string,
  force: boolean,
): Uint8Array {
  return concatBytes([
    encodeStringField(1, scanner_id),
    encodeStringField(2, session_id),
    encodeBoolField(3, force),
  ])
}

function encodeCleanupReservationsRequest(releaseAll: boolean): Uint8Array {
  return encodeBoolField(1, releaseAll)
}

function encodeCreateBordroRequest(params: CreateBordroRequest): Uint8Array {
  return concatBytes([
    encodeInt32Field(1, params.cheque_count),
    encodeStringField(2, params.cheque_type),
    encodeStringField(3, params.bordro_amount),
    encodeStringField(4, params.account_no),
    encodeStringField(5, params.customer_name),
    encodeStringField(6, params.account_branch),
    encodeStringField(7, params.currency),
  ])
}

function encodeAnalyzeChequeImageRequest(params: {
  image: Uint8Array
  dpi: number
}): Uint8Array {
  return concatBytes([
    encodeBytesField(1, params.image),
    encodeInt32Field(2, params.dpi),
  ])
}

function encodeAnalyzeChequeWithDotsMocrRequest(params: {
  object_path?: string
  image?: Uint8Array
  image_mime_type?: string
  model_override?: string
}): Uint8Array {
  const fields: Uint8Array[] = []

  if (params.object_path && params.object_path.trim().length > 0) {
    fields.push(encodeStringField(1, params.object_path))
  }

  if (params.image && params.image.length > 0) {
    fields.push(encodeBytesField(2, params.image))
  }

  if (params.image_mime_type && params.image_mime_type.trim().length > 0) {
    fields.push(encodeStringField(3, params.image_mime_type))
  }

  if (params.model_override && params.model_override.trim().length > 0) {
    fields.push(encodeStringField(4, params.model_override))
  }

  return concatBytes(fields)
}

function encodeScanChequeRequest(params: {
  scanner_id: string
  session_id: string
  bordro_id: string
  cheque_no: number
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
}): Uint8Array {
  const scanOptions = encodeScanChequeOptionsFields({
    duplex: params.duplex,
    dpi: params.dpi,
    color_mode: params.color_mode,
    page_size: params.page_size,
  })
  return concatBytes([
    encodeStringField(1, params.scanner_id),
    encodeStringField(2, params.session_id),
    encodeStringField(3, params.bordro_id),
    encodeStringField(4, params.cheque_no.toString()),
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
  page_size: ScanPageSize
}): Uint8Array {
  const scanOptions = encodeScanBordroOptionsFields({
    duplex: params.duplex,
    dpi: params.dpi,
    color_mode: params.color_mode,
    page_size: params.page_size,
  })
  return concatBytes([
    encodeStringField(1, params.scanner_id),
    encodeStringField(2, params.session_id),
    encodeStringField(3, params.bordro_id),
    ...scanOptions,
  ])
}

function encodeScanDocumentRequest(params: {
  scanner_id: string
  session_id: string
  document_id: string
  document_type: DocumentType
  sheet_count: number
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
}): Uint8Array {
  return concatBytes([
    encodeStringField(1, params.scanner_id),
    encodeStringField(2, params.session_id),
    encodeStringField(3, params.document_id),
    encodeInt32Field(4, mapDocumentTypeToProto(params.document_type)),
    encodeInt32Field(5, params.sheet_count),
    encodeBoolField(6, params.duplex),
    encodeInt32Field(7, params.dpi),
    encodeInt32Field(8, mapScanColorModeToProto(params.color_mode)),
    encodeInt32Field(9, mapScanPageSizeToProto(params.page_size)),
  ])
}

function encodeScanChequeOptionsFields(params: {
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
}): Uint8Array[] {
  const duplex = params.duplex === true
  return [
    encodeBoolField(7, duplex),
    encodeInt32Field(8, params.dpi),
    encodeInt32Field(9, mapScanColorModeToProto(params.color_mode)),
    encodeInt32Field(10, mapScanPageSizeToProto(params.page_size)),
  ]
}

type ProtoBordroScanMetadata = {
  bordro_id: string
  object_path: string
  page_count: number
  duplex: boolean
  dpi: number
  color_mode: number
  effective_duplex: boolean
  effective_dpi: number
  effective_color_mode: number
  duplex_verified: boolean
  dpi_verified: boolean
  color_mode_verified: boolean
}

type ProtoScanAllChequeProgress = {
  cheque: ProtoChequeMetadata | null
  completed_count: number
  total_count: number
}

function encodeScanBordroOptionsFields(params: {
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
}): Uint8Array[] {
  const duplex = params.duplex === true
  return [
    encodeBoolField(4, duplex),
    encodeInt32Field(5, params.dpi),
    encodeInt32Field(6, mapScanColorModeToProto(params.color_mode)),
    encodeInt32Field(7, mapScanPageSizeToProto(params.page_size)),
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

export async function getDiagnostics(): Promise<ManagementDiagnostics> {
  const response = await callGrpcWebUnary(
    'getDiagnostics',
    GET_DIAGNOSTICS_PATH,
    new Uint8Array(),
  )

  return parseManagementDiagnostics(response)
}

export async function getSupportSnapshot(): Promise<SupportSnapshot> {
  const response = await callGrpcWebUnary(
    'getSupportSnapshot',
    GET_SUPPORT_SNAPSHOT_PATH,
    new Uint8Array(),
  )

  return parseSupportSnapshotResponse(response)
}

export function getBranchDaemonBaseUrl(): string {
  return BASE_URL
}

export async function chequeHealth(): Promise<boolean> {
  try {
    await callGrpcWebUnary(
      'chequeHealth',
      HEALTH_CHECK_PATH,
      encodeHealthChequeRequest(''),
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

export async function resetScanner(params: {
  scanner_id: string
  session_id: string
  force?: boolean
}): Promise<ResetScannerResponse> {
  const response = await callGrpcWebUnary(
    'resetScanner',
    RESET_SCANNER_PATH,
    encodeResetScannerRequest(params.scanner_id, params.session_id, params.force === true),
  )

  return parseResetScannerResponse(response)
}

export async function cleanupReservations(
  releaseAll: boolean,
): Promise<CleanupReservationsResponse> {
  const response = await callGrpcWebUnary(
    'cleanupReservations',
    CLEANUP_RESERVATIONS_PATH,
    encodeCleanupReservationsRequest(releaseAll),
  )

  return parseCleanupReservationsResponse(response)
}

export async function createBordro(request: CreateBordroRequest): Promise<{ bordro_id: string }> {
  const response = await callGrpcWebUnary(
    'createBordro',
    CREATE_BORDRO_PATH,
    encodeCreateBordroRequest(request),
  )

  return parseCreateBordroResponse(response)
}

export async function listChequeAnalysisModels(): Promise<ChequeAnalysisModels> {
  const response = await callGrpcWebUnary(
    'listChequeAnalysisModels',
    LIST_CHEQUE_ANALYSIS_MODELS_PATH,
    new Uint8Array(),
  )

  const result = parseListChequeAnalysisModelsResponse(response)
  return {
    dots_mocr_models: result.dots_mocr_models,
    qwen_models: result.qwen_models,
    default_dots_mocr_model: result.default_dots_mocr_model,
    default_qwen_model: result.default_qwen_model,
  }
}

export async function analyzeChequeImage(params: {
  image: Uint8Array
  dpi: number
}): Promise<ChequeImageDebugResult> {
  const response = await callGrpcWebUnary(
    'analyzeChequeImage',
    ANALYZE_CHEQUE_IMAGE_PATH,
    encodeAnalyzeChequeImageRequest(params),
  )

  const result = parseAnalyzeChequeImageResponse(response)
  return {
    micr_data: result.micr_data,
    qr_data: result.qr_data,
    micr_qr_match: result.micr_qr_match,
    effective_dpi: result.effective_dpi,
    image_size_bytes: result.image_size_bytes,
    micr_ms: result.micr_ms,
    qr_ms: result.qr_ms,
    total_ms: result.total_ms,
  }
}

export async function analyzeChequeWithDotsMocr(params: {
  object_path: string
  model_override?: string
}): Promise<DotsMocrChequeAnalysisResult> {
  const response = await callGrpcWebUnary(
    'analyzeChequeWithDotsMocr',
    ANALYZE_CHEQUE_WITH_DOTS_MOCR_PATH,
    encodeAnalyzeChequeWithDotsMocrRequest(params),
  )

  const result = parseAnalyzeChequeWithDotsMocrResponse(response)
  return {
    object_path: result.object_path,
    front_image_path: result.front_image_path,
    model: result.model,
    prompt_mode: result.prompt_mode,
    content: result.content,
    raw_response_json: result.raw_response_json,
    total_ms: result.total_ms,
  }
}

export async function analyzeUploadedChequeWithDotsMocr(params: {
  image: Uint8Array
  image_mime_type?: string
  model_override?: string
}): Promise<DotsMocrChequeAnalysisResult> {
  const response = await callGrpcWebUnary(
    'analyzeUploadedChequeWithDotsMocr',
    ANALYZE_CHEQUE_WITH_DOTS_MOCR_PATH,
    encodeAnalyzeChequeWithDotsMocrRequest(params),
  )

  const result = parseAnalyzeChequeWithDotsMocrResponse(response)
  return {
    object_path: result.object_path,
    front_image_path: result.front_image_path,
    model: result.model,
    prompt_mode: result.prompt_mode,
    content: result.content,
    raw_response_json: result.raw_response_json,
    total_ms: result.total_ms,
  }
}

export async function analyzeUploadedChequeWithQwen(params: {
  image: Uint8Array
  image_mime_type?: string
  model_override?: string
}): Promise<QwenChequeAnalysisResult> {
  const response = await callGrpcWebUnary(
    'analyzeUploadedChequeWithQwen',
    ANALYZE_CHEQUE_WITH_QWEN_PATH,
    encodeAnalyzeChequeWithDotsMocrRequest(params),
  )

  const result = parseAnalyzeChequeWithQwenResponse(response)
  return {
    object_path: result.object_path,
    front_image_path: result.front_image_path,
    model: result.model,
    prompt_mode: result.prompt_mode,
    content: result.content,
    raw_response_json: result.raw_response_json,
    total_ms: result.total_ms,
  }
}

export async function scanCheque(params: {
  scanner_id: string
  session_id: string
  bordro_id: string
  cheque_no: number
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
}): Promise<ChequeMetadata> {
  const response = await callGrpcWebUnary(
    'scanCheque',
    SCAN_CHEQUE_PATH,
    encodeScanChequeRequest(params),
  )

  const metadata = parseScanChequeResponse(response)
  return mapProtoMetadataToUi(metadata, params)
}

export async function scanAllCheque(params: {
  scanner_id: string
  session_id: string
  bordro_id: string
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
}): Promise<ChequeMetadata[]> {
  const cheques: ChequeMetadata[] = []

  await scanAllChequeStream({
    ...params,
    onProgress(progress) {
      cheques.push(progress.cheque)
    },
  })

  return [...cheques].sort((left, right) => left.cheque_no - right.cheque_no)
}

export async function scanAllChequeStream(params: {
  scanner_id: string
  session_id: string
  bordro_id: string
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
  onProgress?: (progress: ScanAllChequeProgress) => Promise<void> | void
}): Promise<void> {
  await callGrpcWebServerStreamingLive(
    'scanAllCheque',
    SCAN_ALL_CHEQUE_PATH,
    encodeScanBordroRequest(params),
    async (message) => {
      const progress = parseScanAllChequeProgress(message)
      if (progress.cheque === null) {
        return
      }

      const mappedCheque = mapProtoMetadataToUi(progress.cheque, {
        scanner_id: params.scanner_id,
        session_id: params.session_id,
        bordro_id: params.bordro_id,
        cheque_no:
          Number.parseInt(progress.cheque.cheque_no, 10) || progress.completed_count || 1,
        duplex: params.duplex,
        dpi: params.dpi,
        color_mode: params.color_mode,
        page_size: params.page_size,
      })

      await params.onProgress?.({
        cheque: mappedCheque,
        completed_count: progress.completed_count,
        total_count: progress.total_count,
      })
    },
  )
}

export async function scanBordro(params: {
  scanner_id: string
  session_id: string
  bordro_id: string
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
}): Promise<BordroScanMetadata> {
  const response = await callGrpcWebUnary(
    'scanBordro',
    SCAN_BORDRO_PATH,
    encodeScanBordroRequest(params),
  )

  return mapProtoBordroScanMetadataToUi(parseScanBordroResponse(response), params.page_size)
}

export async function scanDocument(params: {
  scanner_id: string
  session_id: string
  document_id: string
  document_type: DocumentType
  sheet_count: number
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
}): Promise<DocumentScanMetadata> {
  let latestMetadata: DocumentScanMetadata | null = null

  await scanDocumentStream({
    ...params,
    onProgress: async (progress) => {
      latestMetadata = progress.metadata
    },
  })

  if (latestMetadata === null) {
    throw new Error('scanDocument stream did not include metadata')
  }

  return latestMetadata
}

export async function scanDocumentStream(params: {
  scanner_id: string
  session_id: string
  document_id: string
  document_type: DocumentType
  sheet_count: number
  duplex: boolean
  dpi: number
  color_mode: ScanColorMode
  page_size: ScanPageSize
  onProgress?: (progress: DocumentScanProgress) => Promise<void> | void
}): Promise<void> {
  await callGrpcWebServerStreamingLive(
    'scanDocument',
    SCAN_DOCUMENT_PATH,
    encodeScanDocumentRequest(params),
    async (message) => {
      const progress = parseScanDocumentProgress(message)
      await params.onProgress?.(progress)
    },
  )
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
  const frontJpeg = findObjectPathBySuffix(paths, FRONT_IMAGE_FILE_NAME)
  const frontPng = findObjectPathBySuffix(paths, FRONT_IMAGE_PNG_FILE_NAME)
  const frontLegacy = findObjectPathBySuffix(paths, FRONT_IMAGE_LEGACY_FILE_NAME)
  const backJpeg = findObjectPathBySuffix(paths, BACK_IMAGE_FILE_NAME)
  const backPng = findObjectPathBySuffix(paths, BACK_IMAGE_PNG_FILE_NAME)
  const backLegacy = findObjectPathBySuffix(paths, BACK_IMAGE_LEGACY_FILE_NAME)

  return {
    front_path: frontJpeg ?? frontPng ?? frontLegacy,
    front_is_png: frontPng !== null && frontJpeg === null,
    back_path: backJpeg ?? backPng ?? backLegacy,
    back_is_png: backPng !== null && backJpeg === null,
    metadata_path: findObjectPathBySuffix(paths, CHEQUE_METADATA_FILE_NAME),
  }
}
