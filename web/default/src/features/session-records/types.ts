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
  only_failed?: boolean
  start_timestamp?: number
  end_timestamp?: number
}

export type GetSessionLogsResponse = ApiResponse<{
  items: SessionLog[]
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
