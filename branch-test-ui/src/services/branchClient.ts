import type { CheckMetadata, CreateBordroRequest, Scanner } from '../types'

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

const FRONT_IMAGE_FILE_NAME = 'front.bin'
const BACK_IMAGE_FILE_NAME = 'back.bin'

const LIST_SCANNERS_PATH = '/daemon.scan.ScanService/ListScanners'
const RESERVE_SCANNER_PATH = '/daemon.scan.ScanService/ReserveScanner'
const RELEASE_SCANNER_PATH = '/daemon.scan.ScanService/ReleaseScanner'
const CREATE_BORDRO_PATH = '/daemon.check.CheckService/CreateBordro'
const SCAN_CHECK_PATH = '/daemon.check.CheckService/ScanCheck'
const HEALTH_CHECK_PATH = '/grpc.health.v1.Health/Check'

type ProtoCheckMetadata = {
  bordro_id: string
  check_no: string
  micr_data: string
  qr_data: string
  object_path: string
}

type PcDaemonStatus = 'available' | 'reserved' | 'unavailable'

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

type ParsedGrpcWebResponse = {
  message: Uint8Array | null
  trailerStatus: string | null
  trailerMessage: string | null
}

function parseGrpcWebResponse(payload: Uint8Array): ParsedGrpcWebResponse {
  let offset = 0
  let message: Uint8Array | null = null
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
    } else if (message === null) {
      message = framePayload
    }

    offset = frameEnd
  }

  if (offset !== payload.length) {
    throw new Error('invalid gRPC-Web payload')
  }

  return {
    message,
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
  }

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
    }

    offset = value.offset
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

function buildObjectChildPath(objectPath: string, fileName: string): string {
  if (objectPath.trim().length === 0) {
    return ''
  }

  return `${objectPath.replace(/\/+$/u, '')}/${fileName}`
}

function mapProtoMetadataToUi(
  metadata: ProtoCheckMetadata,
  request: {
    scanner_id: string
    session_id: string
    bordro_id: string
    check_no: number
  },
): CheckMetadata {
  const parsedCheckNo = Number.parseInt(metadata.check_no, 10)
  const checkNo = Number.isInteger(parsedCheckNo) && parsedCheckNo > 0
    ? parsedCheckNo
    : request.check_no

  return {
    object_path: metadata.object_path,
    scanner_id: request.scanner_id,
    session_id: request.session_id,
    bordro_id: metadata.bordro_id || request.bordro_id,
    check_no: checkNo,
    micr: metadata.micr_data,
    qr: metadata.qr_data,
    front_path: buildObjectChildPath(metadata.object_path, FRONT_IMAGE_FILE_NAME),
    back_path: buildObjectChildPath(metadata.object_path, BACK_IMAGE_FILE_NAME),
  }
}

async function callGrpcWebUnary(
  method: string,
  path: string,
  encodedRequest: Uint8Array,
): Promise<Uint8Array> {
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
  const parsed = parseGrpcWebResponse(responseBody)

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

  return parsed.message ?? new Uint8Array()
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
}): Uint8Array {
  return concatBytes([
    encodeStringField(1, params.scanner_id),
    encodeStringField(2, params.session_id),
    encodeStringField(3, params.bordro_id),
    encodeStringField(4, params.check_no.toString()),
  ])
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
}): Promise<CheckMetadata> {
  const response = await callGrpcWebUnary(
    'scanCheck',
    SCAN_CHECK_PATH,
    encodeScanCheckRequest(params),
  )

  const metadata = parseScanCheckResponse(response)
  return mapProtoMetadataToUi(metadata, params)
}
