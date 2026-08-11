/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
// ============================================================================
// Session Log Schema & Types
// ============================================================================

/** A single session-log record (mirrors backend model.SessionLog json tags). */
export type SessionLog = {
  id: number
  created_at: number
  user_id: number
  username: string
  token_name: string
  model_name: string
  group: string
  channel_id: number
  request_id: string
  prompt_tokens: number
  completion_tokens: number
  quota: number
  use_time: number
  is_stream: boolean
  status_code: number
  is_success: boolean
  ip: string
  object_key: string
  object_size: number
  content_text?: string
  has_media?: boolean
  redacted?: boolean
}

/** A daily-aggregated conversation record (mirrors backend model.ConversationGroup). */
export type ConversationGroup = {
  id: number
  date: string
  group_key: string
  user_id: number
  username: string
  model_name: string
  turn_count: number
  prompt_tokens: number
  completion_tokens: number
  started_at: number
  ended_at: number
  created_at: number
  object_key: string
  last_session_id: number
}

/** Generic API envelope. */
export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface GetSessionLogsParams {
  p?: number
  page_size?: number
  user_id?: string
  username?: string
  model_name?: string
  request_id?: string
  keyword?: string
  only_failed?: boolean
  only_media?: boolean
  start_timestamp?: number
  end_timestamp?: number
}

export type GetSessionLogsResponse = ApiResponse<{
  items: SessionLog[]
  total: number
  page: number
}>

export interface GetConversationGroupsParams {
  p?: number
  page_size?: number
  username?: string
  model_name?: string
  date_from?: string
  date_to?: string
}

export type GetConversationGroupsResponse = ApiResponse<{
  items: ConversationGroup[]
  total: number
  page: number
}>

/**
 * Parsed payload contained in the detail response `content` string. The
 * backend stores `request` as either an object or a string, so consumers must
 * handle both shapes.
 */
export type SessionLogPayload = {
  request_id: string
  created_at: number
  user_id: number
  username: string
  model_name: string
  group: string
  is_stream: boolean
  status_code: number
  is_success: boolean
  request?: unknown
  response?: string
  error?: string
}

export type SessionLogDetail = {
  meta: SessionLog
  content: string
}

export type GetSessionLogResponse = ApiResponse<SessionLogDetail>

export type BackfillResult = {
  scanned: number
  updated: number
  skipped: number
  failed: number
}

export type GetSessionAttachmentResponse = ApiResponse<{
  base64: string
  media_type: string
  r2_key: string
}>

// ============================================================================
// Conversation block model (parsed from the stored request/response bodies)
// ============================================================================

export type ConversationBlockKind =
  | 'real-user'
  | 'real-assistant'
  | 'thinking'
  | 'tool-call'
  | 'web-search'
  | 'tool-result'
  | 'image-block'
  | 'file-block'
  | 'system-reminder'
  | 'system-note'
  | 'system-prompt'
  | 'error'

export interface ConversationBlock {
  kind: ConversationBlockKind
  text?: string
  /** assistant final reply (rendered with a distinct avatar). */
  final?: boolean
  /** tool-call / web-search */
  name?: string
  input?: unknown
  query?: string
  /** tool-result */
  isError?: boolean
  /** image-block */
  dataUrl?: string | null
  r2Key?: string | null
  mediaType?: string
  /** file-block */
  title?: string
  mimeType?: string
}
