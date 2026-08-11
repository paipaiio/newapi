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

import type { SessionLog } from '../types'
import { useSessionRecords } from './session-records-provider'

export function useSessionRecordsColumns(): ColumnDef<SessionLog>[] {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow } = useSessionRecords()

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
      size: 180,
      meta: { mobileTitle: true },
    },
    {
      accessorKey: 'username',
      header: t('Username'),
      cell: ({ row }) => {
        const username = row.getValue('username') as string
        return (
          <LongText className='max-w-[140px] font-medium'>
            {username || '-'}
          </LongText>
        )
      },
      size: 160,
    },
    {
      accessorKey: 'model_name',
      header: t('Model'),
      cell: ({ row }) => {
        const model = row.getValue('model_name') as string
        return <LongText className='max-w-[180px]'>{model || '-'}</LongText>
      },
      size: 200,
    },
    {
      accessorKey: 'group',
      header: t('Group'),
      cell: ({ row }) => {
        const group = row.getValue('group') as string
        return group ? (
          <StatusBadge variant='neutral' copyable={false}>
            {group}
          </StatusBadge>
        ) : (
          <span className='text-muted-foreground'>-</span>
        )
      },
      size: 120,
      meta: { mobileHidden: true },
    },
    {
      accessorKey: 'is_stream',
      header: t('Type'),
      cell: ({ row }) => {
        const isStream = row.getValue('is_stream') as boolean
        return (
          <StatusBadge variant={isStream ? 'info' : 'neutral'} copyable={false}>
            {isStream ? t('Stream') : t('Non-stream')}
          </StatusBadge>
        )
      },
      size: 120,
      meta: { mobileHidden: true },
    },
    {
      accessorKey: 'is_success',
      header: t('Result'),
      cell: ({ row }) => {
        const isSuccess = row.getValue('is_success') as boolean
        return (
          <StatusBadge
            variant={isSuccess ? 'success' : 'danger'}
            copyable={false}
          >
            {isSuccess ? t('Success') : t('Failed')}
          </StatusBadge>
        )
      },
      size: 110,
    },
    {
      accessorKey: 'status_code',
      header: t('Status code'),
      cell: ({ row }) => {
        const code = row.getValue('status_code') as number
        return <span className='tabular-nums'>{code || '-'}</span>
      },
      size: 110,
      meta: { mobileHidden: true },
    },
    {
      id: 'tokens',
      header: t('Tokens'),
      cell: ({ row }) => {
        const prompt = row.original.prompt_tokens ?? 0
        const completion = row.original.completion_tokens ?? 0
        return (
          <span className='text-muted-foreground text-sm tabular-nums'>
            {prompt} / {completion}
          </span>
        )
      },
      size: 130,
      meta: { mobileHidden: true },
    },
    {
      accessorKey: 'request_id',
      header: t('Request ID'),
      cell: ({ row }) => {
        const requestId = row.getValue('request_id') as string
        return (
          <LongText className='text-muted-foreground max-w-[180px] font-mono text-xs'>
            {requestId || '-'}
          </LongText>
        )
      },
      size: 200,
      meta: { mobileHidden: true },
    },
    {
      id: 'actions',
      header: () => t('Actions'),
      cell: ({ row }) => (
        <Button
          variant='ghost'
          size='sm'
          onClick={() => {
            setCurrentRow(row.original)
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
