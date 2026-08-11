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

import { cn } from '@/lib/utils'

import { fms, fmtBarTime, fp } from '../lib/format'
import type {
  ComponentMetrics,
  ComponentStatus,
  StatusComponent,
  StatusWindow,
  UptimeBar,
} from '../types'

const STATUS_PILL: Record<
  ComponentStatus,
  { label: string; className: string }
> = {
  operational: {
    label: 'Operational',
    className:
      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
  },
  degraded: {
    label: 'Degraded',
    className:
      'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
  },
  down: {
    label: 'Down',
    className: 'bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30',
  },
  maintenance: {
    label: 'Maintenance',
    className:
      'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30',
  },
  nodata: {
    label: 'No data',
    className: 'bg-muted text-muted-foreground border-border',
  },
}

const BAR_COLOR: Record<string, string> = {
  operational: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  down: 'bg-red-500',
}

/** Latency sparkline over the last hour. */
function Sparkline({ series }: { series: { ms: number }[] }) {
  const { t } = useTranslation()
  if (!series || series.length < 2) {
    return (
      <div className='text-muted-foreground py-4 text-center text-xs'>
        {t('Latency history is accumulating, check back later.')}
      </div>
    )
  }
  const W = 780
  const H = 80
  const p = 6
  const ms = series.map((s) => s.ms)
  let mx = Math.max(...ms)
  const mn = Math.min(...ms)
  if (mx === mn) mx = mn + 1
  const pts = series.map((s, i) => [
    p + ((W - 2 * p) * i) / (series.length - 1),
    p + (H - 2 * p) * (1 - (s.ms - mn) / (mx - mn)),
  ])
  const d = `M${pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L ')}`
  const firstX = (pts.at(0) ?? [0])[0]
  const lastX = (pts.at(-1) ?? [0])[0]
  const area = `${d} L ${lastX.toFixed(1)} ${H} L ${firstX.toFixed(1)} ${H} Z`
  const currentMs = ms.at(-1) ?? 0
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width='100%'
        height='80'
        preserveAspectRatio='none'
      >
        <defs>
          <linearGradient id='tt-lg' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='currentColor' stopOpacity='.22' />
            <stop offset='1' stopColor='currentColor' stopOpacity='0' />
          </linearGradient>
        </defs>
        <path d={area} fill='url(#tt-lg)' className='text-primary' />
        <path
          d={d}
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinejoin='round'
          className='text-primary'
        />
      </svg>
      <div className='text-muted-foreground flex justify-between text-[11px]'>
        <span>{mn} ms</span>
        <span>
          {t('Now')} {currentMs} ms
        </span>
        <span>
          {t('Peak')} {mx} ms
        </span>
      </div>
    </>
  )
}

/** Uptime bar strip. */
function UptimeBars({ arr, win }: { arr?: UptimeBar[]; win: StatusWindow }) {
  return (
    <div className='flex h-8 items-stretch gap-[2px]'>
      {(arr || []).map((x) => {
        const color = x.status ? BAR_COLOR[x.status] || 'bg-muted' : 'bg-muted'
        const tip = `${fmtBarTime(x.t, win)}${
          x.pct == null
            ? ''
            : ` · ${x.pct}%${x.ms != null ? ` · ${x.ms}ms` : ''}`
        }`
        return (
          <span
            key={x.t}
            title={tip}
            className={cn('flex-1 rounded-[1px]', color)}
          />
        )
      })}
    </div>
  )
}

/** Public metric tiles (cache hit / success rate / TTFT). */
function MetricsRow({ m }: { m?: ComponentMetrics }) {
  const { t } = useTranslation()
  if (!m) return null
  const tiles: [string, string][] = []
  if (m.cache_hit != null) tiles.push([t('Cache hit · 24h'), fp(m.cache_hit)])
  if (m.success != null) tiles.push([t('Success rate · 24h'), fp(m.success)])
  if (m.ttft_p50 != null) tiles.push([t('TTFT P50 · 1h'), fms(m.ttft_p50)])
  if (m.ttft_p95 != null) tiles.push([t('TTFT P95 · 1h'), fms(m.ttft_p95)])
  if (tiles.length === 0) return null
  return (
    <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
      {tiles.map(([k, v]) => (
        <div key={k} className='bg-muted/40 rounded-md px-3 py-2 text-center'>
          <div className='text-base font-semibold'>{v}</div>
          <div className='text-muted-foreground text-[11px]'>{k}</div>
        </div>
      ))}
    </div>
  )
}

export function ComponentCard({
  component,
  win,
}: {
  component: StatusComponent
  win: StatusWindow
}) {
  const { t } = useTranslation()
  const pill = STATUS_PILL[component.status] || STATUS_PILL.nodata
  const u = component.uptime || {}
  const up = u[win]
  const upTxt =
    up == null ? t('Accumulating data…') : `${t('Uptime')} ${fp(up)}`
  const isGateway = component.key === 'gateway'

  return (
    <div className='space-y-3 rounded-xl border p-4'>
      <div className='flex items-start justify-between gap-2'>
        <div>
          <div className='font-medium'>{component.name}</div>
          {component.desc && (
            <div className='text-muted-foreground text-xs'>
              {component.desc}
            </div>
          )}
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
            pill.className
          )}
        >
          {t(pill.label)}
        </span>
      </div>

      {isGateway && (
        <>
          <div className='grid grid-cols-3 gap-2 sm:grid-cols-5'>
            {[
              [
                t('Response time'),
                component.latency_ms != null
                  ? `${component.latency_ms} ms`
                  : '—',
              ],
              ['90m', fp(u['90m'])],
              ['24h', fp(u['24h'])],
              ['7d', fp(u['7d'])],
              ['30d', fp(u['30d'])],
            ].map(([k, v]) => (
              <div
                key={k}
                className='bg-muted/40 rounded-md px-2 py-2 text-center'
              >
                <div className='text-sm font-semibold'>{v}</div>
                <div className='text-muted-foreground text-[11px]'>{k}</div>
              </div>
            ))}
          </div>
          <MetricsRow m={component.metrics} />
        </>
      )}

      <UptimeBars arr={component.bars?.[win]} win={win} />
      <div className='text-muted-foreground flex justify-between text-xs'>
        <span>{upTxt}</span>
        <span>
          {component.latency_ms != null
            ? `${t('Latency')} ${component.latency_ms} ms`
            : ''}
        </span>
      </div>

      {!isGateway && <MetricsRow m={component.metrics} />}

      {component.latency_60m && component.latency_60m.length > 0 && (
        <div>
          <div className='text-muted-foreground mb-1 text-xs font-medium'>
            {t('Response time · last hour')}
          </div>
          <Sparkline series={component.latency_60m} />
        </div>
      )}
    </div>
  )
}
