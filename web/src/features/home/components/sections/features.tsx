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
import { Boxes, Layers, ScrollText, Timer } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

interface FeaturesProps {
  className?: string
}

export function Features(_props: FeaturesProps) {
  const { t } = useTranslation()

  const features = [
    {
      id: 'fast-onboarding',
      title: t('Integrate in one minute'),
      desc: t(
        'Swap the Base URL to connect — no changes to your business code required.'
      ),
      icon: <Timer className='size-5 text-blue-500' strokeWidth={1.75} />,
      accent: 'bg-blue-500/10',
    },
    {
      id: 'four-entries',
      title: t('Four entry types'),
      desc: t(
        'OpenAI, Claude, Gemini and Video protocols unified behind one gateway.'
      ),
      icon: <Layers className='size-5 text-violet-500' strokeWidth={1.75} />,
      accent: 'bg-violet-500/10',
    },
    {
      id: 'traceable-logs',
      title: t('Traceable logs'),
      desc: t(
        'Every call is auditable, with real-time usage and billing transparency.'
      ),
      icon: (
        <ScrollText className='size-5 text-emerald-500' strokeWidth={1.75} />
      ),
      accent: 'bg-emerald-500/10',
    },
    {
      id: 'group-isolation',
      title: t('Group isolation'),
      desc: t(
        'Isolate quota and permissions per group so multiple teams share safely.'
      ),
      icon: <Boxes className='size-5 text-amber-500' strokeWidth={1.75} />,
      accent: 'bg-amber-500/10',
    },
  ]

  return (
    <section className='relative z-10 px-6 py-24 md:py-28'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-14 max-w-lg'>
          <p className='text-muted-foreground mb-3 text-xs font-medium tracking-widest uppercase'>
            {t('Core Capabilities')}
          </p>
          <h2 className='text-2xl leading-tight font-bold tracking-tight md:text-3xl'>
            {t('Built for high-frequency AI calls')}
          </h2>
        </AnimateInView>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {features.map((f, i) => (
            <AnimateInView
              key={f.id}
              delay={i * 100}
              animation='scale-in'
              className='border-border/50 bg-card/40 group hover:border-border hover:bg-card/70 rounded-2xl border p-6 backdrop-blur-xs transition-colors duration-300'
            >
              <div
                className={`mb-4 flex size-11 items-center justify-center rounded-xl ${f.accent}`}
              >
                {f.icon}
              </div>
              <h3 className='mb-2 text-base font-semibold'>{f.title}</h3>
              <p className='text-muted-foreground text-sm leading-relaxed'>
                {f.desc}
              </p>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
