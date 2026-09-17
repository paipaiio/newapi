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
  Check,
  Copy,
  Download,
  ImagePlus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { STUDIO_QUALITIES } from './constants'
import { relativeTimeParts } from './lib'
import type { StudioPreviewRecord } from './types'

interface StudioPreviewDialogProps {
  record: StudioPreviewRecord | null
  onClose: () => void
  onCopyPrompt: (record: StudioPreviewRecord) => Promise<void> | void
  onDownload: (record: StudioPreviewRecord) => void
  onReuse: (record: StudioPreviewRecord) => void
  onUseAsReference: (record: StudioPreviewRecord) => void
  onDelete: (record: StudioPreviewRecord) => void
}

export function StudioPreviewDialog(props: StudioPreviewDialogProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const record = props.record
  const time = record
    ? relativeTimeParts(record.createdAt, Date.now())
    : null

  const handleCopy = async () => {
    if (!record) return
    await props.onCopyPrompt(record)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      open={Boolean(record)}
    >
      <DialogContent className='max-w-4xl sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle className='line-clamp-2 pr-8 text-base font-medium'>
            {record?.prompt}
          </DialogTitle>
        </DialogHeader>
        {record ? (
          <div className='grid gap-4'>
            <div className='bg-muted/40 flex items-center justify-center overflow-hidden rounded-xl border'>
              <img
                alt={record.prompt}
                className='max-h-[62vh] w-full object-contain'
                src={record.url}
              />
            </div>

            <div className='flex flex-wrap items-center gap-1.5'>
              <Badge className='font-mono' variant='secondary'>
                {record.model}
              </Badge>
              <Badge variant='outline'>{record.size}</Badge>
              <Badge variant='outline'>
                {t(
                  STUDIO_QUALITIES.find((q) => q.value === record.quality)
                    ?.labelKey ?? record.quality
                )}
              </Badge>
              {time ? (
                <Badge variant='ghost'>
                  {'count' in time
                    ? t(time.key, { count: time.count })
                    : t(time.key)}
                </Badge>
              ) : null}
            </div>

            <div className='flex flex-wrap justify-end gap-2'>
              <Button onClick={() => void handleCopy()} variant='outline'>
                {copied ? (
                  <Check className='size-4 text-teal-500' />
                ) : (
                  <Copy className='size-4' />
                )}
                {copied ? t('Copied') : t('Copy prompt')}
              </Button>
              <Button onClick={() => props.onReuse(record)} variant='outline'>
                <RotateCcw className='size-4' />
                {t('Reuse prompt')}
              </Button>
              <Button
                onClick={() => props.onUseAsReference(record)}
                variant='outline'
              >
                <ImagePlus className='size-4' />
                {t('Use as reference')}
              </Button>
              <Button onClick={() => props.onDownload(record)}>
                <Download className='size-4' />
                {t('Download')}
              </Button>
              <Button
                aria-label={t('Delete')}
                onClick={() => props.onDelete(record)}
                size='icon'
                title={t('Delete')}
                variant='destructive'
              >
                <Trash2 className='size-4' />
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
