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
import { Settings, Zap, BarChart3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

import { AccessCard } from '../access-card'

/**
 * Numbered onboarding sequence (order carries real meaning here: it is the
 * actual setup flow) paired with the live AccessCard — the artifact the
 * "Connect" step produces.
 */
export function HowItWorks() {
  const { t } = useTranslation()

  const steps = [
    {
      num: '01',
      title: t('Configure'),
      desc: t(
        'Add your API keys, set up channels and configure access permissions'
      ),
      icon: <Settings className='size-4.5' strokeWidth={1.75} />,
      accent:
        'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-400',
    },
    {
      num: '02',
      title: t('Connect'),
      desc: t(
        'Connect through OpenAI, Claude, Gemini, and other compatible API routes'
      ),
      icon: <Zap className='size-4.5' strokeWidth={1.75} />,
      accent:
        'border-teal-500/30 bg-teal-500/10 text-teal-600 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-400',
    },
    {
      num: '03',
      title: t('Monitor'),
      desc: t('Track usage, costs and performance with real-time analytics'),
      icon: <BarChart3 className='size-4.5' strokeWidth={1.75} />,
      accent:
        'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-400',
    },
  ]

  return (
    <section className='border-border/40 relative z-10 border-t px-6 py-24 md:py-32'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-14 max-w-lg md:mb-16'>
          <p className='text-muted-foreground mb-3 text-xs font-medium tracking-widest uppercase'>
            {t('How It Works')}
          </p>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t('Three steps to get started')}
          </h2>
        </AnimateInView>

        <div className='grid items-center gap-14 lg:grid-cols-2 lg:gap-16'>
          {/* Steps — vertical sequence with a connecting rail */}
          <ol className='relative flex flex-col gap-10'>
            {/* Connecting rail behind the step badges */}
            <div
              aria-hidden
              className='from-indigo-500/40 via-teal-500/30 absolute top-4 bottom-4 left-[1.375rem] w-px bg-gradient-to-b to-transparent'
            />
            {steps.map((step, i) => (
              <AnimateInView
                as='li'
                key={step.num}
                delay={i * 120}
                animation='fade-up'
                className='relative flex items-start gap-5'
              >
                <div
                  className={`relative z-10 flex size-11 shrink-0 items-center justify-center rounded-xl border backdrop-blur-xs ${step.accent}`}
                >
                  {step.icon}
                </div>
                <div className='pt-0.5'>
                  <p className='text-muted-foreground/60 mb-1 font-mono text-[11px] font-medium tracking-widest'>
                    {step.num}
                  </p>
                  <h3 className='mb-1.5 text-base font-semibold'>
                    {step.title}
                  </h3>
                  <p className='text-muted-foreground max-w-md text-sm leading-relaxed'>
                    {step.desc}
                  </p>
                </div>
              </AnimateInView>
            ))}
          </ol>

          {/* The artifact of step 02: a live access card with the real base URL */}
          <AnimateInView
            animation='fade-left'
            delay={200}
            className='flex justify-center lg:justify-end'
          >
            <AccessCard className='w-full max-w-md' />
          </AnimateInView>
        </div>
      </div>
    </section>
  )
}
