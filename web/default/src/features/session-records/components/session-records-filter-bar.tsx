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
import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { RotateCw, Search, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CompactDateTimeRangePicker } from '@/features/usage-logs/components/compact-date-time-range-picker'
import { backfillSessionContent } from '../api'

const route = getRouteApi('/_authenticated/session-records/')

type Draft = {
  username: string
  model_name: string
  request_id: string
  keyword: string
  only_failed: boolean
  only_media: boolean
  start?: Date
  end?: Date
}

function buildKey(search: Record<string, unknown>): string {
  return [
    search.username,
    search.model_name,
    search.request_id,
    search.keyword,
    search.only_failed,
    search.only_media,
    search.start_timestamp,
    search.end_timestamp,
  ]
    .map((v) => String(v ?? ''))
    .join('')
}

export function SessionRecordsFilterBar() {
  const { t } = useTranslation()
  const navigate = route.useNavigate()
  const search = route.useSearch()
  const queryClient = useQueryClient()
  const [backfilling, setBackfilling] = useState(false)

  const sourceKey = buildKey(search)
  const initial = useMemo<Draft>(
    () => ({
      username: search.username || '',
      model_name: search.model_name || '',
      request_id: search.request_id || '',
      keyword: search.keyword || '',
      only_failed: !!search.only_failed,
      only_media: !!search.only_media,
      start: search.start_timestamp
        ? new Date(search.start_timestamp * 1000)
        : undefined,
      end: search.end_timestamp
        ? new Date(search.end_timestamp * 1000)
        : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceKey]
  )

  const [draftState, setDraftState] = useState<{ key: string; draft: Draft }>(
    () => ({ key: sourceKey, draft: initial })
  )
  const draft = draftState.key === sourceKey ? draftState.draft : initial

  const update = (patch: Partial<Draft>) => {
    setDraftState({ key: sourceKey, draft: { ...draft, ...patch } })
  }

  const handleSearch = () => {
    navigate({
      search: {
        tab: 'requests',
        page: 1,
        username: draft.username || undefined,
        model_name: draft.model_name || undefined,
        request_id: draft.request_id || undefined,
        keyword: draft.keyword || undefined,
        only_failed: draft.only_failed || undefined,
        only_media: draft.only_media || undefined,
        start_timestamp: draft.start
          ? Math.floor(draft.start.getTime() / 1000)
          : undefined,
        end_timestamp: draft.end
          ? Math.floor(draft.end.getTime() / 1000)
          : undefined,
      },
    })
    queryClient.invalidateQueries({ queryKey: ['session-logs'] })
  }

  const handleReset = () => {
    setDraftState({
      key: sourceKey,
      draft: {
        username: '',
        model_name: '',
        request_id: '',
        keyword: '',
        only_failed: false,
        only_media: false,
        start: undefined,
        end: undefined,
      },
    })
    navigate({ search: { tab: 'requests', page: 1 } })
    queryClient.invalidateQueries({ queryKey: ['session-logs'] })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleBackfill = async () => {
    setBackfilling(true)
    try {
      const res = await backfillSessionContent(2000)
      if (res.success && res.data) {
        const d = res.data
        toast.success(
          t(
            'Backfill complete: scanned {{scanned}}, updated {{updated}}, skipped {{skipped}}, failed {{failed}}',
            d
          )
        )
        queryClient.invalidateQueries({ queryKey: ['session-logs'] })
      } else {
        toast.error(res.message || t('Backfill failed'))
      }
    } catch {
      toast.error(t('Backfill request failed'))
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Input
        className='h-8 w-32'
        placeholder={t('Username')}
        value={draft.username}
        onChange={(e) => update({ username: e.target.value })}
        onKeyDown={handleKeyDown}
      />
      <Input
        className='h-8 w-40'
        placeholder={t('Model Name')}
        value={draft.model_name}
        onChange={(e) => update({ model_name: e.target.value })}
        onKeyDown={handleKeyDown}
      />
      <Input
        className='h-8 w-52'
        placeholder={t('Request ID')}
        value={draft.request_id}
        onChange={(e) => update({ request_id: e.target.value })}
        onKeyDown={handleKeyDown}
      />
      <div className='relative'>
        <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2' />
        <Input
          className='h-8 w-48 pl-7'
          placeholder={t('Full-text search')}
          value={draft.keyword}
          onChange={(e) => update({ keyword: e.target.value })}
          onKeyDown={handleKeyDown}
        />
      </div>
      <CompactDateTimeRangePicker
        start={draft.start}
        end={draft.end}
        onChange={({ start, end }) => update({ start, end })}
      />
      <Button
        variant={draft.only_failed ? 'destructive' : 'outline'}
        size='sm'
        className='h-8'
        onClick={() => update({ only_failed: !draft.only_failed })}
      >
        {t('Failed only')}
      </Button>
      <Button
        variant={draft.only_media ? 'default' : 'outline'}
        size='sm'
        className='h-8'
        onClick={() => update({ only_media: !draft.only_media })}
      >
        {t('With attachments')}
      </Button>
      <Button size='sm' className='h-8' onClick={handleSearch}>
        <Search data-icon='inline-start' />
        {t('Search')}
      </Button>
      <Button variant='outline' size='sm' className='h-8' onClick={handleReset}>
        {t('Reset')}
      </Button>
      <Button
        variant='ghost'
        size='sm'
        className='h-8'
        onClick={handleBackfill}
        disabled={backfilling}
        title={t(
          'Rebuild the full-text search index for legacy records (fetches bodies from storage, run once).'
        )}
      >
        <RotateCw
          data-icon='inline-start'
          className={backfilling ? 'animate-spin' : undefined}
        />
        {t('Backfill index')}
      </Button>
      {draft.keyword && (
        <span className='inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400'>
          <ShieldAlert className='size-3' />
          {draft.keyword}
        </span>
      )}
    </div>
  )
}
