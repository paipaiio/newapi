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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useIsAdmin } from '@/hooks/use-admin'

import { getSuccessStats, getSelfSuccessStats } from './api'
import type { SuccessStatsParams } from './types'

// ─── helpers ────────────────────────────────────────────────────────────────

function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return { start: Math.floor(start.getTime() / 1000), end: Math.floor(now.getTime() / 1000) }
}

function daysAgoRange(days: number) {
  const now = Date.now()
  return { start: Math.floor((now - days * 86400_000) / 1000), end: Math.floor(now / 1000) }
}

function thisMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { start: Math.floor(start.getTime() / 1000), end: Math.floor(now.getTime() / 1000) }
}

const PRESETS = [
  { key: 'today', labelKey: 'Today' },
  { key: '7d', labelKey: '7 days' },
  { key: 'month', labelKey: 'This month' },
  { key: '30d', labelKey: '30 days' },
  { key: 'custom', labelKey: 'Custom' },
] as const

type Preset = (typeof PRESETS)[number]['key']

function getRange(preset: Preset, customStart: string, customEnd: string) {
  if (preset === 'today') return todayRange()
  if (preset === '7d') return daysAgoRange(7)
  if (preset === 'month') return thisMonthRange()
  if (preset === '30d') return daysAgoRange(30)
  // custom
  const s = customStart ? Math.floor(new Date(customStart).getTime() / 1000) : daysAgoRange(7).start
  const e = customEnd ? Math.floor(new Date(customEnd + 'T23:59:59').getTime() / 1000) : daysAgoRange(0).end
  return { start: s, end: e }
}

