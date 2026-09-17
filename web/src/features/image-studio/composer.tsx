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
  CircleStop,
  ImagePlus,
  Loader2,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { STUDIO_QUALITIES, type STUDIO_SIZES } from './constants'

type StudioSize = (typeof STUDIO_SIZES)[number]

interface StudioComposerProps {
  prompt: string
  onPromptChange: (value: string) => void
  size: string
  onSizeChange: (value: string) => void
  quality: string
  onQualityChange: (value: string) => void
  availableSizes: readonly StudioSize[]
  references: File[]
  onAddReferences: (files: Iterable<File>) => void
  onRemoveReference: (index: number) => void
  generating: boolean
  elapsed: number
  canGenerate: boolean
  noModels: boolean
  onGenerate: () => void
  onStop: () => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

/** Tiny outlined rectangle that mirrors each aspect ratio. */
function SizeGlyph({ value }: { value: string }) {
  let shape = 'size-3'
  if (value === '1024x1536') {
    shape = 'h-3.5 w-2.5'
  } else if (value === '1536x1024') {
    shape = 'h-2.5 w-3.5'
  }
  return (
    <span
      aria-hidden='true'
      className={cn('rounded-[3px] border-[1.5px] border-current', shape)}
    />
  )
}

export function StudioComposer(props: StudioComposerProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // Object URLs for reference thumbnails; revoked whenever the list changes.
  const referenceThumbs = useMemo(
    () => props.references.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [props.references]
  )
  useEffect(() => {
    return () => {
      for (const thumb of referenceThumbs) {
        URL.revokeObjectURL(thumb.url)
      }
    }
  }, [referenceThumbs])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      props.onGenerate()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
      file.type.startsWith('image/')
    )
    if (files.length > 0) {
      event.preventDefault()
      props.onAddReferences(files)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    props.onAddReferences(
      [...(event.dataTransfer?.files ?? [])].filter((file) =>
        file.type.startsWith('image/')
      )
    )
  }

  return (
    <div
      className={cn(
        'relative rounded-2xl bg-gradient-to-br from-indigo-500/40 via-border/60 to-teal-500/40 p-px transition-all duration-300',
        'focus-within:from-indigo-500/70 focus-within:to-teal-500/70 focus-within:shadow-lg focus-within:shadow-indigo-500/10',
        dragOver && 'from-indigo-500 to-teal-500 shadow-lg shadow-indigo-500/20'
      )}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setDragOver(false)
        }
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDrop={handleDrop}
    >
      <div className='bg-card/95 rounded-[15px] backdrop-blur-sm'>
        <Textarea
          aria-label={t('Prompt')}
          className='min-h-28 resize-none rounded-none border-0 bg-transparent px-4 pt-4 text-[15px] leading-relaxed shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent'
          disabled={props.generating}
          onChange={(event) => props.onPromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t('Describe the image you want to create...')}
          ref={props.textareaRef}
          value={props.prompt}
        />

        {referenceThumbs.length > 0 ? (
          <div className='flex flex-wrap items-center gap-2 px-4 pb-1'>
            {referenceThumbs.map((thumb, index) => (
              <div
                className='group/ref relative'
                key={`${thumb.file.name}-${thumb.file.size}-${thumb.file.lastModified}`}
              >
                <img
                  alt={thumb.file.name}
                  className='size-14 rounded-lg border object-cover'
                  src={thumb.url}
                />
                <button
                  aria-label={t('Remove reference')}
                  className='bg-background absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border shadow-sm transition-colors hover:border-destructive hover:text-destructive'
                  onClick={() => props.onRemoveReference(index)}
                  type='button'
                >
                  <X className='size-3' />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className='flex flex-wrap items-center gap-x-2 gap-y-2.5 px-3 pt-2 pb-3'>
          <Button
            aria-label={t('Add reference images')}
            className='text-muted-foreground'
            disabled={props.generating}
            onClick={() => fileInputRef.current?.click()}
            size='icon'
            title={t('Add reference images')}
            type='button'
            variant='ghost'
          >
            <ImagePlus className='size-4' />
          </Button>
          <input
            accept='image/png,image/jpeg,image/webp'
            className='sr-only'
            multiple
            onChange={(event) => {
              if (event.target.files) {
                props.onAddReferences([...event.target.files])
              }
              event.target.value = ''
            }}
            ref={fileInputRef}
            type='file'
          />

          <span
            aria-hidden='true'
            className='bg-border/60 h-5 w-px max-sm:hidden'
          />

          <div
            aria-label={t('Size')}
            className='flex items-center gap-1'
            role='group'
          >
            {props.availableSizes.map((item) => {
              const selected = item.value === props.size
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all duration-200',
                    selected
                      ? 'border-indigo-500/50 bg-indigo-500/10 font-medium text-indigo-600 dark:border-indigo-400/40 dark:text-indigo-400'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground border-transparent'
                  )}
                  disabled={props.generating}
                  key={item.value}
                  onClick={() => props.onSizeChange(item.value)}
                  title={t(item.labelKey)}
                  type='button'
                >
                  <SizeGlyph value={item.value} />
                  <span className='max-sm:hidden'>{t(item.labelKey)}</span>
                </button>
              )
            })}
          </div>

          <div
            aria-label={t('Quality')}
            className='bg-muted/50 flex items-center gap-0.5 rounded-lg border p-0.5'
            role='group'
          >
            {STUDIO_QUALITIES.map((item) => {
              const selected = item.value === props.quality
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs transition-all duration-200',
                    selected
                      ? 'bg-background text-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  disabled={props.generating}
                  key={item.value}
                  onClick={() => props.onQualityChange(item.value)}
                  type='button'
                >
                  {t(item.labelKey)}
                </button>
              )
            })}
          </div>

          <span className='text-muted-foreground/70 ml-1 hidden text-xs lg:inline'>
            {t('Ctrl + Enter to generate')}
          </span>

          <div className='ml-auto flex items-center gap-2'>
            {props.generating ? (
              <Button
                onClick={props.onStop}
                type='button'
                variant='outline'
              >
                <CircleStop className='size-4' />
                {t('Stop generating')}
              </Button>
            ) : null}
            <Button
              className={cn(
                'border-0 bg-gradient-to-r from-indigo-500 to-teal-500 text-white shadow-md shadow-indigo-500/20 transition-all duration-300',
                'hover:from-indigo-500/90 hover:to-teal-500/90 hover:shadow-lg hover:shadow-indigo-500/30',
                'disabled:opacity-50'
              )}
              disabled={!props.canGenerate}
              onClick={props.onGenerate}
              type='button'
            >
              {props.generating ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                <Sparkles className='size-4' />
              )}
              {props.generating
                ? t('Elapsed {{seconds}}s', { seconds: props.elapsed })
                : t('Generate')}
            </Button>
          </div>
        </div>

        {props.noModels ? (
          <p className='flex items-center gap-1.5 px-4 pb-3 text-xs text-amber-600 dark:text-amber-500'>
            <TriangleAlert className='size-3.5 shrink-0' />
            {t('No image models available in this group')}
          </p>
        ) : null}
      </div>

      {dragOver ? (
        <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-indigo-500/10 backdrop-blur-[2px]'>
          <p className='bg-background/90 flex items-center gap-2 rounded-full border border-indigo-500/40 px-4 py-2 text-sm font-medium shadow-lg'>
            <ImagePlus className='size-4 text-indigo-500' />
            {t('Drop images here to add as references')}
          </p>
        </div>
      ) : null}
    </div>
  )
}
