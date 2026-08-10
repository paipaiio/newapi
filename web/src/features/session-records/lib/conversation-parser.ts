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
/**
 * Parses the stored request/response bodies of a session log into an ordered
 * list of conversation blocks (system prompt, user/assistant bubbles, thinking,
 * tool calls, tool results, images, files, injected system reminders, errors).
 *
 * Framework-agnostic: returns plain data consumed by the detail dialog. Ported
 * from the classic SessionLog page to preserve identical parsing behaviour.
 */
import type { ConversationBlock } from '../types'

export function stringifyContent(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

// Identify "web search"-style tools so they render distinctly from plain tools.
const WEB_SEARCH_TOOLS =
  /(web[_-]?search|web[_-]?fetch|brave[_-]?search|google[_-]?search|bing[_-]?search|tavily|serp(api)?|search[_-]?web|browse|fetch[_-]?url|url[_-]?fetch|http[_-]?request)/i

function isWebSearchTool(name: string | undefined): boolean {
  return WEB_SEARCH_TOOLS.test(name || '')
}

// Extract a preview query/URL from a tool input for the collapsed label.
function searchQueryOf(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const obj = input as Record<string, unknown>
  const v =
    obj.query ??
    obj.q ??
    obj.search_query ??
    obj.queries ??
    obj.url ??
    obj.input ??
    obj.text
  if (v == null) return ''
  return typeof v === 'string' ? v : stringifyContent(v)
}

type ReminderSegment = { kind: 'text' | 'system-reminder'; text: string }

// Split <system-reminder>...</system-reminder> injection blocks out of text.
function splitSystemReminders(text: string): ReminderSegment[] {
  if (!text || !text.includes('<system-reminder>')) {
    return [{ kind: 'text', text }]
  }
  const out: ReminderSegment[] = []
  const re = /<system-reminder>([\s\S]*?)<\/system-reminder>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const seg = text.slice(last, m.index).trim()
      if (seg) out.push({ kind: 'text', text: seg })
    }
    out.push({ kind: 'system-reminder', text: m[1].trim() })
    last = re.lastIndex
  }
  if (last < text.length) {
    const seg = text.slice(last).trim()
    if (seg) out.push({ kind: 'text', text: seg })
  }
  return out
}

// Parse a single message's content into ordered blocks.
function parseMessageBlocks(
  role: string,
  content: unknown
): ConversationBlock[] {
  const blocks: ConversationBlock[] = []
  const pushText = (txt: string, baseRole: string) => {
    for (const seg of splitSystemReminders(txt)) {
      if (seg.kind === 'system-reminder') {
        blocks.push({ kind: 'system-reminder', text: seg.text })
      } else if (seg.text) {
        blocks.push({
          kind: baseRole === 'user' ? 'real-user' : 'real-assistant',
          text: seg.text,
        })
      }
    }
  }

  if (typeof content === 'string') {
    if (role === 'system') blocks.push({ kind: 'system-note', text: content })
    else pushText(content, role)
    return blocks
  }
  if (!Array.isArray(content)) {
    blocks.push({
      kind: role === 'user' ? 'real-user' : 'real-assistant',
      text: stringifyContent(content),
    })
    return blocks
  }

  for (const blk of content) {
    if (!blk || typeof blk !== 'object') continue
    const b = blk as Record<string, unknown>
    switch (b.type) {
      case 'text':
        pushText((b.text as string) || '', role)
        break
      case 'thinking':
        blocks.push({
          kind: 'thinking',
          text: (b.thinking as string) || (b.text as string) || '',
        })
        break
      case 'tool_use':
        blocks.push({
          kind: isWebSearchTool(b.name as string) ? 'web-search' : 'tool-call',
          name: (b.name as string) || 'tool',
          input: b.input,
          query: searchQueryOf(b.input),
        })
        break
      case 'tool_result': {
        let txt = ''
        if (typeof b.content === 'string') txt = b.content
        else if (Array.isArray(b.content)) {
          txt =
            (b.content as unknown[])
              .filter(
                (p): p is Record<string, unknown> =>
                  !!p &&
                  typeof p === 'object' &&
                  (p as Record<string, unknown>).type === 'text'
              )
              .map((p) => p.text as string)
              .join('\n') || stringifyContent(b.content)
        } else txt = stringifyContent(b.content)
        blocks.push({ kind: 'tool-result', text: txt, isError: !!b.is_error })
        break
      }
      case 'image': {
        const src = (b.source as Record<string, unknown>) || {}
        let dataUrl: string | null = null
        let r2Key: string | null = null
        if (src.type === 'r2_ref') {
          r2Key = (src.r2_key as string) || null
        } else if (src.type === 'base64' && src.data) {
          dataUrl = `data:${src.media_type || 'image/jpeg'};base64,${src.data}`
        } else if (src.url) {
          dataUrl = src.url as string
        }
        if (!dataUrl && !r2Key && b.image_url) {
          const iu = b.image_url as Record<string, unknown>
          r2Key = (iu.r2_key as string) || null
          if (
            !r2Key &&
            typeof iu.url === 'string' &&
            !iu.url.startsWith('[r2_ref]')
          ) {
            dataUrl = iu.url
          }
        }
        blocks.push({
          kind: 'image-block',
          dataUrl,
          r2Key,
          mediaType: (src.media_type as string) || '',
        })
        break
      }
      case 'document':
      case 'file': {
        const src = (b.source as Record<string, unknown>) || {}
        const title =
          (b.title as string) ||
          (b.name as string) ||
          (src.filename as string) ||
          (b.type === 'file' ? 'Attachment' : 'Document')
        const mimeType =
          (src.media_type as string) || (b.media_type as string) || ''
        const text =
          src.type === 'text'
            ? (src.data as string) || (src.text as string) || ''
            : ''
        blocks.push({ kind: 'file-block', title, mimeType, text })
        break
      }
      default:
        if (b.text) pushText(b.text as string, role)
    }
  }
  return blocks
}

