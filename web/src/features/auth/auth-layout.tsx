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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    // min-h-svh + overflow-x-hidden: page grows with content on mobile so the
    // form can be scrolled to bottom (e.g. the legal-consent checkbox). We only
    // clip horizontal overflow to contain the blur-ball decorations.
    <div className='relative min-h-svh max-w-none overflow-x-hidden'>
      {/* Brand blur balls (indigo/teal), ported from the classic theme */}
      <div aria-hidden className='blur-ball blur-ball-indigo -z-10' />
      <div aria-hidden className='blur-ball blur-ball-teal -z-10' />
      <Link
        to='/'
        className='absolute top-4 left-4 z-10 flex items-center gap-2 transition-opacity hover:opacity-80 sm:top-8 sm:left-8'
      >
        <div className='relative h-8 w-8'>
          {loading ? (
            <Skeleton className='absolute inset-0 rounded-full' />
          ) : (
            <img
              src={logo}
              alt={t('Logo')}
              className='h-8 w-8 rounded-full object-cover'
            />
          )}
        </div>
        {loading ? (
          <Skeleton className='h-6 w-24' />
        ) : (
          <h1 className='text-xl font-medium'>{systemName}</h1>
        )}
      </Link>
      {/* On mobile: natural block flow with padding so form is fully reachable.
          On sm+: full-height flex column so the form stays vertically centred. */}
      <div className='container px-4 pt-20 pb-10 sm:flex sm:min-h-svh sm:items-center sm:px-6 sm:py-0'>
        <div className='mx-auto w-full sm:w-[480px] sm:p-8'>{children}</div>
      </div>
    </div>
  )
}
