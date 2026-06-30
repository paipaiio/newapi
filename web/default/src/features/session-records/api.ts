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
  if (params.only_failed) queryParams.set('only_failed', 'true')
  if (params.start_timestamp !== undefined)
    {queryParams.set('start_timestamp', String(params.start_timestamp))}
  if (params.end_timestamp !== undefined)
    {queryParams.set('end_timestamp', String(params.end_timestamp))}

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
