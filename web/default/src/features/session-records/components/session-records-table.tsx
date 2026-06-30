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
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { getSessionLogs } from '../api'
import { useSessionRecordsColumns } from './session-records-columns'

const route = getRouteApi('/_authenticated/session-records/')

export function SessionRecordsTable() {
  const { t } = useTranslation()
  const columns = useSessionRecordsColumns()
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
      'session-logs',
      pagination.pageIndex + 1,
      pagination.pageSize,
      search.user_id,
      search.username,
      search.model_name,
      search.request_id,
      search.only_failed,
      search.start_timestamp,
      search.end_timestamp,
    ],
    queryFn: async () => {
      const result = await getSessionLogs({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        user_id: search.user_id,
        username: search.username,
        model_name: search.model_name,
        request_id: search.request_id,
        only_failed: search.only_failed,
        start_timestamp: search.start_timestamp,
        end_timestamp: search.end_timestamp,
      })

      if (!result.success) {
        toast.error(result.message || t('Failed to load session records'))
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
      emptyTitle={t('No Session Records Found')}
      emptyDescription={t(
        'No session records available. Try adjusting your filters.'
      )}
      skeletonKeyPrefix='session-records-skeleton'
      applyHeaderSize
      toolbarProps={null}
    />
  )
}
