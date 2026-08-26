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
  Download,
  ImagePlus,
  Images,
  RotateCcw,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { aspectRatioForSize, relativeTimeParts } from './lib'
import type { StudioPreviewRecord } from './types'

const EXAMPLE_PROMPTS = [
  'A neon-lit city street at night, rain reflections, cinematic',
  'A minimalist geometric fox logo, flat design, soft gradient',
  'An isometric cozy developer workspace, pastel colors',
] as const

interface StudioGalleryProps {
  records: StudioPreviewRecord[]
  generating: boolean
  generatingSize: string
  generatingPrompt: string
  elapsed: number
  onPreview: (record: StudioPreviewRecord) => void
  onDownload: (record: StudioPreviewRecord) => void
  onDelete: (record: StudioPreviewRecord) => void
  onReuse: (record: StudioPreviewRecord) => void
  onUseAsReference: (record: StudioPreviewRecord) => void
  onTryExample: (prompt: string) => void
  onClear: () => void
}

/** Animated placeholder shown where the next image will land. */
function GeneratingCard({
  size,
  prompt,
  elapsed,
}: {
  size: string
  prompt: string
  elapsed: number
}) {
  const { t } = useTranslation()
  return (
    <div
      className='relative mb-4 break-inside-avoid overflow-hidden rounded-xl border border-indigo-500/30 shadow-lg shadow-indigo-500/5'
      style={{ aspectRatio: aspectRatioForSize(size) }}
    >
      <div className='studio-breathe absolute inset-0 bg-gradient-to-br from-indigo-500/15 via-transparent to-teal-500/15' />
      <div className='studio-shimmer absolute inset-0 overflow-hidden' />
      <div className='studio-scanline' />
      <div className='absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center'>
        <Sparkles className='size-5 animate-pulse text-indigo-500 dark:text-indigo-400' />
        <p className='text-sm font-medium'>{t('Generating your image...')}</p>
        <p className='text-muted-foreground font-mono text-xs'>
          {t('Elapsed {{seconds}}s', { seconds: elapsed })}
        </p>
        {prompt ? (
          <p className='text-muted-foreground/80 mt-1 line-clamp-2 max-w-56 text-xs'>
            {prompt}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function RecordCard({
  record,
  index,
  onPreview,
  onDownload,
  onDelete,
  onReuse,
  onUseAsReference,
}: {
  record: StudioPreviewRecord
  index: number
  onPreview: () => void
  onDownload: () => void
  onDelete: () => void
  onReuse: () => void
  onUseAsReference: () => void
}) {
  const { t } = useTranslation()
  const time = relativeTimeParts(record.createdAt, Date.now())

  const actions: {
    icon: LucideIcon
    label: string
    onClick: () => void
    danger?: boolean
  }[] = [
    { icon: RotateCcw, label: t('Reuse prompt'), onClick: onReuse },
    { icon: ImagePlus, label: t('Use as reference'), onClick: onUseAsReference },
    { icon: Download, label: t('Download'), onClick: onDownload },
    { icon: Trash2, label: t('Delete'), onClick: onDelete, danger: true },
  ]

  return (
    <figure
      className={cn(
        'group bg-card studio-card-enter relative mb-4 break-inside-avoid overflow-hidden rounded-xl border transition-all duration-300',
        'hover:-translate-y-0.5 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/10 dark:hover:border-indigo-400/20'
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <button
        className='block w-full cursor-zoom-in overflow-hidden'
        onClick={onPreview}
        type='button'
      >
        <img
          alt={record.prompt}
          className='w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]'
          loading='lazy'
          src={record.url}
          style={{ aspectRatio: aspectRatioForSize(record.size) }}
        />
      </button>

      {/* Floating action bar over the image */}
      <div className='bg-background/85 absolute inset-x-2 bottom-2 flex items-center justify-end gap-0.5 rounded-lg border p-1 opacity-0 shadow-sm backdrop-blur transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100'>
        {actions.map((action) => (
          <Button
            aria-label={action.label}
            className={cn(
              action.danger &&
                'hover:text-destructive dark:hover:text-destructive'
            )}
            key={action.label}
            onClick={action.onClick}
            size='icon-sm'
            title={action.label}
            variant='ghost'
          >
            <action.icon className='size-3.5' />
          </Button>
        ))}
      </div>

      <figcaption className='grid gap-1.5 p-3'>
        <p className='line-clamp-2 text-sm leading-snug'>{record.prompt}</p>
        <div className='text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs'>
          <span className='truncate font-mono'>{record.model}</span>
          <span aria-hidden='true'>·</span>
          <span className='shrink-0'>
            {'count' in time ? t(time.key, { count: time.count }) : t(time.key)}
          </span>
        </div>
      </figcaption>
    </figure>
  )
}

export function StudioGallery(props: StudioGalleryProps) {
  const { t } = useTranslation()
  const [confirmClear, setConfirmClear] = useState(false)
  const empty = props.records.length === 0 && !props.generating

  return (
    <section className='grid gap-4'>
      {props.records.length > 0 ? (
        <div className='flex items-center justify-between'>
          <h2 className='flex items-center gap-2 text-sm font-medium'>
            <Images className='text-muted-foreground size-4' />
            {t('History')}
            <Badge className='font-mono' variant='secondary'>
              {t('{{count}} images', { count: props.records.length })}
            </Badge>
          </h2>
          <AlertDialog onOpenChange={setConfirmClear} open={confirmClear}>
            <Button
              className='text-muted-foreground hover:text-destructive'
              onClick={() => setConfirmClear(true)}
              size='sm'
              variant='ghost'
            >
              <Trash2 className='size-3.5' />
              {t('Clear')}
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('Clear all generated images?')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('This only removes images stored in this browser.')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    props.onClear()
                    setConfirmClear(false)
                  }}
                  variant='destructive'
                >
                  {t('Clear')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}

      {empty ? (
        <div className='flex flex-col items-center justify-center gap-4 py-14 text-center'>
          <div className='rounded-2xl bg-gradient-to-br from-indigo-500/25 via-indigo-500/10 to-teal-500/25 p-px'>
            <div className='bg-card flex size-14 items-center justify-center rounded-[15px]'>
              <Sparkles className='size-6 text-indigo-500 dark:text-indigo-400' />
            </div>
          </div>
          <div className='grid gap-1.5'>
            <h2 className='text-lg font-semibold tracking-tight'>
              {t('Describe an image to get started')}
            </h2>
            <p className='text-muted-foreground max-w-md text-sm'>
              {t(
                'Text-to-image uses /v1/images/generations. Add a reference photo to switch to edits.'
              )}
            </p>
          </div>
          <div className='grid max-w-lg gap-2'>
            <p className='text-muted-foreground text-xs font-medium tracking-widest uppercase'>
              {t('Try an example:')}
            </p>
            <div className='flex flex-wrap justify-center gap-2'>
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  className='hover:border-indigo-500/40 hover:bg-indigo-500/5 hover:text-foreground text-muted-foreground rounded-full border px-3.5 py-1.5 text-xs transition-all duration-200'
                  key={example}
                  onClick={() => props.onTryExample(example)}
                  type='button'
                >
                  {t(example)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className='columns-1 gap-4 sm:columns-2 xl:columns-3'>
          {props.generating ? (
            <GeneratingCard
              elapsed={props.elapsed}
              prompt={props.generatingPrompt}
              size={props.generatingSize}
            />
          ) : null}
          {props.records.map((record, index) => (
            <RecordCard
              index={index}
              key={record.id}
              onDelete={() => props.onDelete(record)}
              onDownload={() => props.onDownload(record)}
              onPreview={() => props.onPreview(record)}
              onReuse={() => props.onReuse(record)}
              onUseAsReference={() => props.onUseAsReference(record)}
              record={record}
            />
          ))}
        </div>
      )}
    </section>
  )
}
