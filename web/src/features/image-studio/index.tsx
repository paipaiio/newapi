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
import { Sparkles } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ModelGroupSelector } from '@/components/model-group-selector'

import { generateStudioImage, getStudioGroups, getStudioModels } from './api'
import { StudioComposer } from './composer'
import {
  DEFAULT_STUDIO_GROUP,
  DEFAULT_STUDIO_MODEL,
  DEFAULT_STUDIO_QUALITY,
  DEFAULT_STUDIO_SIZE,
  STUDIO_HISTORY_LIMIT,
  STUDIO_MAX_REFERENCES,
  STUDIO_SIZES,
} from './constants'
import { StudioGallery } from './gallery'
import {
  extensionForMime,
  filterStudioModels,
  getRelayErrorMessage,
  pickDefaultStudioModel,
  studioSizeForModel,
} from './lib'
import { StudioPreviewDialog } from './preview-dialog'
import {
  clearStudioRecords,
  deleteStudioRecord,
  listStudioRecords,
  saveStudioRecord,
} from './storage'
import type { StudioPreviewRecord, StudioRecord } from './types'

function revokeUrls(records: StudioPreviewRecord[]) {
  for (const record of records) {
    URL.revokeObjectURL(record.url)
  }
}

function toPreview(record: StudioRecord): StudioPreviewRecord {
  const blob = new Blob([record.bytes], { type: record.mimeType })
  return { ...record, url: URL.createObjectURL(blob) }
}

