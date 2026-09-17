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
  SupportApiResponse,
  SupportConversationData,
  SupportMessageListData,
  SupportPollItem,
} from './types'

const silentConfig = {
  skipErrorHandler: true,
  skipBusinessError: true,
  disableDuplicate: true,
}

export async function createSupportConversation(
  pageUrl: string
): Promise<SupportApiResponse<SupportConversationData>> {
  const res = await api.post(
    '/api/support/conversations',
    { page_url: pageUrl },
    silentConfig
  )
  return res.data
}

export async function sendSupportMessage(
  conversationId: string,
  text: string,
  replyToMessageId?: string
): Promise<SupportApiResponse<SupportPollItem>> {
  const res = await api.post(
    `/api/support/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      text,
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    },
    silentConfig
  )
  return res.data
}

export async function listSupportMessages(
  conversationId: string,
  after?: string,
  limit = 50
): Promise<SupportApiResponse<SupportMessageListData>> {
  const res = await api.get(
    `/api/support/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      ...silentConfig,
      params: {
        limit,
        ...(after ? { after } : {}),
      },
    }
  )
  return res.data
}

export function supportRetryAfterSeconds(error: unknown): number {
  if (!error || typeof error !== 'object') return 0
  const axiosError = error as {
    response?: {
      headers?: Record<string, string>
      data?: { retry_after?: number }
    }
  }
  const header = axiosError.response?.headers?.['retry-after']
  const parsedHeader = header ? Number.parseInt(header, 10) : 0
  if (Number.isFinite(parsedHeader) && parsedHeader > 0) return parsedHeader
  const body = axiosError.response?.data?.retry_after
  if (typeof body === 'number' && body > 0) return body
  return 0
}
