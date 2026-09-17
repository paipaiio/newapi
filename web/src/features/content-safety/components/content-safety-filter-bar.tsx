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
import { getRouteApi } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const route = getRouteApi('/_authenticated/content-safety/')

type Draft = {
  username: string
  model_name: string
  policy: string
  action: string
  review_status: string
}

export function ContentSafetyFilterBar() {
  const { t } = useTranslation()
  const navigate = route.useNavigate()
  const search = route.useSearch()

  const [draft, setDraft] = useState<Draft>(() => ({
    username: search.username ?? '',
    model_name: search.model_name ?? '',
    policy: search.policy ?? 'all',
    action: search.action ?? 'all',
    review_status: search.review_status ?? 'all',
  }))

  useEffect(() => {
    setDraft({
      username: search.username ?? '',
      model_name: search.model_name ?? '',
      policy: search.policy ?? 'all',
      action: search.action ?? 'all',
      review_status: search.review_status ?? 'all',
    })
  }, [
    search.username,
    search.model_name,
    search.policy,
    search.action,
    search.review_status,
  ])

  const apply = () => {
    navigate({
      search: {
        ...search,
        page: 1,
        username: draft.username || undefined,
        model_name: draft.model_name || undefined,
        policy: draft.policy === 'all' ? undefined : draft.policy || undefined,
        action: draft.action === 'all' ? undefined : draft.action || undefined,
        review_status:
          draft.review_status === 'all'
            ? undefined
            : draft.review_status || undefined,
      },
    })
  }

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          value={draft.username}
          onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
          }}
          placeholder={t('Username')}
          className='w-[140px]'
          aria-label={t('Username')}
        />
        <Input
          value={draft.model_name}
          onChange={(e) =>
            setDraft((d) => ({ ...d, model_name: e.target.value }))
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
          }}
          placeholder={t('Model')}
          className='w-[160px]'
          aria-label={t('Model')}
        />
        <Select
          items={[
            { value: 'all', label: t('All policies') },
            { value: 'standard', label: t('standard') },
            { value: 'uncensored', label: t('uncensored') },
          ]}
          value={draft.policy}
          onValueChange={(value) =>
            setDraft((d) => ({ ...d, policy: value ?? 'all' }))
          }
        >
          <SelectTrigger className='w-[140px]' aria-label={t('Policy')}>
            <SelectValue placeholder={t('Policy')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value='all'>{t('All policies')}</SelectItem>
              <SelectItem value='standard'>{t('standard')}</SelectItem>
              <SelectItem value='uncensored'>{t('uncensored')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          items={[
            { value: 'all', label: t('All actions') },
            { value: 'block', label: t('block') },
            { value: 'review', label: t('review') },
          ]}
          value={draft.action}
          onValueChange={(value) =>
            setDraft((d) => ({ ...d, action: value ?? 'all' }))
          }
        >
          <SelectTrigger className='w-[130px]' aria-label={t('Action')}>
            <SelectValue placeholder={t('Action')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value='all'>{t('All actions')}</SelectItem>
              <SelectItem value='block'>{t('block')}</SelectItem>
              <SelectItem value='review'>{t('review')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          items={[
            { value: 'all', label: t('All reviews') },
            { value: 'pending', label: t('pending') },
            { value: 'reviewed', label: t('reviewed') },
            { value: 'dismissed', label: t('dismissed') },
            { value: 'banned', label: t('banned') },
          ]}
          value={draft.review_status}
          onValueChange={(value) =>
            setDraft((d) => ({ ...d, review_status: value ?? 'all' }))
          }
        >
          <SelectTrigger className='w-[140px]' aria-label={t('Review')}>
            <SelectValue placeholder={t('Review')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value='all'>{t('All reviews')}</SelectItem>
              <SelectItem value='pending'>{t('pending')}</SelectItem>
              <SelectItem value='reviewed'>{t('reviewed')}</SelectItem>
              <SelectItem value='dismissed'>{t('dismissed')}</SelectItem>
              <SelectItem value='banned'>{t('banned')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button type='button' size='sm' onClick={apply}>
          <Search className='size-4' />
          {t('Search')}
        </Button>
      </div>
    </div>
  )
}