function fmtRate(v: number) {
  return v.toFixed(2) + '%'
}
function fmtTime(v: number) {
  return v ? v.toFixed(1) + 's' : '—'
}

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  sub,
  color,
}: {
  title: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <Card>
      <CardHeader className='pb-1'>
        <CardTitle className='text-muted-foreground text-sm font-medium'>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${color ?? ''}`}>{value}</p>
        {sub && <p className='text-muted-foreground mt-0.5 text-xs'>{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ─── main component ──────────────────────────────────────────────────────────

export function RequestStats() {
  const { t } = useTranslation()
  const isAdmin = useIsAdmin()

  const [preset, setPreset] = useState<Preset>('7d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [filterUsername, setFilterUsername] = useState('')
  const [filterModel, setFilterModel] = useState('')
  const [userSearch, setUserSearch] = useState('')

  const range = useMemo(
    () => getRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  )

  const params: SuccessStatsParams = {
    start: range.start,
    end: range.end,
    username: filterUsername || undefined,
    model_name: filterModel || undefined,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['request-stats', params],
    queryFn: () => (isAdmin ? getSuccessStats(params) : getSelfSuccessStats(params)),
    staleTime: 60_000,
  })

  const stats = data?.data

  // filter user table by search
  const filteredUsers = useMemo(() => {
    if (!stats?.by_user) return []
    const q = userSearch.toLowerCase()
    return q ? stats.by_user.filter((u) => u.username.toLowerCase().includes(q)) : stats.by_user
  }, [stats?.by_user, userSearch])

  return (
    <div className='space-y-4 p-4 sm:p-6'>
      {/* ── time preset bar ── */}
      <div className='flex flex-wrap items-center gap-2'>
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            variant={preset === p.key ? 'default' : 'outline'}
            size='sm'
            onClick={() => setPreset(p.key)}
          >
            {t(p.labelKey)}
          </Button>
        ))}
        {preset === 'custom' && (
          <div className='flex items-center gap-2'>
            <Input
              type='date'
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className='h-8 w-36 text-sm'
            />
            <span className='text-muted-foreground text-sm'>—</span>
            <Input
              type='date'
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className='h-8 w-36 text-sm'
            />
          </div>
        )}
        {isAdmin && (
          <>
            <Input
              placeholder={t('Filter by username')}
              value={filterUsername}
              onChange={(e) => setFilterUsername(e.target.value)}
              className='h-8 w-36 text-sm'
            />
            <Input
              placeholder={t('Filter by model')}
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              className='h-8 w-36 text-sm'
            />
          </>
        )}
      </div>

      {/* ── summary cards ── */}
      {isLoading ? (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className='pt-4'>
                <Skeleton className='mb-2 h-4 w-20' />
                <Skeleton className='h-7 w-16' />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <StatCard
            title={t('Total requests')}
            value={stats?.summary.total.toLocaleString() ?? '—'}
            sub={t('Avg time: {{t}}', { t: fmtTime(stats?.summary.avg_use_time ?? 0) })}
          />
          <StatCard
            title={t('Successful')}
            value={stats?.summary.success.toLocaleString() ?? '—'}
            sub={fmtRate(stats?.summary.success_rate ?? 0)}
            color='text-green-600'
          />
          <StatCard
            title={t('Failed')}
            value={stats?.summary.failed.toLocaleString() ?? '—'}
            sub={fmtRate(stats?.summary.failed != null && stats?.summary.total > 0 ? (stats.summary.failed / stats.summary.total) * 100 : 0)}
            color={stats?.summary.failed ? 'text-red-500' : undefined}
          />
          <StatCard
            title={t('Success rate')}
            value={fmtRate(stats?.summary.success_rate ?? 0)}
          />
        </div>
      )}

      {/* ── trend chart ── */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{t('Daily trend')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className='h-48 w-full' />
          ) : (
            <ResponsiveContainer width='100%' height={220}>
              <BarChart data={stats?.trend ?? []} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
                <XAxis dataKey='date' tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey='success' name={t('Successful')} fill='#22c55e' radius={[3, 3, 0, 0]} />
                <Bar dataKey='failed' name={t('Failed')} fill='#ef4444' radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── error breakdown ── */}
      {(isLoading || (stats?.errors && stats.errors.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>{t('Failure breakdown')}</CardTitle>
          </CardHeader>
          <CardContent className='p-0'>
            {isLoading ? (
              <div className='space-y-2 p-4'>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className='h-8 w-full' />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Reason')}</TableHead>
                    <TableHead className='w-24 text-right'>{t('Count')}</TableHead>
                    <TableHead className='w-24 text-right'>{t('% of failures')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats?.errors.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className='max-w-xs truncate font-mono text-xs'>{e.reason || t('Unknown')}</TableCell>
                      <TableCell className='text-right tabular-nums'>{e.count}</TableCell>
                      <TableCell className='text-right tabular-nums text-red-500'>{e.pct.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── per-user table (admin only) ── */}
      {isAdmin && (
        <Card>
          <CardHeader className='flex-row items-center justify-between pb-2'>
            <CardTitle className='text-base'>{t('By user')}</CardTitle>
            <Input
              placeholder={t('Search username')}
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className='h-7 w-40 text-sm'
            />
          </CardHeader>
          <CardContent className='p-0'>
            {isLoading ? (
              <div className='space-y-2 p-4'>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className='h-8 w-full' />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className='text-muted-foreground p-4 text-sm'>{t('No data')}</p>
            ) : (
              <div className='max-h-96 overflow-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Username')}</TableHead>
                      <TableHead className='w-24 text-right'>{t('Total')}</TableHead>
                      <TableHead className='w-24 text-right text-green-600'>{t('Success')}</TableHead>
                      <TableHead className='w-24 text-right text-red-500'>{t('Failed')}</TableHead>
                      <TableHead className='w-28 text-right'>{t('Success rate')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow
                        key={u.user_id}
                        className='cursor-pointer hover:bg-muted/50'
                        onClick={() => setFilterUsername(u.username)}
                      >
                        <TableCell className='font-medium'>{u.username}</TableCell>
                        <TableCell className='text-right tabular-nums'>{u.total.toLocaleString()}</TableCell>
                        <TableCell className='text-right tabular-nums text-green-600'>{u.success.toLocaleString()}</TableCell>
                        <TableCell className='text-right tabular-nums text-red-500'>{u.failed.toLocaleString()}</TableCell>
                        <TableCell className='text-right tabular-nums'>
                          <span className={u.success_rate < 95 ? 'text-amber-500' : 'text-green-600'}>
                            {fmtRate(u.success_rate)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
