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
export type SupportDirection = 'customer' | 'staff'

export type SupportPollItem = {
  id?: string
  conversation_id?: string
  sequence?: number
  direction?: SupportDirection | string
  text?: string
  visible?: boolean
  created_at?: string
  staff_name?: string
  reply_to_message_id?: string
  event?: string
  target_message_id?: string
}

export type SupportMessage = {
  id: string
  direction: SupportDirection
  text: string
  created_at?: string
  staff_name?: string
  reply_to_message_id?: string
}

export type SupportApiResponse<T> = {
  success: boolean
  code?: string
  message?: string
  retry_after?: number
  data?: T
}

export type SupportConversationData = {
  conversation_id: string
}

export type SupportMessageListData = {
  items: SupportPollItem[]
  next_cursor?: string | number | null
}
