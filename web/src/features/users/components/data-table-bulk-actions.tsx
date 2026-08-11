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
import { type Table } from '@tanstack/react-table'
import {
  Power,
  PowerOff,
  LogIn,
  LockKeyhole,
  CreditCard,
  WalletMinimal,
  Tag,
  Eye,
  Coins,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatQuota, parseQuotaFromDollars } from '@/lib/format'

import {
  batchManageUser,
  batchManageQuota,
  batchSetGroup,
  batchSetTopup,
  getAllGroupNames,
  setVisibleGroups,
} from '../api'
import type { User, QuotaAdjustMode } from '../types'
import { useUsers } from './users-provider'

interface DataTableBulkActionsProps {
  table: Table<User>
}

export function DataTableBulkActions({ table }: DataTableBulkActionsProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = useUsers()

  const [showGroupDialog, setShowGroupDialog] = useState(false)
  const [showVisibleDialog, setShowVisibleDialog] = useState(false)
  const [showQuotaDialog, setShowQuotaDialog] = useState(false)
  const [groupValue, setGroupValue] = useState('')
  const [visibleGroups, setVisibleGroupsValue] = useState<string[]>([])
  const [quotaMode, setQuotaMode] = useState<QuotaAdjustMode>('add')
  const [quotaAmount, setQuotaAmount] = useState('')

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: getAllGroupNames,
  })
  const groups = groupsData?.data || []

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedIds = selectedRows.reduce<number[]>((ids, row) => {
    const id = (row.original as User).id
    if (typeof id === 'number') ids.push(id)
    return ids
  }, [])

  const clearSelection = () => table.resetRowSelection()

  // Run a batch call, surface success/failure, refresh + clear on success.
  const runBatch = async (
    fn: () => Promise<{ success: boolean; message?: string }>,
    successMsg: string,
    after?: () => void
  ) => {
    if (selectedIds.length === 0) return
    try {
      const res = await fn()
      if (res.success) {
        toast.success(t(successMsg))
        triggerRefresh()
        clearSelection()
        after?.()
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } catch {
      toast.error(t('An unexpected error occurred'))
    }
  }

  const handleQuota = () => {
    const amount = parseFloat(quotaAmount)
    if (quotaMode !== 'override' && (!amount || amount <= 0)) return
    if (quotaMode === 'override' && Number.isNaN(amount)) return
    const value = parseQuotaFromDollars(Math.abs(amount))
    runBatch(
      () => batchManageQuota(selectedIds, quotaMode, value),
      'Quota adjusted successfully',
      () => {
        setShowQuotaDialog(false)
        setQuotaAmount('')
      }
    )
  }

  const iconBtn = (
    key: string,
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    variant: 'outline' | 'destructive' = 'outline'
  ) => (
    <Tooltip key={key}>
      <TooltipTrigger
        render={
          <Button
            variant={variant}
            size='icon'
            onClick={onClick}
            className='size-8'
            aria-label={t(label)}
            title={t(label)}
          />
        }
      >
        {icon}
        <span className='sr-only'>{t(label)}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t(label)}</p>
      </TooltipContent>
    </Tooltip>
  )

  return (
    <>
      <BulkActionsToolbar table={table} entityName='user'>
        {iconBtn('enable', 'Batch enable', <Power />, () =>
          runBatch(
            () => batchManageUser(selectedIds, 'enable'),
            'Users enabled'
          )
        )}
        {iconBtn('disable', 'Batch disable', <PowerOff />, () =>
          runBatch(
            () => batchManageUser(selectedIds, 'disable'),
            'Users disabled'
          )
        )}
        {iconBtn('enable_login', 'Batch allow login', <LogIn />, () =>
          runBatch(
            () => batchManageUser(selectedIds, 'enable_login'),
            'Console login enabled'
          )
        )}
        {iconBtn('disable_login', 'Batch disable login', <LockKeyhole />, () =>
          runBatch(
            () => batchManageUser(selectedIds, 'disable_login'),
            'Console login disabled'
          )
        )}
        {iconBtn('allow_topup', 'Batch enable top-up', <CreditCard />, () =>
          runBatch(() => batchSetTopup(selectedIds, true), 'Top-up enabled')
        )}
        {iconBtn(
          'disallow_topup',
          'Batch disable top-up',
          <WalletMinimal />,
          () =>
            runBatch(() => batchSetTopup(selectedIds, false), 'Top-up disabled')
        )}
        {iconBtn('group', 'Batch set group', <Tag />, () =>
          setShowGroupDialog(true)
        )}
        {iconBtn('visible', 'Batch set visible groups', <Eye />, () => {
          setVisibleGroupsValue([])
          setShowVisibleDialog(true)
        })}
        {iconBtn('quota', 'Batch adjust quota', <Coins />, () =>
          setShowQuotaDialog(true)
        )}
      </BulkActionsToolbar>

      {/* Set group dialog */}
      <Dialog
        open={showGroupDialog}
        onOpenChange={setShowGroupDialog}
        title={t('Batch set group')}
        description={t('Set the group for {{n}} selected user(s).', {
          n: selectedIds.length,
        })}
        contentHeight='auto'
        footer={
          <>
            <Button variant='outline' onClick={() => setShowGroupDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={() =>
                runBatch(
                  () => batchSetGroup(selectedIds, groupValue),
                  'Group updated',
                  () => setShowGroupDialog(false)
                )
              }
              disabled={!groupValue}
            >
              {t('Confirm')}
            </Button>
          </>
        }
      >
        <div className='grid gap-2 py-2'>
          <Label>{t('Group')}</Label>
          <Select
            value={groupValue}
            onValueChange={(v) => setGroupValue(v ?? '')}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('Select a group')} />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Dialog>

      {/* Visible groups dialog */}
      <Dialog
        open={showVisibleDialog}
        onOpenChange={setShowVisibleDialog}
        title={t('Batch set visible groups')}
        description={t(
          'Display-only whitelist for {{n}} selected user(s). Empty = all groups visible.',
          { n: selectedIds.length }
        )}
        contentHeight='auto'
        footer={
          <>
            <Button
              variant='outline'
              onClick={() => setShowVisibleDialog(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={() =>
                runBatch(
                  () => setVisibleGroups(selectedIds, visibleGroups),
                  'Visible groups updated',
                  () => setShowVisibleDialog(false)
                )
              }
            >
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

      {/* Quota dialog */}
      <Dialog
        open={showQuotaDialog}
        onOpenChange={setShowQuotaDialog}
        title={t('Batch adjust quota')}
        description={t('Adjust quota for {{n}} selected user(s).', {
          n: selectedIds.length,
        })}
        contentHeight='auto'
        footer={
          <>
            <Button variant='outline' onClick={() => setShowQuotaDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleQuota}>{t('Confirm')}</Button>
          </>
        }
      >
        <div className='grid gap-3 py-2'>
          <div className='grid gap-2'>
            <Label>{t('Mode')}</Label>
            <Select
              value={quotaMode}
              onValueChange={(v) => setQuotaMode(v as QuotaAdjustMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='add'>{t('Add')}</SelectItem>
                <SelectItem value='subtract'>{t('Subtract')}</SelectItem>
                <SelectItem value='override'>{t('Override')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-2'>
            <Label>{t('Amount')}</Label>
            <Input
              type='number'
              min={quotaMode === 'override' ? undefined : 0}
              placeholder='0'
              value={quotaAmount}
              onChange={(e) => setQuotaAmount(e.target.value)}
            />
            {quotaAmount && !Number.isNaN(parseFloat(quotaAmount)) && (
              <p className='text-muted-foreground text-xs'>
                {formatQuota(
                  parseQuotaFromDollars(Math.abs(parseFloat(quotaAmount)))
                )}
              </p>
            )}
          </div>
        </div>
      </Dialog>
    </>
  )
}
