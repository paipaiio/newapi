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
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { getGroups, getUsers } from '@/features/users/api'
import { getExclusiveGroups, setExclusiveGroup } from './api'
import { ExclusiveEditDialog } from './components/exclusive-edit-dialog'
import type { ExclusiveGroupItem } from './types'

function GroupExclusiveContent() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExclusiveGroupItem | null>(null)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const { data: exclusiveList = [], isLoading } = useQuery({
    queryKey: ['exclusive-groups'],
    queryFn: async () => {
      const res = await getExclusiveGroups()
      return res.success ? res.data || [] : []
    },
  })

  const { data: allGroups = [] } = useQuery({
    queryKey: ['all-groups'],
    queryFn: async () => {
      const res = await getGroups()
      return res.success ? res.data || [] : []
    },
  })

  // Resolve a batch of usernames for the authorized-user chips.
  const { data: userBatch = [] } = useQuery({
    queryKey: ['group-exclusive-user-labels'],
    queryFn: async () => {
      const res = await getUsers({ p: 1, page_size: 100 })
      return res.success ? res.data?.items || [] : []
    },
  })

  const userLabels = useMemo<Record<number, string>>(() => {
    const map: Record<number, string> = {}
    for (const u of userBatch) map[u.id] = u.username
    return map
  }, [userBatch])

  const exclusiveNames = useMemo(
    () => new Set(exclusiveList.map((e) => e.group_name)),
    [exclusiveList]
  )
  const availableGroups = useMemo(
    () => allGroups.filter((g) => !exclusiveNames.has(g)),
    [allGroups, exclusiveNames]
  )

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['exclusive-groups'] })

  const handleRemove = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      const res = await setExclusiveGroup(removeTarget, [])
      if (res.success) {
        toast.success(t('Exclusivity removed'))
        setRemoveTarget(null)
        refresh()
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setRemoving(false)
    }
  }

  const openNew = () => {
    setEditTarget(null)
    setEditOpen(true)
  }
  const openEdit = (item: ExclusiveGroupItem) => {
    setEditTarget(item)
    setEditOpen(true)
  }

  let body: React.ReactNode
  if (isLoading) {
    body = (
      <div className='space-y-3'>
        {['a', 'b', 'c'].map((k) => (
          <Skeleton key={k} className='h-16 rounded-xl' />
        ))}
      </div>
    )
  } else if (exclusiveList.length === 0) {
    body = (
      <div className='text-muted-foreground flex flex-col items-center gap-3 py-12'>
        <Lock className='size-10 opacity-40' />
        <span>{t('No exclusive groups yet')}</span>
      </div>
    )
  } else {
    body = (
      <div className='space-y-3'>
        {exclusiveList.map((item) => (
          <div
            key={item.group_name}
            className='bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-xl p-3'
          >
            <div className='flex flex-wrap items-center gap-2'>
              <Badge
                variant='outline'
                className='rounded-full border-violet-500/40 text-violet-600 dark:text-violet-300'
              >
                {item.group_name}
              </Badge>
              <span className='text-muted-foreground text-xs'>
                {t('{{n}} authorized users', { n: item.user_ids.length })}:
              </span>
              {item.user_ids.map((uid) => (
                <Badge key={uid} variant='secondary' className='rounded-full'>
                  {userLabels[uid] ? `${userLabels[uid]} (${uid})` : `ID:${uid}`}
                </Badge>
              ))}
            </div>
            <div className='flex gap-1'>
              <Button variant='outline' size='sm' onClick={() => openEdit(item)}>
                {t('Edit authorization')}
              </Button>
              <Button
                variant='ghost'
                size='sm'
                className='text-destructive'
                onClick={() => setRemoveTarget(item.group_name)}
              >
                <Trash2 data-icon='inline-start' />
                {t('Remove exclusivity')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className='mx-auto max-w-[1000px]'>
      <div className='mb-4 flex items-center justify-between'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Groups marked as exclusive are hidden from all users by default; only authorized users can use them.'
          )}
        </p>
        <Button size='sm' onClick={openNew}>
          <Plus data-icon='inline-start' />
          {t('New exclusive group')}
        </Button>
      </div>

      {body}

      <ExclusiveEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        groupName={editTarget?.group_name ?? ''}
        initialUserIds={editTarget?.user_ids ?? []}
        availableGroups={availableGroups}
        userLabels={userLabels}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={t('Remove exclusivity')}
        desc={t(
          'Remove the exclusivity of group "{{name}}"? Default visibility rules will be restored.',
          { name: removeTarget ?? '' }
        )}
        confirmText={t('Remove exclusivity')}
        destructive
        isLoading={removing}
        handleConfirm={handleRemove}
      />
    </div>
  )
}

export function GroupExclusive() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Exclusive Groups')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <GroupExclusiveContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