export function ImageStudio() {
  const { t } = useTranslation()
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)

  const [prompt, setPrompt] = useState('')
  const [group, setGroup] = useState(DEFAULT_STUDIO_GROUP)
  const [model, setModel] = useState(DEFAULT_STUDIO_MODEL)
  const [size, setSize] = useState(DEFAULT_STUDIO_SIZE)
  const [quality, setQuality] = useState(DEFAULT_STUDIO_QUALITY)
  const [references, setReferences] = useState<File[]>([])
  const [records, setRecords] = useState<StudioPreviewRecord[]>([])
  const [generating, setGenerating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [activePrompt, setActivePrompt] = useState('')
  const [preview, setPreview] = useState<StudioPreviewRecord | null>(null)

  const groupsQuery = useQuery({
    queryKey: ['studio-groups'],
    queryFn: getStudioGroups,
  })
  const modelsQuery = useQuery({
    queryKey: ['studio-models', group],
    queryFn: () => getStudioModels(group),
    enabled: group !== '',
  })

  const groups = useMemo(
    () => groupsQuery.data ?? [],
    [groupsQuery.data]
  )
  const models = useMemo(
    () => filterStudioModels(modelsQuery.data ?? []),
    [modelsQuery.data]
  )
  const availableSizes = model.toLowerCase().includes('4k')
    ? STUDIO_SIZES.filter((item) => item.value === '1024x1024')
    : STUDIO_SIZES

  useEffect(() => {
    let cancelled = false
    listStudioRecords()
      .then((stored) => {
        if (cancelled) return
        setRecords(stored.map(toPreview))
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(t('Could not load image history'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const recordsRef = useRef(records)
  recordsRef.current = records

  useEffect(() => {
    return () => {
      revokeUrls(recordsRef.current)
      abortRef.current?.abort()
    }
  }, [])

  // Elapsed-seconds ticker shown on the composer button and placeholder card.
  useEffect(() => {
    if (!generating) return
    setElapsed(0)
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [generating])

  useEffect(() => {
    if (groups.length === 0) return
    if (!groups.some((item) => item.value === group)) {
      setGroup(
        groups.find((item) => item.value === DEFAULT_STUDIO_GROUP)?.value ??
          groups[0].value
      )
    }
  }, [group, groups])

  useEffect(() => {
    if (models.length === 0) return
    const nextModel = pickDefaultStudioModel(models, model)
    if (nextModel !== model) {
      setModel(nextModel)
    }
    const nextSize = studioSizeForModel(nextModel, size)
    if (nextSize !== size) {
      setSize(nextSize)
    }
  }, [model, models, size])

  const canGenerate =
    prompt.trim().length > 0 && !generating && models.length > 0

  const addReferences = (files: Iterable<File>) => {
    const incoming = [...files].filter((file) =>
      file.type.startsWith('image/')
    )
    if (incoming.length === 0) return
    const room = STUDIO_MAX_REFERENCES - references.length
    if (incoming.length > room) {
      toast.warning(
        t('You can add up to {{count}} reference images', {
          count: STUDIO_MAX_REFERENCES,
        })
      )
    }
    if (room > 0) {
      setReferences((current) => [...current, ...incoming.slice(0, room)])
    }
  }

  const handleGenerate = async () => {
    if (!canGenerate) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setActivePrompt(prompt.trim())
    setGenerating(true)
    try {
      const image = await generateStudioImage(
        {
          prompt: prompt.trim(),
          model,
          group,
          size: studioSizeForModel(model, size),
          quality,
          references,
        },
        controller.signal
      )
      const record: StudioRecord = {
        id: nanoid(),
        createdAt: Date.now(),
        prompt: prompt.trim(),
        model,
        group,
        size: studioSizeForModel(model, size),
        quality,
        mimeType: image.mimeType,
        bytes: image.bytes,
      }
      await saveStudioRecord(record)
      setRecords((current) => {
        const next = [toPreview(record), ...current]
        for (const extra of next.slice(STUDIO_HISTORY_LIMIT)) {
          URL.revokeObjectURL(extra.url)
        }
        return next.slice(0, STUDIO_HISTORY_LIMIT)
      })
      toast.success(t('Image generated'))
    } catch (error) {
      if (controller.signal.aborted) return
      toast.error(getRelayErrorMessage(error, t('Image generation failed')))
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      setGenerating(false)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleDownload = (record: StudioPreviewRecord) => {
    const link = document.createElement('a')
    link.href = record.url
    link.download = `studio-${record.id}.${extensionForMime(record.mimeType)}`
    link.click()
  }

  const handleDelete = async (record: StudioPreviewRecord) => {
    await deleteStudioRecord(record.id)
    setRecords((current) => {
      const target = current.find((item) => item.id === record.id)
      if (target) URL.revokeObjectURL(target.url)
      return current.filter((item) => item.id !== record.id)
    })
    if (preview?.id === record.id) setPreview(null)
  }

  const handleClear = async () => {
    await clearStudioRecords()
    revokeUrls(records)
    setRecords([])
    setPreview(null)
  }

  /** Restore a record's settings into the composer for iteration. */
  const handleReuse = (record: StudioPreviewRecord) => {
    setPrompt(record.prompt)
    setSize(record.size)
    setQuality(record.quality)
    if (models.some((item) => item.value === record.model)) {
      setModel(record.model)
    }
    if (groups.some((item) => item.value === record.group)) {
      setGroup(record.group)
    }
    setPreview(null)
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    textareaRef.current?.focus()
  }

  /** Feed a generated image back in as an edit reference. */
  const handleUseAsReference = (record: StudioPreviewRecord) => {
    const file = new File(
      [record.bytes],
      `studio-${record.id}.${extensionForMime(record.mimeType)}`,
      { type: record.mimeType }
    )
    addReferences([file])
    setPreview(null)
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    textareaRef.current?.focus()
  }

  const handleCopyPrompt = async (record: StudioPreviewRecord) => {
    try {
      await navigator.clipboard.writeText(record.prompt)
    } catch {
      toast.error(t('Copy failed'))
    }
  }

  const handleTryExample = (example: string) => {
    setPrompt(t(example))
    textareaRef.current?.focus()
  }

  return (
    <div className='relative flex size-full min-h-0 flex-col overflow-hidden'>
      {/* Ambient brand glow, drifting slowly behind the workspace */}
      <div
        aria-hidden
        className='landing-aurora pointer-events-none absolute -inset-16 opacity-15 dark:opacity-[0.08]'
        style={{
          background: [
            'radial-gradient(ellipse 55% 45% at 15% 10%, oklch(0.62 0.19 273 / 60%) 0%, transparent 70%)',
            'radial-gradient(ellipse 45% 40% at 85% 20%, oklch(0.70 0.13 175 / 45%) 0%, transparent 70%)',
          ].join(', '),
        }}
      />

      <header className='bg-background/60 relative z-10 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur'>
        <div className='flex min-w-0 items-center gap-3'>
          <div className='shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-teal-500 p-px shadow-md shadow-indigo-500/20'>
            <div className='bg-card flex size-9 items-center justify-center rounded-[11px]'>
              <Sparkles className='size-4.5 text-indigo-500 dark:text-indigo-400' />
            </div>
          </div>
          <div className='min-w-0'>
            <h1 className='text-base font-semibold tracking-tight'>
              {t('Image Studio')}
            </h1>
            <p className='text-muted-foreground hidden text-xs sm:block'>
              {t(
                'Generate images with your account. Results stay in this browser.'
              )}
            </p>
          </div>
        </div>
        <ModelGroupSelector
          disabled={generating || modelsQuery.isLoading}
          groups={groups}
          models={models}
          onGroupChange={setGroup}
          onModelChange={setModel}
          selectedGroup={group}
          selectedModel={model}
        />
      </header>

      <div className='relative z-10 min-h-0 flex-1 overflow-y-auto'>
        <div className='mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6'>
          <div ref={composerRef} className='scroll-mt-4'>
            <StudioComposer
              availableSizes={availableSizes}
              canGenerate={canGenerate}
              elapsed={elapsed}
              generating={generating}
              noModels={!modelsQuery.isLoading && models.length === 0}
              onAddReferences={addReferences}
              onGenerate={() => void handleGenerate()}
              onPromptChange={setPrompt}
              onQualityChange={setQuality}
              onRemoveReference={(index) =>
                setReferences((current) =>
                  current.filter((_, i) => i !== index)
                )
              }
              onSizeChange={setSize}
              onStop={handleStop}
              prompt={prompt}
              quality={quality}
              references={references}
              size={size}
              textareaRef={textareaRef}
            />
          </div>

          <StudioGallery
            elapsed={elapsed}
            generating={generating}
            generatingPrompt={activePrompt}
            generatingSize={studioSizeForModel(model, size)}
            onClear={() => void handleClear()}
            onDelete={(record) => void handleDelete(record)}
            onDownload={handleDownload}
            onPreview={setPreview}
            onReuse={handleReuse}
            onTryExample={handleTryExample}
            onUseAsReference={handleUseAsReference}
            records={records}
          />
        </div>
      </div>

      <StudioPreviewDialog
        onClose={() => setPreview(null)}
        onCopyPrompt={handleCopyPrompt}
        onDelete={(record) => void handleDelete(record)}
        onDownload={handleDownload}
        onReuse={handleReuse}
        onUseAsReference={handleUseAsReference}
        record={preview}
      />
    </div>
  )
}
