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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface CacheWindow {
  reqs?: number
  cache_hit?: number
  cache_read?: number
  cache_write?: number
  prompt_tokens?: number
}

interface UserCacheData {
  windows?: Record<string, CacheWindow>
}

const WINDOWS = ['24h', '7d', '30d'] as const
type Win = (typeof WINDOWS)[number]

function pct(v: number | undefined): string {
  if (v == null) return '—'
  return `${v >= 100 ? '100' : v.toFixed(2)}%`
}

function knum(n: number | undefined): string {
  if (n == null) return '—'
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return `${n}`
}

export function CacheHitPanel() {
  const { t } = useTranslation()
  const [win, setWin] = useState<Win>('24h')

  const { data } = useQuery<UserCacheData>({
    queryKey: ['user-cache-metrics'],
    queryFn: async () => {
      const res = await api.get('/api/tt-status/api/usercache')
      return res.data
    },
    staleTime: 5 * 60 * 1000,
  })

  // Hide entirely when the status monitor returns no windowed data.
  if (!data?.windows) return null
  const w = data.windows[win]

  return (
    <div className='rounded-2xl border p-4 sm:p-5'>
      <div className='mb-3 flex items-center gap-2'>
        <div className='text-sm font-semibold sm:text-[15px]'>
          {t('Cache hit rate')}
        </div>
        <div className='ml-auto flex gap-1.5'>
          {WINDOWS.map((x) => (
            <Button
              key={x}
              variant={x === win ? 'default' : 'outline'}
              size='sm'
              className='h-6 rounded-full px-2.5 text-xs'
              onClick={() => setWin(x)}
            >
              {x}
            </Button>
          ))}
        </div>
      </div>

      {w?.reqs ? (
        <div className='flex flex-wrap items-end gap-6'>
          <div>
            <div className='text-3xl leading-tight font-bold tabular-nums'>
              {pct(w.cache_hit)}
            </div>
            <div className='text-muted-foreground mt-1 text-xs'>
              {t('Cached input tokens as a share of total input tokens')}
            </div>
          </div>
          <div className='grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4'>
            {[
              [t('Cached input tokens'), knum(w.cache_read)],
              [t('Cache-written tokens'), knum(w.cache_write)],
              [t('Total input tokens'), knum(w.prompt_tokens)],
              [t('Requests'), knum(w.reqs)],
            ].map(([label, value]) => (
              <div key={label}>
                <div className='font-medium tabular-nums'>{value}</div>
                <div className='text-muted-foreground text-[11px]'>{label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={cn('text-muted-foreground py-3 text-sm')}>
          {t('No cache data for this window yet.')}
        </div>
      )}
    </div>
  )
}
