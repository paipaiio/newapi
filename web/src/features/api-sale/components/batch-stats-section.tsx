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
import { Download, Eye, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { MultiSelect } from '@/components/multi-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatTimestamp } from '@/lib/format'

import {
  exportBatchAccounts,
  getAllGroupNames,
  getBatchStats,
  setBatchVisibleGroups,
} from '../api'
import { downloadCsv } from '../csv'
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
    const res = await exportBatchAccounts(batchId)
    if (!res.success) {
      toast.error(res.message || t('Export failed'))
      return
    }
    const items = res.data?.items || []
    if (items.length === 0) {
      toast.error(t('No records for this batch'))
      return
    }
    downloadCsv(
      `batch_${batchId}.csv`,
      [
        'username',
        'password',
        'api_key',
        'group',
        'visible_groups',
        'quota',
        'batch_id',
      ],
      items.map((it) => [
        it.username || '',
        it.password || '',
        it.api_key || '',
        it.group || '',
        (it.visible_groups || []).join(';'),
        it.unlimited ? 'unlimited' : toUsd(it.quota),
        it.batch_id || batchId,
      ])
    )
    toast.success(t('Batch list exported'))
  } catch {
    toast.error(t('Request failed'))
  }
}

function BatchRow({
  stat,
  onExport,
  onSetVisible,
}: {
  stat: BatchStat
  onExport: (batchId: string) => void
  onSetVisible: (batchId: string) => void
}) {
  const { t } = useTranslation()
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
        <div className='flex justify-end gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onSetVisible(stat.batch_id)}
          >
            <Eye data-icon='inline-start' />
            {t('Visible groups')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onExport(stat.batch_id)}
          >
            <Download data-icon='inline-start' />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function BatchStatsSection() {
  const { t } = useTranslation()
  const [visibleBatchId, setVisibleBatchId] = useState('')
  const [visibleGroups, setVisibleGroupsValue] = useState<string[]>([])
  const [savingVisible, setSavingVisible] = useState(false)

  const {
    data: stats = [],
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['api-sale-batch-stats'],
    queryFn: async () => {
      const res = await getBatchStats()
      return res.success ? res.data || [] : []
    },
  })

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: getAllGroupNames,
  })
  const groups = groupsData?.data || []

  const handleSaveVisible = async () => {
    if (!visibleBatchId) return
    setSavingVisible(true)
    try {
      const res = await setBatchVisibleGroups(visibleBatchId, visibleGroups)
      if (res.success) {
        toast.success(t('Visible groups updated'))
        setVisibleBatchId('')
        setVisibleGroupsValue([])
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    }
    setSavingVisible(false)
  }

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
                onSetVisible={(id) => {
                  setVisibleBatchId(id)
                  setVisibleGroupsValue([])
                }}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={Boolean(visibleBatchId)}
        onOpenChange={(open) => {
          if (!open) {
            setVisibleBatchId('')
            setVisibleGroupsValue([])
          }
        }}
        title={t('Batch set visible groups')}
        description={t(
          'Display-only whitelist for this batch. Empty = all groups visible.'
        )}
        contentHeight='auto'
        footer={
          <>
            <Button
              variant='outline'
              onClick={() => {
                setVisibleBatchId('')
                setVisibleGroupsValue([])
              }}
            >
              {t('Cancel')}
            </Button>
            <Button onClick={handleSaveVisible} disabled={savingVisible}>
              {t('Confirm')}
            </Button>
          </>
        }
      >
        <div className='grid gap-2 py-2'>
          <Label>{t('Visible groups')}</Label>
          <MultiSelect
            options={groups.map((g) => ({ value: g, label: g }))}
            selected={visibleGroups}
            onChange={setVisibleGroupsValue}
            placeholder={t('All groups visible (no restriction)')}
          />
        </div>
      </Dialog>
    </div>
  )
}
