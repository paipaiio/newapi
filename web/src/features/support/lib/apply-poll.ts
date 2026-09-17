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
import type { SupportMessage, SupportPollItem } from '../types'

export function cursorToQuery(cursor: string | number | null | undefined): string {
  if (cursor == null || cursor === '') return ''
  return String(cursor)
}

export function applySupportPoll(
  current: SupportMessage[],
  items: SupportPollItem[] | undefined,
  nextCursor: string | number | null | undefined
): { messages: SupportMessage[]; cursor: string; hiddenIds: string[] } {
  const hiddenIds: string[] = []
  const incoming: SupportMessage[] = []

  for (const item of items ?? []) {
    if (item.event === 'message_hidden' && item.target_message_id) {
      hiddenIds.push(item.target_message_id)
      continue
    }
    if (item.visible === false && item.id) {
      hiddenIds.push(item.id)
      continue
    }
    if (
      item.id &&
      (item.direction === 'customer' || item.direction === 'staff')
    ) {
      incoming.push({
        id: item.id,
        direction: item.direction,
        text: item.text ?? '',
        created_at: item.created_at,
        staff_name: item.staff_name,
        reply_to_message_id: item.reply_to_message_id,
      })
    }
  }

  const hidden = new Set(hiddenIds)
  const ordered: SupportMessage[] = []
  const seen = new Set<string>()

  for (const message of current) {
    if (hidden.has(message.id) || seen.has(message.id)) continue
    const updated = incoming.find((item) => item.id === message.id) ?? message
    ordered.push(updated)
    seen.add(message.id)
  }
  for (const message of incoming) {
    if (hidden.has(message.id) || seen.has(message.id)) continue
    ordered.push(message)
    seen.add(message.id)
  }

  const cursor = cursorToQuery(nextCursor)
  return { messages: ordered, cursor, hiddenIds }
}

export function findQuotedMessage(
  messages: SupportMessage[],
  replyToMessageId?: string
): SupportMessage | undefined {
  if (!replyToMessageId) return undefined
  return messages.find((message) => message.id === replyToMessageId)
}
