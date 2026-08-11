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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import { PRIMARY_ENDPOINT } from '../constants'

interface AccessCardProps {
  className?: string
}

// A provider row: colored provider name + endpoint tags + optional note.
interface ProviderRow {
  provider: string
  accent: string
  tags: string[]
  note?: string
}

/**
 * "接入地址" card shown on the right side of the hero. Displays the live base
 * URL (dynamic: backend `server_address`, falling back to the current origin)
 * plus the primary endpoint and the compatible provider routes. Mirrors the
 * classic theme's home page card, adapted to the default theme's design tokens.
 */
export function AccessCard({ className }: AccessCardProps) {
  const { t } = useTranslation()
  const { status } = useStatus()

  const baseUrl =
    (status?.server_address as string | undefined) ||
    (typeof window !== 'undefined' ? window.location.origin : '')

  const providers: ProviderRow[] = [
    {
      provider: 'OpenAI',
      accent: 'text-emerald-500 dark:text-emerald-400',
      tags: ['Chat', 'Responses', 'Embeddings', 'Images'],
    },
    {
      provider: 'Claude',
      accent: 'text-amber-500 dark:text-amber-400',
      tags: ['Messages'],
      note: t('Compatible interface, tuned for Claude Code'),
    },
    {
      provider: 'Video',
      accent: 'text-violet-500 dark:text-violet-400',
      tags: ['Veo'],
      note: t('Task submission with task_id polling'),
    },
  ]

  return (
    <div
      className={cn(
        'glass-2 w-full max-w-md overflow-hidden rounded-2xl shadow-sm',
        className
      )}
    >
      {/* Header: line status + base URL + primary endpoint */}
      <div className='border-border/50 border-b px-5 py-4'>
        <div className='mb-3 flex items-center gap-2'>
          <span className='relative flex size-2'>
            <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
            <span className='relative inline-flex size-2 rounded-full bg-emerald-500' />
          </span>
          <span className='text-muted-foreground text-xs font-medium'>
            {t('Primary route available')}
          </span>
          <span className='text-muted-foreground/40 ml-auto text-[10px] font-bold tracking-[0.15em] uppercase'>
            {t('Base URL')}
          </span>
        </div>
        <div className='bg-muted/40 border-border/40 flex items-center gap-2 rounded-lg border px-3 py-2'>
          <code className='min-w-0 flex-1 truncate font-mono text-sm'>
            <span className='text-foreground'>{baseUrl}</span>
            <span className='text-blue-500 dark:text-blue-400'>
              {PRIMARY_ENDPOINT}
            </span>
          </code>
          <CopyButton
            value={`${baseUrl}${PRIMARY_ENDPOINT}`}
            size='icon'
            variant='ghost'
            className='size-7'
            iconClassName='size-3.5'
            tooltip={t('Copy to clipboard')}
          />
        </div>
      </div>

      {/* Provider rows */}
      <div className='divide-border/40 divide-y'>
        {providers.map((p) => (
          <div
            key={p.provider}
            className='flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3'
          >
            <span
              className={cn('w-16 shrink-0 text-sm font-semibold', p.accent)}
            >
              {p.provider}
            </span>
            <div className='flex flex-wrap items-center gap-1.5'>
              {p.tags.map((tag) => (
                <span
                  key={tag}
                  className='border-border/40 bg-muted/30 text-muted-foreground rounded-md border px-2 py-0.5 font-mono text-[11px]'
                >
                  {tag}
                </span>
              ))}
            </div>
            {p.note && (
              <span className='text-muted-foreground/60 w-full text-xs sm:w-auto'>
                {p.note}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Auth bar */}
      <div className='bg-foreground/90 px-5 py-3 dark:bg-black/40'>
        <code className='font-mono text-[11px] text-white/80 dark:text-white/70'>
          <span className='text-blue-300'>Authorization:</span> Bearer{' '}
          <span className='text-emerald-300'>YOUR_API_KEY</span>
        </code>
      </div>
    </div>
  )
}
