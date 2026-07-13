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
import { useEffect, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, TrendingUp, Users, Zap } from 'lucide-react'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface MonitorStats {
  ts: number
  total_usd: number
  used_usd: number
  remain_usd: number
  req_last_5min: number
  req_last_1h: number
  active_users_24h: number
  top_models: { model: string; count: number; quota: number }[]
}

interface RatePoint {
  time: string
  rps: number
}

const MAX_HISTORY = 60

function useMonitorSSE() {
  const [stats, setStats] = useState<MonitorStats | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<RatePoint[]>([])
  const prevRef = useRef<MonitorStats | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)

  useEffect(() => {
    let active = true
    let buffer = ''

    const connect = async () => {
      try {
        const resp = await fetch('/api/admin_tools/monitor/stream', {
          credentials: 'include',
        })
        if (!resp.ok || !resp.body) {
          setError(`连接失败: HTTP ${resp.status}`)
          return
        }
        setConnected(true)
        setError(null)
        const reader = resp.body.getReader()
        readerRef.current = reader
        const dec = new TextDecoder()

        while (active) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += dec.decode(value, { stream: true })
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''
          for (const block of blocks) {
            for (const line of block.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const data: MonitorStats = JSON.parse(line.slice(6))
                  setStats(data)

                  // Compute rps from 5-min count delta
                  const prev = prevRef.current
                  let rps = 0
                  if (prev) {
                    const deltaReqs = data.req_last_5min - prev.req_last_5min
                    const deltaSec = data.ts - prev.ts
                    rps = deltaSec > 0 ? Math.max(0, deltaReqs / deltaSec) : 0
                  }
                  prevRef.current = data

                  const timeStr = new Date(data.ts * 1000).toLocaleTimeString(
                    'zh-CN',
                    { hour: '2-digit', minute: '2-digit', second: '2-digit' }
                  )
                  setHistory((h) => {
                    const next = [...h, { time: timeStr, rps: parseFloat(rps.toFixed(2)) }]
                    return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next
                  })
                } catch {
                  /* ignore parse errors */
                }
              }
            }
          }
        }
      } catch (e) {
        if (active) {
          setConnected(false)
          setError('连接断开，3秒后重连…')
          setTimeout(() => { if (active) connect() }, 3000)
        }
      }
    }

    connect()
    return () => {
      active = false
      readerRef.current?.cancel()
      setConnected(false)
    }
  }, [])

  return { stats, connected, error, history }
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
}: {
  title: string
  value: string
  sub?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{value}</div>
        {sub && <p className='text-xs text-muted-foreground mt-1'>{sub}</p>}
      </CardContent>
    </Card>
  )
}

export function Monitor() {
  const { stats, connected, error, history } = useMonitorSSE()

  const usedPct =
    stats && stats.total_usd > 0
      ? ((stats.used_usd / stats.total_usd) * 100).toFixed(1)
      : '0.0'

  return (
    <SectionPageLayout
      header={{
        title: '实时监控',
        description: '网关额度与请求速率，每 2 秒自动刷新',
        extra: (
          <Badge variant={connected ? 'default' : 'destructive'} className='gap-1'>
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                connected ? 'animate-pulse bg-green-400' : 'bg-red-400'
              }`}
            />
            {connected ? '实时连接' : error ?? '断开'}
          </Badge>
        ),
      }}
    >
      <div className='space-y-6'>
        {/* 统计卡片 */}
        <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
          <StatCard
            title='剩余额度'
            value={stats ? `$${stats.remain_usd.toFixed(2)}` : '—'}
            sub={stats ? `已用 ${usedPct}%` : undefined}
            icon={Zap}
            color='text-green-500'
          />
          <StatCard
            title='总额度'
            value={stats ? `$${stats.total_usd.toFixed(2)}` : '—'}
            sub={stats ? `已消耗 $${stats.used_usd.toFixed(2)}` : undefined}
            icon={TrendingUp}
            color='text-blue-500'
          />
          <StatCard
            title='最近 5 分钟请求'
            value={stats ? stats.req_last_5min.toLocaleString() : '—'}
            sub={stats ? `过去 1 小时 ${stats.req_last_1h.toLocaleString()} 次` : undefined}
            icon={Activity}
            color='text-orange-500'
          />
          <StatCard
            title='活跃用户 (24h)'
            value={stats ? stats.active_users_24h.toLocaleString() : '—'}
            icon={Users}
            color='text-purple-500'
          />
        </div>

        {/* 额度进度条 */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle className='text-sm'>额度占用</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='relative h-3 w-full rounded-full bg-muted overflow-hidden'>
                <div
                  className='absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-700'
                  style={{ width: `${usedPct}%` }}
                />
              </div>
              <div className='mt-1 flex justify-between text-xs text-muted-foreground'>
                <span>已用 ${stats.used_usd.toFixed(2)}</span>
                <span>剩余 ${stats.remain_usd.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 请求速率图 */}
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>请求速率 (req/s)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={180}>
              <AreaChart data={history} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id='rpsGrad' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='5%' stopColor='#6366f1' stopOpacity={0.4} />
                    <stop offset='95%' stopColor='#6366f1' stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray='3 3' stroke='#334155' strokeOpacity={0.3} />
                <XAxis
                  dataKey='time'
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(-5)}
                  interval='preserveStartEnd'
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: number) => [`${v} req/s`, '速率']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Area
                  type='monotone'
                  dataKey='rps'
                  stroke='#6366f1'
                  strokeWidth={2}
                  fill='url(#rpsGrad)'
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 热门模型 */}
        {stats && stats.top_models && stats.top_models.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className='text-sm'>热门模型 (过去 24 小时)</CardTitle>
            </CardHeader>
            <CardContent className='p-0'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型</TableHead>
                    <TableHead className='text-right'>请求数</TableHead>
                    <TableHead className='text-right'>消耗 (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.top_models.map((m) => (
                    <TableRow key={m.model}>
                      <TableCell className='font-mono text-xs'>{m.model}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {m.count.toLocaleString()}
                      </TableCell>
                      <TableCell className='text-right tabular-nums text-muted-foreground'>
                        ${m.quota.toFixed(4)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </SectionPageLayout>
  )
}
