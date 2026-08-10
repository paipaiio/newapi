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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { MultiSelect, type Option } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { searchUsers } from '@/features/users/api'
import { useDebounce } from '@/hooks'

import { setExclusiveGroup } from '../api'

interface ExclusiveEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Non-empty when editing an existing exclusive group. */
  groupName: string
  initialUserIds: number[]
  /** Groups available to newly mark as exclusive (excludes existing ones). */
  availableGroups: string[]
  /** Resolved userId -> username labels for already-authorized users. */
  userLabels: Record<number, string>
  onSaved: () => void
}

export function ExclusiveEditDialog({
  open,
  onOpenChange,
  groupName,
  initialUserIds,
  availableGroups,
  userLabels,
  onSaved,
}: ExclusiveEditDialogProps) {
  const { t } = useTranslation()
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword, 300)

  // id -> label cache so selected chips stay readable even when the user is
  // not part of the current search result page.
  const [labelCache, setLabelCache] = useState<Map<string, string>>(new Map())

  const isEdit = !!groupName

  useEffect(() => {
    if (open) {
      setSelectedGroup(groupName)
      setSelectedUsers(initialUserIds.map(String))
      setKeyword('')
      setLabelCache(() => {
        const map = new Map<string, string>()
        for (const id of initialUserIds) {
          map.set(
            String(id),
            userLabels[id] ? `${userLabels[id]} (ID:${id})` : `ID:${id}`
          )
        }
        return map
      })
    }
  }, [open, groupName, initialUserIds, userLabels])

  // Server-side search: empty keyword returns the most recent users (id desc),
  // typing searches username / email / display_name / id across ALL users.
  const { data: searchResults } = useQuery({
    queryKey: ['group-exclusive-user-search', debouncedKeyword],
    queryFn: async () => {
      const res = await searchUsers({
        keyword: debouncedKeyword,
        page_size: 20,
      })
      return res.success ? res.data?.items || [] : []
    },
    enabled: open,
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (!searchResults) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabelCache((prev) => {
      const map = new Map(prev)
      for (const u of searchResults) {
        map.set(String(u.id), `${u.username} (ID:${u.id})`)
      }
      return map
    })
  }, [searchResults])

  const userOptions = useMemo<Option[]>(() => {
    const map = new Map<string, string>()
    // Selected users stay resolvable via the cache.
    for (const id of selectedUsers) {
      const label = labelCache.get(id)
      if (label) map.set(id, label)
    }
    for (const u of searchResults || []) {
      map.set(String(u.id), `${u.username} (ID:${u.id})`)
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }))
  }, [selectedUsers, searchResults, labelCache])

  const handleSave = async () => {
    const group = isEdit ? groupName : selectedGroup
    if (!group) {
      toast.error(t('Please select a group'))
      return
    }
    setSaving(true)
    try {
      const res = await setExclusiveGroup(group, selectedUsers.map(Number))
      if (res.success) {
        toast.success(t('Saved successfully'))
        onOpenChange(false)
        onSaved()
      } else {
        toast.error(res.message || t('Save failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        isEdit
          ? `${t('Edit authorization')}: ${groupName}`
          : t('New exclusive group')
      }
      contentClassName='sm:max-w-lg'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <div className='flex justify-end gap-2'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {t('Save')}
          </Button>
        </div>
      }
    >
      {!isEdit && (
        <div className='space-y-1.5'>
          <Label>{t('Select group')}</Label>
          <Select
            value={selectedGroup}
            onValueChange={(v) => setSelectedGroup(v ?? '')}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t('Select a group to make exclusive')}
              />
            </SelectTrigger>
            <SelectContent>
              {availableGroups.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableGroups.length === 0 && (
            <p className='text-muted-foreground text-xs'>
              {t('No groups available (define one in group ratios first)')}
            </p>
          )}
        </div>
      )}
      <div className='space-y-1.5'>
        <Label>{t('Authorized users')}</Label>
        <MultiSelect
          options={userOptions}
          selected={selectedUsers}
          onChange={setSelectedUsers}
          onInputValueChange={setKeyword}
          placeholder={t('Search by username, email, name or ID')}
          emptyText={t('No users')}
        />
        <p className='text-muted-foreground text-xs'>
          {t('Leave empty and save = remove the exclusivity of this group')}
        </p>
      </div>
    </Dialog>
  )
}
