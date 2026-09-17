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
export type ContentSafetyEvent = {
  id: number
  created_at: number
  user_id: number
  username: string
  token_name: string
  model_name: string
  group: string
  request_id: string
  channel_id: number
  policy: string
  phase: string
  mode: string
  action: string
  source: string
  category: string
  categories: string
  safety: string
  score: number
  matched: string
  snippet: string
  review_status: string
  review_note: string
  reviewed_by: number
  reviewed_at: number
}

export type ContentSafetyStats = {
  pending: number
  blocked: number
  review: number
}

export type GetContentSafetyEventsParams = {
  p?: number
  page_size?: number
  user_id?: string
  username?: string
  model_name?: string
  request_id?: string
  policy?: string
  action?: string
  category?: string
  review_status?: string
  start_timestamp?: number
  end_timestamp?: number
}

export type ApiResponse<T> = {
  success: boolean
  message?: string
  data?: T
}

export type GetContentSafetyEventsResponse = ApiResponse<{
  items: ContentSafetyEvent[]
  total: number
  page: number
}>
