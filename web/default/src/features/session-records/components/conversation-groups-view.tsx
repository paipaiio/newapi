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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Eye, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatTimestamp } from '@/lib/format'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LongText } from '@/components/long-text'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { getConversationGroups, triggerSessionOrganize } from '../api'
import type { ConversationGroup, SessionLog } from '../types'
import { useSessionRecords } from './session-records-provider'

const route = getRouteApi('/_authenticated/session-records/')

function fmtDuration(startedAt: number, endedAt: number): string {
  const secs = Math.max(0, endedAt - startedAt)
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m${s}s`
}

function useConversationGroupsColumns(): ColumnDef<ConversationGroup>[] {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow } = useSessionRecords()

  return [
    { accessorKey: 'date', header: t('Date'), size: 110 },
    {
      accessorKey: 'username',
      header: t('Username'),
      cell: ({ row }) => (
        <LongText className='max-w-[120px]'>
          {row.original.username || '-'}
        </LongText>
      ),
      size: 130,
    },
    {
      accessorKey: 'model_name',
      header: t('Model'),
      cell: ({ row }) => (
        <LongText className='max-w-[160px]'>
          {row.original.model_name || '-'}
        </LongText>
      ),
      size: 180,
    },
    {
      accessorKey: 'turn_count',
      header: t('Turns'),
      cell: ({ row }) => (
        <span className='tabular-nums'>{row.original.turn_count}</span>
      ),
      size: 80,
    },
    {
      id: 'tokens',
      header: t('Tokens'),
      cell: ({ row }) => (
        <span className='text-muted-foreground tabular-nums text-sm'>
          {row.original.prompt_tokens} / {row.original.completion_tokens}
        </span>
      ),
      size: 130,
    },
    {
      accessorKey: 'started_at',
      header: t('Start'),
      cell: ({ row }) => (
        <span className='text-muted-foreground text-sm'>
          {row.original.started_at
            ? formatTimestamp(row.original.started_at)
            : '-'}
        </span>
      ),
      size: 170,
    },
    {
      id: 'duration',
      header: t('Duration'),
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {fmtDuration(row.original.started_at, row.original.ended_at)}
        </span>
      ),
      size: 90,
    },
    {
      id: 'actions',
      header: () => t('Actions'),
      cell: ({ row }) => (
        <Button
          variant='ghost'
          size='sm'
          disabled={!row.original.last_session_id}
          onClick={() => {
            // Reuse the detail dialog which fetches by id; supply a minimal
            // record so the dialog can show meta while loading.
            setCurrentRow({
              id: row.original.last_session_id,
              username: row.original.username,
              model_name: row.original.model_name,
            } as SessionLog)
            setOpen('detail')
          }}
        >
          <Eye data-icon='inline-start' />
          <span>{t('Details')}</span>
        </Button>
      ),
      size: 120,
      meta: { pinned: 'right' as const },
    },
  ]
}

function ConversationGroupsFilterBar() {
  const { t } = useTranslation()
  const navigate = route.useNavigate()
  const search = route.useSearch()
  const queryClient = useQueryClient()
  const [organizing, setOrganizing] = useState(false)
  const [organizeDate, setOrganizeDate] = useState('')
  const [username, setUsername] = useState(search.username || '')
  const [modelName, setModelName] = useState(search.model_name || '')
  const [dateFrom, setDateFrom] = useState(search.date_from || '')
  const [dateTo, setDateTo] = useState(search.date_to || '')

  const handleSearch = () => {
    navigate({
      search: {
        tab: 'conversations',
        page: 1,
        username: username || undefined,
        model_name: modelName || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      },
    })
    queryClient.invalidateQueries({ queryKey: ['conversation-groups'] })
  }

  const handleReset = () => {
    setUsername('')
    setModelName('')
    setDateFrom('')
    setDateTo('')
    navigate({ search: { tab: 'conversations', page: 1 } })
    queryClient.invalidateQueries({ queryKey: ['conversation-groups'] })
  }

  const handleOrganize = async () => {
    setOrganizing(true)
    try {
      const res = await triggerSessionOrganize(organizeDate.trim() || undefined)
      if (res.success) {
        toast.success(res.message || t('Organization complete'))
        queryClient.invalidateQueries({ queryKey: ['conversation-groups'] })
      } else {
        toast.error(res.message || t('Organization failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setOrganizing(false)
    }
  }

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Input
        className='h-8 w-32'
        placeholder={t('Username')}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Input
        className='h-8 w-40'
        placeholder={t('Model Name')}
        value={modelName}
        onChange={(e) => setModelName(e.target.value)}
      />
      <Input
        className='h-8 w-40'
        placeholder={t('Start date YYYY-MM-DD')}
        value={dateFrom}
        onChange={(e) => setDateFrom(e.target.value)}
      />
      <Input
        className='h-8 w-40'
        placeholder={t('End date YYYY-MM-DD')}
        value={dateTo}
        onChange={(e) => setDateTo(e.target.value)}
      />
      <Button size='sm' className='h-8' onClick={handleSearch}>
        <Search data-icon='inline-start' />
        {t('Search')}
      </Button>
      <Button variant='outline' size='sm' className='h-8' onClick={handleReset}>
        {t('Reset')}
      </Button>
      <Input
        className='h-8 w-48'
        placeholder={t('Organize date (default yesterday)')}
        value={organizeDate}
        onChange={(e) => setOrganizeDate(e.target.value)}
      />
      <Button
        variant='ghost'
        size='sm'
        className='h-8'
        onClick={handleOrganize}
        disabled={organizing}
        title={t('Manually organize conversations for a given date')}
      >
        <RefreshCw
          data-icon='inline-start'
          className={organizing ? 'animate-spin' : undefined}
        />
        {t('Organize now')}
      </Button>
      <span className='text-muted-foreground text-xs'>
        {t('Auto-organized daily at 00:02')}
      </span>
    </div>
  )
}

export function ConversationGroupsView() {
  const { t } = useTranslation()
  const columns = useConversationGroupsColumns()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const search = route.useSearch()

  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate: route.useNavigate(),
      pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
      globalFilter: { enabled: false },
    })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'conversation-groups',
      pagination.pageIndex + 1,
      pagination.pageSize,
      search.username,
      search.model_name,
      search.date_from,
      search.date_to,
    ],
    queryFn: async () => {
      const result = await getConversationGroups({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        username: search.username,
        model_name: search.model_name,
        date_from: search.date_from,
        date_to: search.date_to,
      })
      if (!result.success) {
        toast.error(result.message || t('Failed to load conversations'))
        return { items: [], total: 0 }
      }
      return {
        items: result.data?.items || [],
        total: result.data?.total || 0,
      }
    },
    placeholderData: (previousData) => previousData,
  })

  const records = data?.items || []

  const { table } = useDataTable({
    data: records,
    columns,
    pagination,
    onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total || 0,
    ensurePageInRange,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No Conversations Found')}
      emptyDescription={t(
        'No aggregated conversations available. Try adjusting your filters.'
      )}
      skeletonKeyPrefix='conversation-groups-skeleton'
      applyHeaderSize
      toolbar={<ConversationGroupsFilterBar />}
    />
  )
}
