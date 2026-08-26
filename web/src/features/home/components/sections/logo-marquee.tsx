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

import { getLobeIcon } from '@/lib/lobe-icon'

interface ModelEntry {
  name: string
  icon: string
}

// Frontier models reachable through the gateway. Icons resolve via
// @lobehub/icons (see src/lib/lobe-icon.tsx for the "Name.Color" syntax).
const MODELS: readonly ModelEntry[] = [
  { name: 'OpenAI', icon: 'OpenAI' },
  { name: 'Claude', icon: 'Claude.Color' },
  { name: 'Gemini', icon: 'Gemini.Color' },
  { name: 'DeepSeek', icon: 'DeepSeek.Color' },
  { name: 'Qwen', icon: 'Qwen.Color' },
  { name: 'Grok', icon: 'Grok.Color' },
  { name: 'Kimi', icon: 'Moonshot.Color' },
  { name: 'Doubao', icon: 'Doubao.Color' },
  { name: 'Mistral', icon: 'Mistral.Color' },
  { name: 'GLM', icon: 'Zhipu.Color' },
  { name: 'MiniMax', icon: 'Minimax.Color' },
  { name: 'Hunyuan', icon: 'Hunyuan.Color' },
] as const

/**
 * Seamless horizontal marquee of the model brands reachable through the
 * gateway. The track renders the list twice and animates translateX(-50%)
 * (see `.animate-marquee-x` in index.css); edges fade out via a mask and the
 * animation pauses on hover and under prefers-reduced-motion.
 */
export function LogoMarquee() {
  const { t } = useTranslation()

  return (
    <section className='border-border/40 bg-muted/10 relative z-10 border-y py-10'>
      <p className='text-muted-foreground mb-7 px-6 text-center text-xs font-medium tracking-widest uppercase'>
        {t('One gateway, every frontier model')}
      </p>
      <div className='marquee-container relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]'>
        <div className='animate-marquee-x flex w-max items-center gap-12 pr-12'>
          {[0, 1].map((copy) =>
            MODELS.map((m) => (
              <div
                key={`${m.name}-${copy}`}
                aria-hidden={copy === 1}
                className='flex items-center gap-2.5 opacity-55 transition-opacity duration-300 hover:opacity-100'
              >
                {getLobeIcon(m.icon, 24)}
                <span className='text-muted-foreground text-sm font-medium whitespace-nowrap'>
                  {m.name}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
