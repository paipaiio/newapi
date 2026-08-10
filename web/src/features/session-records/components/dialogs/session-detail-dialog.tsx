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
import { useQuery } from '@tanstack/react-query'
import { Braces, MessageSquare } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatTimestamp } from '@/lib/format'

import { getSessionLog } from '../../api'
import {
  normalizeRequest,
  parseConversation,
} from '../../lib/conversation-parser'
import type {
  ConversationBlock,
  SessionLog,
  SessionLogPayload,
} from '../../types'
import { ConversationBlockView } from '../conversation-blocks'

interface SessionDetailDialogProps {
  record: SessionLog | null
  open: boolean
  onOpenChange: (open: boolean) => void
  keyword?: string
}

function fmtQuota(q: number | undefined): string {
  return q ? (q / 500000).toFixed(6) : '0'
}

const CONVERSATION_KINDS = new Set<ConversationBlock['kind']>([
  'real-user',
  'real-assistant',
  'error',
])

export function SessionDetailDialog({
  record,
  open,
  onOpenChange,
  keyword,
}: SessionDetailDialogProps) {
  const { t } = useTranslation()
  const [rawMode, setRawMode] = useState(false)
  const [hideNoise, setHideNoise] = useState(false)

  const recordId = record?.id

  // Reset view toggles whenever a new record is opened.
  useEffect(() => {
    if (open) {
      setRawMode(false)
      setHideNoise(false)
    }
  }, [open, recordId])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['session-log', recordId],
    queryFn: () => getSessionLog(recordId as number),
    enabled: open && recordId != null,
  })

  const rawContent = data?.data?.content ?? ''

  const payload = useMemo<SessionLogPayload | null>(() => {
    if (!rawContent) return null
    try {
      return JSON.parse(rawContent) as SessionLogPayload
    } catch {
      return null
    }
  }, [rawContent])

  const blocks = useMemo<ConversationBlock[]>(() => {
    if (!payload) return []
    const requestObj = normalizeRequest(payload.request)
    return parseConversation(requestObj, payload.response, payload.error)
  }, [payload])

  const visibleBlocks = useMemo(() => {
    const filtered = hideNoise
      ? blocks.filter((b) => CONVERSATION_KINDS.has(b.kind))
      : blocks
    // Content-derived, dedup-counted keys (blocks carry no id and never reorder).
    const seen = new Map<string, number>()
    return filtered.map((block) => {
      const base = `${block.kind}:${(block.text ?? block.name ?? '').slice(0, 24)}`
      const n = seen.get(base) ?? 0
      seen.set(base, n + 1)
      return { block, key: `${base}#${n}` }
    })
  }, [blocks, hideNoise])

  const meta = data?.data?.meta ?? record ?? null

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className='flex flex-wrap items-center gap-2'>
          <span>{t('Session Record Details')}</span>
          {meta?.redacted && (
            <Badge
              variant='outline'
              className='border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-300'
            >
              {t('Redacted')}
            </Badge>
          )}
          {!isLoading && payload && (
            <>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 gap-1 text-xs'
                onClick={() => setRawMode((m) => !m)}
              >
                {rawMode ? (
                  <>
                    <MessageSquare className='size-3.5' /> {t('Chat view')}
                  </>
                ) : (
                  <>
                    <Braces className='size-3.5' /> {t('Raw data')}
                  </>
                )}
              </Button>
              {!rawMode && (
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-7 text-xs'
                  onClick={() => setHideNoise((h) => !h)}
                >
                  {hideNoise ? t('Show all') : t('Conversation only')}
                </Button>
              )}
            </>
          )}
        </div>
      }
      description={t('View the stored request and response bodies.')}
      contentClassName='sm:max-w-4xl'
      contentHeight='auto'
      bodyClassName='space-y-4'
    >
      <ScrollArea className='max-h-[640px] pr-4'>
        <div className='space-y-4 py-2'>
          {meta && (
            <div className='grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-3 text-sm md:grid-cols-3'>
              <div>
                <span className='text-muted-foreground'>{t('Time')}: </span>
                {meta.created_at ? formatTimestamp(meta.created_at) : '-'}
              </div>
              <div>
                <span className='text-muted-foreground'>{t('Username')}: </span>
                {meta.username || '-'}
              </div>
              <div>
                <span className='text-muted-foreground'>{t('Model')}: </span>
                {meta.model_name || '-'}
              </div>
              <div>
                <span className='text-muted-foreground'>{t('Group')}: </span>
                {meta.group || '-'}
              </div>
              <div>
                <span className='text-muted-foreground'>{t('Type')}: </span>
                {meta.is_stream ? t('Stream') : t('Non-stream')}
              </div>
              <div>
                <span className='text-muted-foreground'>
                  {t('Status code')}:{' '}
                </span>
                {meta.status_code || '-'}
              </div>
              <div>
                <span className='text-muted-foreground'>{t('Tokens')}: </span>
                {`${meta.prompt_tokens ?? 0} / ${meta.completion_tokens ?? 0}`}
              </div>
              <div>
                <span className='text-muted-foreground'>{t('Quota')}: </span>${' '}
                {fmtQuota(meta.quota)}
              </div>
              <div className='flex items-center gap-1'>
                <span className='text-muted-foreground'>{t('Result')}: </span>
                <StatusBadge
                  variant={meta.is_success ? 'success' : 'danger'}
                  copyable={false}
                >
                  {meta.is_success ? t('Success') : t('Failed')}
                </StatusBadge>
              </div>
              <div className='col-span-2 md:col-span-3'>
                <span className='text-muted-foreground'>
                  {t('Request ID')}:{' '}
                </span>
                <span className='font-mono text-xs'>
                  {meta.request_id || '-'}
                </span>
              </div>
            </div>
          )}

          {isLoading && (
            <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
          )}

          {isError && (
            <p className='text-destructive text-sm'>
              {t('Failed to load session record')}
            </p>
          )}

          {!isLoading &&
            payload &&
            (rawMode ? (
              <pre className='bg-muted/60 max-h-[520px] overflow-auto rounded-md border p-3 text-[11px] break-all whitespace-pre-wrap'>
                {rawContent}
              </pre>
            ) : (
              <div className='bg-muted/30 flex flex-col gap-2 rounded-lg border p-3'>
                {visibleBlocks.length === 0 ? (
                  <div className='text-muted-foreground py-6 text-center text-sm'>
                    {t('No displayable content')}
                  </div>
                ) : (
                  visibleBlocks.map(({ block, key }) => (
                    <ConversationBlockView
                      key={key}
                      block={block}
                      keyword={keyword}
                    />
                  ))
                )}
              </div>
            ))}

          {!isLoading && !payload && !isError && (
            <p className='text-muted-foreground text-sm'>
              {t('No displayable content')}
            </p>
          )}
        </div>
      </ScrollArea>
    </Dialog>
  )
}
