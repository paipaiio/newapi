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
import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MultiSelect, type Option } from '@/components/multi-select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

import { searchUsers } from '@/features/users/api'
import { useDebounce } from '@/hooks'

import { getUserGroupsPreview } from '../api'

/**
 * Admin tool: pick any user and see exactly which groups they can select and
 * which ratio applies to each — the same view the user's token page gets.
 */
export function UserPerspectivePreview() {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword, 300)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [labelCache, setLabelCache] = useState<Map<string, string>>(new Map())

  const { data: searchResults } = useQuery({
    queryKey: ['group-mgmt-user-search', debouncedKeyword],
    queryFn: async () => {
      const res = await searchUsers({
        keyword: debouncedKeyword,
        page_size: 20,
      })
      return res.success ? res.data?.items || [] : []
    },
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
    if (selectedUserId) {
      const label = labelCache.get(selectedUserId)
      if (label) map.set(selectedUserId, label)
    }
    for (const u of searchResults || []) {
      map.set(String(u.id), `${u.username} (ID:${u.id})`)
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }))
  }, [selectedUserId, searchResults, labelCache])

  const { data: preview, isFetching } = useQuery({
    queryKey: ['user-groups-preview', selectedUserId],
    queryFn: async () => {
      const res = await getUserGroupsPreview(Number(selectedUserId))
      return res.success ? res.data : null
    },
    enabled: !!selectedUserId,
  })

  const groupRows = useMemo(() => {
    if (!preview?.groups) return []
    return Object.entries(preview.groups)
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) =>
        a.name === 'auto' ? -1 : b.name === 'auto' ? 1 : a.name.localeCompare(b.name)
      )
  }, [preview])

  return (
    <div className='space-y-4'>
      <div className='max-w-md space-y-1.5'>
        <MultiSelect
          options={userOptions}
          selected={selectedUserId ? [selectedUserId] : []}
          onChange={(values) =>
            setSelectedUserId(values[values.length - 1] ?? '')
          }
          onInputValueChange={setKeyword}
          placeholder={t('Search by username, email, name or ID')}
          emptyText={t('No users')}
          maxVisibleChips={1}
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            'Pick a user to see exactly the groups and ratios shown on their token / pricing pages.'
          )}
        </p>
      </div>

      {!selectedUserId && (
        <div className='text-muted-foreground flex flex-col items-center gap-3 py-12'>
          <Eye className='size-10 opacity-40' />
          <span>{t('Select a user to preview their perspective')}</span>
        </div>
      )}

      {selectedUserId && isFetching && (
        <div className='space-y-2'>
          {['a', 'b', 'c'].map((k) => (
            <Skeleton key={k} className='h-10 w-full' />
          ))}
        </div>
      )}

      {selectedUserId && preview && !isFetching && (
        <div className='space-y-3'>
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <span className='font-medium'>{preview.username}</span>
            <span className='text-muted-foreground'>
              ID:{preview.user_id}
            </span>
            <Badge variant='outline'>
              {t('User group')}: {preview.group}
            </Badge>
          </div>
          <div className='overflow-hidden rounded-lg border'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='bg-muted/50 border-b'>
                  <th className='px-3 py-2 text-left font-medium'>
                    {t('Group')}
                  </th>
                  <th className='px-3 py-2 text-left font-medium'>
                    {t('Description')}
                  </th>
                  <th className='px-3 py-2 text-right font-medium'>
                    {t('Ratio')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((row) => (
                  <tr key={row.name} className='border-b last:border-0'>
                    <td className='px-3 py-2 font-medium'>{row.name}</td>
                    <td className='text-muted-foreground px-3 py-2'>
                      {row.desc}
                    </td>
                    <td className='px-3 py-2 text-right'>
                      {typeof row.ratio === 'number' ? `${row.ratio}x` : row.ratio}
                    </td>
                  </tr>
                ))}
                {groupRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className='text-muted-foreground px-3 py-6 text-center'
                    >
                      {t('No groups visible to this user')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
