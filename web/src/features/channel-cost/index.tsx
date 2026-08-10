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
import { RotateCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import { getChannelCostStats, getProfitReport } from './api'
import type { ChannelCostRow } from './types'

function fmt(n: number | undefined): string {
  return n == null ? '-' : `$${n.toFixed(4)}`
}
function fmtPct(n: number | undefined): string {
  return n == null ? '-' : `${n.toFixed(1)}%`
}

const PRESETS = [
  { key: 'today', labelKey: 'Today', days: 0 },
  { key: '7d', labelKey: '7 days', days: 7 },
  { key: '30d', labelKey: '30 days', days: 30 },
]

function getRange(days: number): { start: number; end: number } {
  const now = Math.floor(Date.now() / 1000)
  const start =
    days === 0
      ? Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
      : now - days * 86400
  return { start, end: now }
}

const REVENUE_COLOR = '#4285f4'
const COST_COLOR = '#ea4335'
const PROFIT_COLOR = '#34a853'

function ChannelCostContent() {
  const { t } = useTranslation()
  const [preset, setPreset] = useState(7)

  const range = useMemo(() => getRange(preset), [preset])

  const {
    data: rows = [],
    isFetching: costFetching,
    refetch: refetchCost,
  } = useQuery({
    queryKey: ['channel-cost', range.start, range.end],
    queryFn: async () => {
      const res = await getChannelCostStats(range.start, range.end)
      return res.success ? res.data || [] : []
    },
  })

  const { data: trend = [], refetch: refetchTrend } = useQuery({
    queryKey: ['profit-report', range.start, range.end],
    queryFn: async () => {
      const res = await getProfitReport(range.start, range.end)
      return res.success ? res.data || [] : []
    },
  })

  const totals = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + (r.revenue || 0), 0)
    const cost = rows.reduce((s, r) => s + (r.cost || 0), 0)
    const profit = revenue - cost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0
    return { revenue, cost, profit, margin }
  }, [rows])

  const barData = useMemo(
    () =>
      rows.map((r) => ({
        channel: r.channel_name || `#${r.channel_id}`,
        revenue: Number((r.revenue || 0).toFixed(4)),
        cost: Number((r.cost || 0).toFixed(4)),
      })),
    [rows]
  )

  const refresh = () => {
    refetchCost()
    refetchTrend()
  }

  const summaryCards = [
    { label: t('Total revenue'), value: fmt(totals.revenue), tone: 'primary' },
    { label: t('Total cost'), value: fmt(totals.cost), tone: 'cost' },
    {
      label: t('Total profit'),
      value: fmt(totals.profit),
      tone: totals.profit >= 0 ? 'profit' : 'cost',
    },
    {
      label: t('Overall margin'),
      value: fmtPct(totals.margin),
      tone: totals.margin >= 0 ? 'profit' : 'cost',
    },
  ]
  const toneColor: Record<string, string> = {
    primary: 'text-blue-600 dark:text-blue-400',
    cost: 'text-red-600 dark:text-red-400',
    profit: 'text-emerald-600 dark:text-emerald-400',
  }

  const renderProfitCell = (r: ChannelCostRow) => {
    if (r.cost_ratio <= 0) {
      return <span className='text-muted-foreground'>-</span>
    }
    return (
      <span className={r.profit >= 0 ? toneColor.profit : toneColor.cost}>
        {fmt(r.profit)}
      </span>
    )
  }

  return (
    <div className='mx-auto max-w-[1200px]'>
      <p className='text-muted-foreground mb-4 text-sm'>
        {t(
          'Revenue, cost and profit by channel. The cost ratio is configured under a channel’s advanced settings.'
        )}
      </p>

      <div className='flex flex-wrap items-center gap-2'>
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            variant={preset === p.days ? 'default' : 'outline'}
            size='sm'
            onClick={() => setPreset(p.days)}
          >
            {t(p.labelKey)}
          </Button>
        ))}
        <Button
          variant='ghost'
          size='sm'
          onClick={refresh}
          disabled={costFetching}
        >
          <RotateCw
            data-icon='inline-start'
            className={costFetching ? 'animate-spin' : undefined}
          />
          {t('Refresh')}
        </Button>
      </div>

      <div className='mt-4 grid grid-cols-2 gap-3 md:grid-cols-4'>
        {summaryCards.map((card) => (
          <div key={card.label} className='rounded-lg border p-4'>
            <div className='text-muted-foreground text-xs'>{card.label}</div>
            <div
              className={cn('mt-1 text-2xl font-bold', toneColor[card.tone])}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {barData.length > 0 && (
        <div className='mt-4 rounded-lg border p-4'>
          <div className='mb-3 font-medium'>
            {t('Revenue vs cost by channel')}
          </div>
          <ResponsiveContainer width='100%' height={260}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray='3 3' opacity={0.2} />
              <XAxis dataKey='channel' fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(value) => `$${Number(value).toFixed(4)}`} />
              <Legend />
              <Bar
                dataKey='revenue'
                name={t('Revenue')}
                fill={REVENUE_COLOR}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey='cost'
                name={t('Cost')}
                fill={COST_COLOR}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {trend.length > 0 && (
        <div className='mt-4 rounded-lg border p-4'>
          <div className='mb-3 font-medium'>{t('Daily profit trend')}</div>
          <ResponsiveContainer width='100%' height={280}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray='3 3' opacity={0.2} />
              <XAxis dataKey='date' fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(value) => `$${Number(value).toFixed(4)}`} />
              <Legend />
              <Line
                type='monotone'
                dataKey='revenue'
                name={t('Revenue')}
                stroke={REVENUE_COLOR}
                strokeWidth={2}
              />
              <Line
                type='monotone'
                dataKey='cost'
                name={t('Cost')}
                stroke={COST_COLOR}
                strokeWidth={2}
              />
              <Line
                type='monotone'
                dataKey='profit'
                name={t('Profit')}
                stroke={PROFIT_COLOR}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className='mt-4 rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Channel')}</TableHead>
              <TableHead>{t('Cost ratio')}</TableHead>
              <TableHead>{t('Revenue')}</TableHead>
              <TableHead>{t('Cost')}</TableHead>
              <TableHead>{t('Profit')}</TableHead>
              <TableHead>{t('Margin')}</TableHead>
              <TableHead>{t('Requests')}</TableHead>
              <TableHead>{t('Tokens')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className='text-muted-foreground py-8 text-center'
                >
                  {t('No data')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.channel_id}>
                  <TableCell>{r.channel_name || `#${r.channel_id}`}</TableCell>
                  <TableCell>
                    {r.cost_ratio > 0 ? (
                      <Badge variant='secondary' className='rounded-full'>
                        {r.cost_ratio}
                      </Badge>
                    ) : (
                      <span className='text-muted-foreground'>-</span>
                    )}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {fmt(r.revenue)}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {r.cost_ratio > 0 ? (
                      fmt(r.cost)
                    ) : (
                      <span className='text-muted-foreground'>
                        {t('Not configured')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {renderProfitCell(r)}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {r.cost_ratio <= 0 ? (
                      <span className='text-muted-foreground'>-</span>
                    ) : (
                      <span
                        className={
                          r.profit_margin >= 0
                            ? toneColor.profit
                            : toneColor.cost
                        }
                      >
                        {fmtPct(r.profit_margin)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {r.requests?.toLocaleString()}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {r.tokens?.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function ChannelCost() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Channel Cost Analysis')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <ChannelCostContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
