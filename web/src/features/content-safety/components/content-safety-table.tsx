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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { getContentSafetyEvents } from '../api'
import type { ContentSafetyEvent } from '../types'
import { useContentSafetyColumns } from './content-safety-columns'
import { ContentSafetyDetailDialog } from './content-safety-detail-dialog'
import { ContentSafetyFilterBar } from './content-safety-filter-bar'

const route = getRouteApi('/_authenticated/content-safety/')

export function ContentSafetyTable() {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const search = route.useSearch()
  const [current, setCurrent] = useState<ContentSafetyEvent | null>(null)

  const columns = useContentSafetyColumns({
    onOpen: (row) => setCurrent(row),
  })

  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate: route.useNavigate(),
      pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
      globalFilter: { enabled: false },
    })

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      'content-safety-events',
      pagination.pageIndex + 1,
      pagination.pageSize,
      search.username,
      search.model_name,
      search.policy,
      search.action,
      search.review_status,
      search.request_id,
    ],
    queryFn: async () => {
      const result = await getContentSafetyEvents({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        username: search.username,
        model_name: search.model_name,
        policy: search.policy,
        action: search.action,
        review_status: search.review_status,
        request_id: search.request_id,
      })
      if (!result.success) {
        toast.error(result.message || t('Failed to load safety events'))
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
    <>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyTitle={t('No safety events found')}
        emptyDescription={t(
          'No content safety events yet. Enable the feature in Security settings and traffic will appear here.'
        )}
        skeletonKeyPrefix='content-safety-skeleton'
        applyHeaderSize
        toolbar={<ContentSafetyFilterBar />}
      />
      <ContentSafetyDetailDialog
        record={current}
        open={current !== null}
        onOpenChange={(open) => {
          if (!open) setCurrent(null)
        }}
        onReviewed={() => {
          void refetch()
        }}
      />
    </>
  )
}
