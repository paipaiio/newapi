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
import type { ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LongText } from '@/components/long-text'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/format'

import type { ContentSafetyEvent } from '../types'

function actionVariant(action: string) {
  if (action === 'block') return 'danger' as const
  if (action === 'review') return 'warning' as const
  return 'neutral' as const
}

function policyVariant(policy: string) {
  return policy === 'uncensored' ? ('purple' as const) : ('info' as const)
}

type ColumnsOptions = {
  onOpen: (row: ContentSafetyEvent) => void
}

export function useContentSafetyColumns({
  onOpen,
}: ColumnsOptions): ColumnDef<ContentSafetyEvent>[] {
  const { t } = useTranslation()

  return [
    {
      accessorKey: 'created_at',
      header: t('Time'),
      cell: ({ row }) => {
        const ts = row.getValue('created_at') as number | undefined
        return (
          <span className='text-muted-foreground text-sm'>
            {ts ? formatTimestamp(ts) : '-'}
          </span>
        )
      },
      size: 170,
      meta: { mobileTitle: true },
    },
    {
      accessorKey: 'username',
      header: t('Username'),
      cell: ({ row }) => (
        <LongText className='max-w-[120px] font-medium'>
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
      accessorKey: 'policy',
      header: t('Policy'),
      cell: ({ row }) => (
        <StatusBadge variant={policyVariant(row.original.policy)} copyable={false}>
          {row.original.policy || '-'}
        </StatusBadge>
      ),
      size: 120,
    },
    {
      accessorKey: 'action',
      header: t('Action'),
      cell: ({ row }) => (
        <StatusBadge variant={actionVariant(row.original.action)} copyable={false}>
          {row.original.action || '-'}
        </StatusBadge>
      ),
      size: 110,
    },
    {
      accessorKey: 'category',
      header: t('Category'),
      cell: ({ row }) => row.original.category || '-',
      size: 120,
    },
    {
      accessorKey: 'phase',
      header: t('Phase'),
      cell: ({ row }) => row.original.phase || '-',
      size: 90,
    },
    {
      accessorKey: 'review_status',
      header: t('Review'),
      cell: ({ row }) => (
        <StatusBadge
          variant={
            row.original.review_status === 'pending' ? 'warning' : 'success'
          }
          copyable={false}
        >
          {row.original.review_status || '-'}
        </StatusBadge>
      ),
      size: 110,
    },
    {
      accessorKey: 'snippet',
      header: t('Snippet'),
      cell: ({ row }) => (
        <LongText className='text-muted-foreground max-w-[280px]'>
          {row.original.snippet || '-'}
        </LongText>
      ),
      size: 280,
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: ({ row }) => (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-label={t('View details')}
          onClick={() => onOpen(row.original)}
        >
          <Eye className='size-4' />
        </Button>
      ),
      size: 70,
    },
  ]
}
