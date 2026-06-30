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
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatTimestamp } from '@/lib/format'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { getSessionLog } from '../../api'
import type { SessionLog, SessionLogPayload } from '../../types'

interface SessionDetailDialogProps {
  record: SessionLog | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Normalize the stored `request` field (object or string) into displayable text. */
function stringifyBody(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function CopyableBlock({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })

  return (
    <div className='space-y-2'>
      <Label className='text-sm font-semibold'>{label}</Label>
      <div className='bg-muted/50 relative rounded-md border p-3'>
        <Button
          variant='ghost'
          size='sm'
          className='absolute top-2 right-2 h-8 w-8 p-0'
          onClick={() => copyToClipboard(value)}
          title={t('Copy to clipboard')}
        >
          {copiedText === value ? (
            <Check className='size-4 text-green-600' />
          ) : (
            <Copy className='size-4' />
          )}
        </Button>
        <pre className='max-h-[280px] overflow-auto pr-10 text-xs leading-relaxed break-words whitespace-pre-wrap'>
          {value || '-'}
        </pre>
      </div>
    </div>
  )
}

export function SessionDetailDialog({
  record,
  open,
  onOpenChange,
}: SessionDetailDialogProps) {
  const { t } = useTranslation()

  const recordId = record?.id

  const { data, isLoading, isError } = useQuery({
    queryKey: ['session-log', recordId],
    queryFn: () => getSessionLog(recordId as number),
    enabled: open && recordId != null,
  })

  const payload = useMemo<SessionLogPayload | null>(() => {
    const content = data?.data?.content
    if (!content) return null
    try {
      return JSON.parse(content) as SessionLogPayload
    } catch {
      return null
    }
  }, [data])

  const meta = data?.data?.meta ?? record ?? null

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Session Record Details')}
      description={t('View the stored request and response bodies.')}
      contentClassName='sm:max-w-3xl'
      contentHeight='auto'
      bodyClassName='space-y-4'
    >
      <ScrollArea className='max-h-[600px] pr-4'>
        <div className='space-y-4 py-2'>
          {meta && (
            <div className='grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-3 text-sm md:grid-cols-3'>
              <div>
                <span className='text-muted-foreground'>{t('Time')}: </span>
                {meta.created_at ? formatTimestamp(meta.created_at) : '-'}
              </div>
              <div>
                <span className='text-muted-foreground'>
                  {t('Username')}:{' '}
                </span>
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

          {payload && (
            <>
              {payload.error && (
                <CopyableBlock label={t('Error')} value={payload.error} />
              )}
              <CopyableBlock
                label={t('Request body')}
                value={stringifyBody(payload.request)}
              />
              <CopyableBlock
                label={t('Response body')}
                value={stringifyBody(payload.response)}
              />
            </>
          )}
        </div>
      </ScrollArea>
    </Dialog>
  )
}
