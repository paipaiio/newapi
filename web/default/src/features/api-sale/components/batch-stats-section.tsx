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
import { Download, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatTimestamp } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getBatchStats, lookupBatchTokens } from '../api'
import type { BatchStat } from '../types'

/** Internal quota units per USD (matches backend display conversion). */
const QUOTA_PER_USD = 500000

function toUsd(units: number): string {
  return (units / QUOTA_PER_USD).toFixed(2)
}

async function exportBatch(
  batchId: string,
  t: (key: string) => string
): Promise<void> {
  try {
    const res = await lookupBatchTokens(batchId)
    if (!res.success) {
      toast.error(res.message || t('Export failed'))
      return
    }
    const items = (res.data?.items || []).filter((it) => it.batch_id === batchId)
    if (items.length === 0) {
      toast.error(t('No records for this batch'))
      return
    }
    const header = 'username,email,api_key,group,batch_id\n'
    const body = items
      .map(
        (it) =>
          `${it.username || ''},${it.email || ''},${it.full_key || ''},${it.group || ''},${it.batch_id || ''}`
      )
      .join('\n')
    const blob = new Blob([`﻿${header}${body}`], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `batch_${batchId}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t('Batch list exported'))
  } catch {
    toast.error(t('Request failed'))
  }
}

function BatchRow({
  stat,
  onExport,
}: {
  stat: BatchStat
  onExport: (batchId: string) => void
}) {
  return (
    <TableRow>
      <TableCell>
        <Badge
          variant='outline'
          className='rounded-full border-violet-500/40 text-violet-600 dark:text-violet-300'
        >
          {stat.batch_id}
        </Badge>
      </TableCell>
      <TableCell className='tabular-nums'>{stat.user_count}</TableCell>
      <TableCell className='tabular-nums'>
        {toUsd(stat.total_remain)} USD
      </TableCell>
      <TableCell className='text-muted-foreground tabular-nums'>
        {toUsd(stat.total_used)} USD
      </TableCell>
      <TableCell className='text-muted-foreground text-sm'>
        {stat.created ? formatTimestamp(stat.created) : '-'}
      </TableCell>
      <TableCell className='text-right'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => onExport(stat.batch_id)}
        >
          <Download data-icon='inline-start' />
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function BatchStatsSection() {
  const { t } = useTranslation()

  const { data: stats = [], isFetching, refetch } = useQuery({
    queryKey: ['api-sale-batch-stats'],
    queryFn: async () => {
      const res = await getBatchStats()
      return res.success ? res.data || [] : []
    },
  })

  return (
    <div className='mt-6 rounded-lg border p-4'>
      <div className='mb-3 flex items-center justify-between'>
        <span className='font-medium'>{t('Historical batches')}</span>
        <Button
          variant='outline'
          size='sm'
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RotateCw
            data-icon='inline-start'
            className={isFetching ? 'animate-spin' : undefined}
          />
          {t('Refresh')}
        </Button>
      </div>
      {stats.length === 0 ? (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          {t('No batch records yet (only shown when a batch name is set)')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Batch name')}</TableHead>
              <TableHead>{t('Accounts')}</TableHead>
              <TableHead>{t('Total balance')}</TableHead>
              <TableHead>{t('Used')}</TableHead>
              <TableHead>{t('Created at')}</TableHead>
              <TableHead className='text-right'>{t('Export list')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((stat) => (
              <BatchRow
                key={stat.batch_id}
                stat={stat}
                onExport={(id) => exportBatch(id, t)}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
