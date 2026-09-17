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
import {
  ArrowRight,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'

import { HeroTerminalDemo } from '../hero-terminal-demo'
import { ParticleField } from '../particle-field'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

const DEFAULT_QUOTA_PER_UNIT = 500000

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()

  const quotaPerUnit =
    (status?.quota_per_unit as number | undefined) || DEFAULT_QUOTA_PER_UNIT

  // Convert an internal quota amount to a human-facing figure; null hides the pill.
  const fmtQuota = (quota?: number): string | null => {
    if (!quota || quota <= 0) return null
    const value = quota / quotaPerUnit
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }

  const newUserReward = fmtQuota(
    status?.quota_for_new_user as number | undefined
  )
  const inviterReward = fmtQuota(
    status?.quota_for_inviter as number | undefined
  )
  const emailVerifyEnabled = Boolean(status?.email_verification)

  return (
    <section className='relative z-10 overflow-hidden px-6 pt-24 pb-16 md:pt-32 md:pb-24 lg:pt-36 lg:pb-28'>
      {/* Radial gradient background — brand indigo + teal, slowly drifting */}
      <div
        aria-hidden
        className='landing-aurora pointer-events-none absolute -inset-16 -z-10 opacity-25 dark:opacity-[0.12]'
        style={{
          background: [
            'radial-gradient(ellipse 60% 50% at 20% 20%, oklch(0.62 0.19 273 / 70%) 0%, transparent 70%)',
            'radial-gradient(ellipse 50% 40% at 80% 15%, oklch(0.70 0.13 175 / 55%) 0%, transparent 70%)',
            'radial-gradient(ellipse 40% 35% at 40% 80%, oklch(0.62 0.15 273 / 35%) 0%, transparent 70%)',
          ].join(', '),
        }}
      />
      {/* 3D particle network, drifting toward the camera */}
      <ParticleField />
      {/* Brand blur balls (indigo/teal), ported from the classic theme */}
      <div aria-hidden className='blur-ball blur-ball-indigo -z-10' />
      <div aria-hidden className='blur-ball blur-ball-teal -z-10' />

      <div className='mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8'>
        {/* Left Column: brand copy, actions, reward pills */}
        <div className='flex flex-col items-start text-left lg:col-span-6'>
          {/* Top Pill Badge */}
          <div
            className='landing-animate-fade-up mb-5 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-3 py-1.5 text-[11px] font-medium text-indigo-600 opacity-0 shadow-xs dark:border-indigo-400/20 dark:bg-indigo-400/5 dark:text-indigo-400'
            style={{ animationDelay: '0ms' }}
          >
            <span className='relative flex size-1.5'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75' />
              <span className='relative inline-flex size-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400' />
            </span>
            <span>{t('OpenAI / Claude / Gemini / Veo unified access')}</span>
          </div>

          <h1
            className='landing-animate-fade-up text-[clamp(2.25rem,4.5vw,3.25rem)] leading-[1.15] font-bold tracking-tight'
            style={{ animationDelay: '60ms' }}
          >
            {t('One Base URL, connect your')}
            <br />
            <span className='shine-text text-indigo-500 dark:text-indigo-400'>
              {t('production-grade AI workflow')}
            </span>
          </h1>
          <p
            className='landing-animate-fade-up text-muted-foreground/80 mt-5 max-w-xl text-base leading-relaxed opacity-0 md:text-[15px]'
            style={{ animationDelay: '120ms' }}
          >
            {t(
              'Unified model interface, group isolation, transparent pricing, and full log tracing — everything a high-frequency AI stack needs.'
            )}
          </p>

          <div
            className='landing-animate-fade-up mt-8 flex flex-wrap items-center gap-3 opacity-0'
            style={{ animationDelay: '180ms' }}
          >
            <Button
              className='group h-11 rounded-lg px-5 text-sm font-medium'
              render={<Link to='/dashboard' />}
            >
              {t('Enter Console')}
              <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
            </Button>
            <Button
              variant='outline'
              className='border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
              render={<Link to='/pricing' />}
            >
              {t('View Model Pricing')}
            </Button>
            <Button
              variant='outline'
              className='group border-border/50 hover:border-border hover:bg-muted/50 inline-flex h-11 items-center gap-1.5 rounded-lg px-5 text-sm font-medium'
              render={
                <Link to={props.isAuthenticated ? '/keys' : '/sign-up'} />
              }
            >
              <KeyRound className='text-muted-foreground/80 group-hover:text-foreground size-4 transition-colors duration-200' />
              <span>{t('Create API Key')}</span>
            </Button>
          </div>

          {/* Reward pills (rendered only when the corresponding value is set) */}
          {(newUserReward || inviterReward || emailVerifyEnabled) && (
            <div
              className='landing-animate-fade-up mt-8 flex flex-wrap items-center gap-2.5 opacity-0'
              style={{ animationDelay: '240ms' }}
            >
              {newUserReward && (
                <span className='border-border/40 bg-muted/20 text-muted-foreground/90 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur-xs'>
                  <Sparkles className='size-3.5 text-amber-500' />
                  {t('Sign up for {{amount}} credits', {
                    amount: newUserReward,
                  })}
                </span>
              )}
              {inviterReward && (
                <span className='border-border/40 bg-muted/20 text-muted-foreground/90 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur-xs'>
                  <Users className='size-3.5 text-indigo-500' />
                  {t('Invite friends, {{amount}} credits each', {
                    amount: inviterReward,
                  })}
                </span>
              )}
              {emailVerifyEnabled && (
                <span className='border-border/40 bg-muted/20 text-muted-foreground/90 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur-xs'>
                  <ShieldCheck className='size-3.5 text-emerald-500' />
                  {t('Email verification enabled')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right Column: live multi-protocol API terminal demo */}
        <div
          className='landing-animate-fade-left relative flex w-full justify-center opacity-0 lg:col-span-6 lg:justify-end'
          style={{ animationDelay: '320ms' }}
        >
          {/* Brand glow behind the terminal window, gently pulsing */}
          <div
            aria-hidden
            className='landing-glow-pulse pointer-events-none absolute -inset-8 -z-10 opacity-50 blur-3xl dark:opacity-30'
            style={{
              background: [
                'radial-gradient(ellipse 55% 45% at 35% 30%, rgba(99, 102, 241, 0.45) 0%, transparent 70%)',
                'radial-gradient(ellipse 45% 40% at 70% 70%, rgba(20, 184, 166, 0.35) 0%, transparent 70%)',
              ].join(', '),
            }}
          />
          <HeroTerminalDemo className='mt-8 w-full transition-transform duration-500 hover:-translate-y-1 lg:mt-0 lg:max-w-xl' />
        </div>
      </div>
    </section>
  )
}
