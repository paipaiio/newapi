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
import {
  Brain,
  ChevronRight,
  FileText,
  Globe,
  Image as ImageIcon,
  Pin,
  Settings,
  Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'

import { getSessionAttachment } from '../api'
import { stringifyContent } from '../lib/conversation-parser'
import type { ConversationBlock } from '../types'

/** Truncate a tool search query for the collapsed section label. */
function truncateQuery(query: string | undefined): string | undefined {
  if (!query) return undefined
  return query.length > 48 ? `${query.slice(0, 48)}…` : query
}

/** Highlight keyword occurrences inside plain text. */
function Highlight({ text, keyword }: { text: string; keyword?: string }) {
  if (!keyword || !text) return <span>{text}</span>
  const escaped = keyword.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${escaped})`, 'gi')
  // Capturing split yields matches at odd positions; build content-derived keys
  // from the running character offset so no raw array index is used.
  let offset = 0
  const segments = text.split(re).map((part, i) => {
    const key = `${offset}:${part.length}`
    offset += part.length
    return { part, key, isMatch: i % 2 === 1 }
  })
  return (
    <>
      {segments.map(({ part, key, isMatch }) =>
        isMatch ? (
          <mark
            key={key}
            className='rounded-[2px] bg-yellow-200 px-0.5 dark:bg-yellow-500/40'
          >
            {part}
          </mark>
        ) : (
          <span key={key}>{part}</span>
        )
      )}
    </>
  )
}

/** Bubble body: render markdown unless keyword-highlighting is active. */
function BubbleBody({
  text,
  keyword,
  user,
}: {
  text?: string
  keyword?: string
  user?: boolean
}) {
  const value = text || ''
  if (
    keyword &&
    value &&
    new RegExp(keyword.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(
      value
    )
  ) {
    return (
      <div className='break-words whitespace-pre-wrap'>
        <Highlight text={value} keyword={keyword} />
      </div>
    )
  }
  return (
    <div
      className={cn(
        'text-sm [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:max-w-full [&_ul]:my-1.5 [&_ol]:my-1.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        user && '[&_code]:bg-white/20 [&_code]:text-white'
      )}
    >
      <Markdown>{value}</Markdown>
    </div>
  )
}

/** Collapsible section for thinking / tools / reminders / system prompts. */
function Collapsible({
  icon,
  label,
  sub,
  body,
  keyword,
  tone = 'neutral',
  defaultOpen = false,
}: {
  icon: React.ReactNode
  label: string
  sub?: string
  body: string
  keyword?: string
  tone?: 'neutral' | 'purple' | 'cyan' | 'blue' | 'amber' | 'red' | 'green'
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const toneClass: Record<string, string> = {
    neutral: 'text-muted-foreground bg-muted',
    purple:
      'text-violet-600 bg-violet-500/10 dark:text-violet-300 dark:bg-violet-500/15',
    cyan: 'text-cyan-600 bg-cyan-500/10 dark:text-cyan-300 dark:bg-cyan-500/15',
    blue: 'text-blue-600 bg-blue-500/10 dark:text-blue-300 dark:bg-blue-500/15',
    amber:
      'text-amber-600 bg-amber-500/10 dark:text-amber-300 dark:bg-amber-500/15',
    red: 'text-red-600 bg-red-500/10 dark:text-red-300 dark:bg-red-500/15',
    green:
      'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300 dark:bg-emerald-500/15',
  }
  return (
    <div className='my-0.5 self-stretch'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs select-none',
          toneClass[tone]
        )}
      >
        <ChevronRight
          className={cn('size-3 transition-transform', open && 'rotate-90')}
        />
        <span className='inline-flex items-center gap-1'>
          {icon}
          {label}
        </span>
        {sub && <span className='opacity-65'>· {sub}</span>}
      </button>
      {open && (
        <pre className='bg-muted/60 mt-1 max-h-[280px] overflow-auto rounded-md border p-3 text-[11.5px] leading-relaxed break-words whitespace-pre-wrap'>
          <Highlight text={body} keyword={keyword} />
        </pre>
      )}
    </div>
  )
}

/** Image block: lazily loads R2-stored attachments as base64. */
function ImageBlock({ block }: { block: ConversationBlock }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (!block.r2Key || fetchedUrl) return
    setFetching(true)
    void getSessionAttachment(block.r2Key)
      .then((res) => {
        if (res?.success && res.data) {
          const { base64, media_type } = res.data
          setFetchedUrl(`data:${media_type || 'image/jpeg'};base64,${base64}`)
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.r2Key])

  const src = fetchedUrl || block.dataUrl || null
  if (!src && !fetching) {
    return (
      <div className='text-muted-foreground flex items-center gap-1 text-xs'>
        <ImageIcon className='size-3.5' /> {t('Image (no preview data)')}
      </div>
    )
  }
  if (fetching) {
    return (
      <div className='text-muted-foreground flex items-center gap-1 text-xs'>
        <ImageIcon className='size-3.5' /> {t('Loading image...')}
      </div>
    )
  }
  return (
    <div className='self-start'>
      <img
        src={src as string}
        alt={t('Uploaded image')}
        onClick={() => setOpen((o) => !o)}
        className='bg-muted/40 block max-w-full cursor-pointer rounded-md border object-contain'
        style={{ maxHeight: open ? 480 : 80 }}
        title={open ? t('Click to collapse') : t('Click to expand')}
      />
      <div className='text-muted-foreground mt-0.5 text-[10px]'>
        {block.mediaType || 'image'} ·{' '}
        {open ? t('Click to collapse') : t('Click to expand')}
      </div>
    </div>
  )
}

/** Render a single conversation block. */
export function ConversationBlockView({
  block,
  keyword,
}: {
  block: ConversationBlock
  keyword?: string
}) {
  const { t } = useTranslation()
  switch (block.kind) {
    case 'real-user':
      return (
        <div className='flex justify-end'>
          <div className='max-w-[78%] overflow-hidden rounded-[16px_16px_4px_16px] bg-[#155EEF] px-3.5 py-2 break-words text-white'>
            <BubbleBody text={block.text} keyword={keyword} user />
          </div>
        </div>
      )
    case 'real-assistant':
      return (
        <div className='flex items-start justify-start gap-2'>
          <div
            className={cn(
              'flex size-[26px] shrink-0 items-center justify-center rounded-full text-[11px]',
              block.final
                ? 'bg-emerald-500 text-white'
                : 'bg-muted text-muted-foreground'
            )}
          >
            AI
          </div>
          <div className='bg-muted max-w-[78%] overflow-hidden rounded-[16px_16px_16px_4px] px-3.5 py-2 break-words'>
            <BubbleBody text={block.text} keyword={keyword} />
          </div>
        </div>
      )
    case 'thinking':
      return (
        <Collapsible
          icon={<Brain className='size-3' />}
          label={t('Thinking')}
          sub={t('{{n}} chars', { n: block.text?.length ?? 0 })}
          body={block.text ?? ''}
          keyword={keyword}
          tone='purple'
        />
      )
    case 'tool-call':
      return (
        <Collapsible
          icon={<Wrench className='size-3' />}
          label={`${t('Tool call')}: ${block.name}`}
          body={stringifyContent(block.input)}
          keyword={keyword}
          tone='cyan'
        />
      )
    case 'web-search':
      return (
        <Collapsible
          icon={<Globe className='size-3' />}
          label={`${t('Web search')}: ${block.name}`}
          sub={truncateQuery(block.query)}
          body={stringifyContent(block.input)}
          keyword={keyword}
          tone='blue'
        />
      )
    case 'tool-result':
      return (
        <Collapsible
          icon={<Wrench className='size-3' />}
          label={block.isError ? t('Tool result (error)') : t('Tool result')}
          sub={t('{{n}} chars', { n: block.text?.length ?? 0 })}
          body={block.text ?? ''}
          keyword={keyword}
          tone={block.isError ? 'red' : 'neutral'}
        />
      )
    case 'image-block':
      return <ImageBlock block={block} />
    case 'file-block':
      return (
        <Collapsible
          icon={<FileText className='size-3' />}
          label={block.title || t('File')}
          sub={block.mimeType || undefined}
          body={block.text || `[${block.mimeType || t('Binary file')}]`}
          keyword={keyword}
          tone='green'
        />
      )
    case 'system-reminder':
      return (
        <Collapsible
          icon={<Pin className='size-3' />}
          label={t('System injection (system-reminder)')}
          sub={t('Not user input')}
          body={block.text ?? ''}
          keyword={keyword}
          tone='amber'
        />
      )
    case 'system-note':
      return (
        <Collapsible
          icon={<Settings className='size-3' />}
          label={t('System message')}
          body={block.text ?? ''}
          keyword={keyword}
          tone='neutral'
        />
      )
    case 'system-prompt':
      return (
        <Collapsible
          icon={<FileText className='size-3' />}
          label={t('System prompt')}
          sub={t('{{n}} chars', { n: block.text?.length ?? 0 })}
          body={block.text ?? ''}
          keyword={keyword}
          tone='neutral'
        />
      )
    case 'error':
      return (
        <div className='flex justify-center'>
          <div className='max-w-[90%] rounded-md border border-red-500/20 bg-red-500/10 px-3.5 py-1.5 text-xs text-red-600 dark:text-red-300'>
            ❌ <Highlight text={block.text ?? ''} keyword={keyword} />
          </div>
        </div>
      )
    default:
      return null
  }
}
