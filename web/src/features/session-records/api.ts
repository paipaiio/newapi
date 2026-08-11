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
import { api } from '@/lib/api'

import type {
  ApiResponse,
  BackfillResult,
  GetConversationGroupsParams,
  GetConversationGroupsResponse,
  GetSessionAttachmentResponse,
  GetSessionLogResponse,
  GetSessionLogsParams,
  GetSessionLogsResponse,
} from './types'

/**
 * Fetch a paginated list of session logs (admin only).
 */
export async function getSessionLogs(
  params: GetSessionLogsParams = {}
): Promise<GetSessionLogsResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('p', String(params.p ?? 1))
  queryParams.set('page_size', String(params.page_size ?? 20))

  if (params.user_id) queryParams.set('user_id', params.user_id)
  if (params.username) queryParams.set('username', params.username)
  if (params.model_name) queryParams.set('model_name', params.model_name)
  if (params.request_id) queryParams.set('request_id', params.request_id)
  if (params.keyword) queryParams.set('keyword', params.keyword)
  if (params.only_failed) queryParams.set('only_failed', 'true')
  if (params.only_media) queryParams.set('only_media', 'true')
  if (params.start_timestamp !== undefined) {
    queryParams.set('start_timestamp', String(params.start_timestamp))
  }
  if (params.end_timestamp !== undefined) {
    queryParams.set('end_timestamp', String(params.end_timestamp))
  }

  const res = await api.get(`/api/session_log/?${queryParams.toString()}`)
  return res.data
}

/**
 * Fetch a single session log with its stored body content.
 */
export async function getSessionLog(
  id: number
): Promise<GetSessionLogResponse> {
  const res = await api.get(`/api/session_log/${id}`)
  return res.data
}

/**
 * Fetch a paginated list of aggregated conversation groups (admin only).
 */
export async function getConversationGroups(
  params: GetConversationGroupsParams = {}
): Promise<GetConversationGroupsResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('p', String(params.p ?? 1))
  queryParams.set('page_size', String(params.page_size ?? 20))

  if (params.username) queryParams.set('username', params.username)
  if (params.model_name) queryParams.set('model_name', params.model_name)
  if (params.date_from) queryParams.set('date_from', params.date_from)
  if (params.date_to) queryParams.set('date_to', params.date_to)

  const res = await api.get(`/api/session_log/groups?${queryParams.toString()}`)
  return res.data
}

/**
 * Trigger conversation organization for a given date (defaults to yesterday
 * on the backend when omitted).
 */
export async function triggerSessionOrganize(
  date?: string
): Promise<ApiResponse<null>> {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  const res = await api.post(`/api/session_log/organize${query}`)
  return res.data
}

/**
 * Backfill searchable content_text + conversation_key for legacy records.
 */
export async function backfillSessionContent(
  limit = 2000
): Promise<ApiResponse<BackfillResult>> {
  const res = await api.post(`/api/session_log/backfill_content?limit=${limit}`)
  return res.data
}

/**
 * Fetch a media attachment (image/file) stored under attachments/ in R2,
 * returned as base64 for inline preview.
 */
export async function getSessionAttachment(
  key: string
): Promise<GetSessionAttachmentResponse> {
  const res = await api.get(
    `/api/session_log/attachment?key=${encodeURIComponent(key)}`
  )
  return res.data
}

/**
 * Read whether new session records are redacted (PII/secrets masked) before
 * storage. Backed by the `storage_setting.redact_stored` option.
 */
export async function getRedactStored(): Promise<boolean> {
  const res = await api.get('/api/option/')
  if (!res.data?.success) return false
  const opt = ((res.data.data || []) as { key: string; value: string }[]).find(
    (o) => o.key === 'storage_setting.redact_stored'
  )
  return opt?.value === 'true'
}

/** Toggle the store-time redaction option (affects new records only). */
export async function setRedactStored(enabled: boolean): Promise<boolean> {
  const res = await api.put('/api/option/', {
    key: 'storage_setting.redact_stored',
    value: String(enabled),
  })
  return !!res.data?.success
}