/**
 * Parse the full conversation (system prompt + messages + final reply + error)
 * into an ordered block list.
 */
export function parseConversation(
  requestObj: unknown,
  responseText: string | undefined,
  errorText: string | undefined
): ConversationBlock[] {
  const all: ConversationBlock[] = []
  const req = (requestObj as Record<string, unknown>) || null

  // System prompt (string or array).
  if (req && req.system) {
    let sysText = ''
    if (typeof req.system === 'string') sysText = req.system
    else if (Array.isArray(req.system)) {
      sysText = (req.system as unknown[])
        .filter(
          (b) =>
            b &&
            ((b as Record<string, unknown>).type === 'text' ||
              typeof b === 'string')
        )
        .map((b) =>
          typeof b === 'string'
            ? b
            : ((b as Record<string, unknown>).text as string)
        )
        .join('\n')
    }
    if (sysText) all.push({ kind: 'system-prompt', text: sysText })
  }

  const msgs =
    (req && ((req.messages as unknown[]) || (req.input as unknown[]))) || []
  for (const m of msgs) {
    const msg = m as Record<string, unknown>
    if (!msg || !msg.role) continue
    all.push(...parseMessageBlocks(msg.role as string, msg.content))
  }

  // Final assistant reply.
  if (responseText) {
    let assistantText = responseText
    try {
      const parsed = JSON.parse(responseText)
      const c0 = parsed.choices?.[0]
      if (c0?.message?.content) assistantText = c0.message.content
      else if (c0?.delta?.content) assistantText = c0.delta.content
      else if (Array.isArray(parsed.content)) {
        assistantText = parsed.content
          .filter((b: Record<string, unknown>) => b.type === 'text')
          .map((b: Record<string, unknown>) => b.text)
          .join('\n')
      }
    } catch {
      /* stream/plain text */
    }
    if (assistantText) {
      for (const seg of splitSystemReminders(assistantText)) {
        if (seg.kind === 'system-reminder') {
          all.push({ kind: 'system-reminder', text: seg.text })
        } else if (seg.text) {
          all.push({ kind: 'real-assistant', text: seg.text, final: true })
        }
      }
    }
  }
  if (errorText) all.push({ kind: 'error', text: errorText })
  return all
}

/** Normalize the stored `request` field (object or JSON string) into an object. */
export function normalizeRequest(request: unknown): unknown {
  if (!request) return null
  if (typeof request === 'object') return request
  if (typeof request === 'string') {
    try {
      return JSON.parse(request)
    } catch {
      return null
    }
  }
  return null
}
