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
import { describe, expect, test } from 'vitest'

import {
  applySupportPoll,
  cursorToQuery,
  findQuotedMessage,
} from './apply-poll'

describe('support poll reducer', () => {
  test('keeps the cursor from meta.next_cursor for incremental polling', () => {
    const first = applySupportPoll(
      [],
      [{ id: 'wm_1', direction: 'customer', text: 'hello' }],
      1
    )
    expect(first.cursor).toBe('1')
    expect(cursorToQuery(first.cursor)).toBe('1')

    const second = applySupportPoll(
      first.messages,
      [
        {
          id: 'wm_2',
          direction: 'staff',
          text: 'hi',
          staff_name: 'Desk',
          reply_to_message_id: 'wm_1',
        },
      ],
      2
    )
    expect(second.cursor).toBe('2')
    expect(second.messages).toHaveLength(2)
    expect(findQuotedMessage(second.messages, 'wm_1')?.text).toBe('hello')
  })

  test('removes the target message when event=message_hidden', () => {
    const seeded = applySupportPoll(
      [],
      [
        { id: 'wm_1', direction: 'customer', text: 'keep' },
        { id: 'wm_hidden', direction: 'staff', text: 'secret', staff_name: 'Desk' },
      ],
      '1'
    )
    const next = applySupportPoll(
      seeded.messages,
      [{ event: 'message_hidden', target_message_id: 'wm_hidden' }],
      '2'
    )
    expect(next.hiddenIds).toEqual(['wm_hidden'])
    expect(next.messages.map((message) => message.id)).toEqual(['wm_1'])
  })

  test('drops messages marked visible=false', () => {
    const result = applySupportPoll(
      [{ id: 'wm_old', direction: 'customer', text: 'old' }],
      [{ id: 'wm_old', direction: 'customer', text: 'old', visible: false }],
      '3'
    )
    expect(result.messages).toHaveLength(0)
  })
})
