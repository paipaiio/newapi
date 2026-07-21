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
import { useRef, useState } from 'react'
import { Zap, Play, Square, Activity, BarChart3, Clock3 } from 'lucide-react'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getCommonHeaders } from '@/lib/api'

type FirstTokenEvent = {
  type: 'probe' | 'result' | 'done' | 'error'
  index?: number
  status?: 'success' | 'error'
  sent: number
  ok: number
  fail: number
  first_ms?: number
  total_ms?: number
  first_token?: string
  error?: string
  avg_ms?: number
  p50_ms?: number
  p95_ms?: number
  min_ms?: number
  max_ms?: number
  stddev_ms?: number
  elapsed: number
  msg?: string
}

type ResultRow = {
  index: number
  status: 'success' | 'error'
  firstMs?: number
  totalMs?: number
  firstToken?: string
  error?: string
}

const defaultStats: FirstTokenEvent = {
  type: 'probe',
  sent: 0,
  ok: 0,
  fail: 0,
  elapsed: 0,
}

const defaultPrompts = [
  '用一句话回答：今天适合做什么？',
  '请直接输出一句简短中文问候。',
  '用不超过 20 个字解释什么是 API。',
  '给我一个非常短的冷笑话。',
  '用一句话总结流式输出的好处。',
].join('\n')

function fmtMs(value?: number) {
  return typeof value === 'number' && value > 0 ? `${Math.round(value).toLocaleString()} ms` : '—'
}

function MiniStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className='p-3'>
        <div className='text-xs text-muted-foreground'>{label}</div>
        <div className={`mt-0.5 text-lg font-bold tabular-nums ${valueClass ?? ''}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function FirstTokenTestContent() {
  const [key, setKey] = useState('')
  const [baseURL, setBaseURL] = useState('http://127.0.0.1:3000')
  const [model, setModel] = useState('')
  const [api, setApi] = useState('chat')
  const [requests, setRequests] = useState(30)
  const [concurrency, setConcurrency] = useState(5)
  const [maxTokens, setMaxTokens] = useState(128)
  const [temperature, setTemperature] = useState(0.7)
  const [prompts, setPrompts] = useState(defaultPrompts)
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<FirstTokenEvent>(defaultStats)
  const [rows, setRows] = useState<ResultRow[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const logBoxRef = useRef<HTMLDivElement | null>(null)

  const pushLog = (line: string) => {
    setLogs((items) => {
      const ts = new Date().toLocaleTimeString('zh-CN')
      const next = [...items, `[${ts}] ${line}`]
      return next.length > 300 ? next.slice(-300) : next
    })
    requestAnimationFrame(() => {
      if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
    })
  }

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
    pushLog('已手动停止')
  }

  const start = async () => {
    if (!key.trim()) { toast.error('请填写 API Key'); return }
    if (!model.trim()) { toast.error('请填写模型名'); return }
    const promptList = prompts.split('\n').map((x) => x.trim()).filter(Boolean)
    if (!promptList.length) { toast.error('请至少填写一条提示词'); return }

    setRunning(true)
    setStats(defaultStats)
    setRows([])
    setLogs([])
    pushLog(`开始：${requests} 条请求，并发 ${concurrency}，模型 ${model}`)

    const ac = new AbortController()
    abortRef.current = ac

    try {
      const resp = await fetch('/api/admin_tools/first_token/stream', {
        method: 'POST',
        credentials: 'include',
        headers: getCommonHeaders(),
        signal: ac.signal,
        body: JSON.stringify({
          key: key.trim(),
          base_url: baseURL.trim(),
          model: model.trim(),
          api,
          requests,
          concurrency,
          max_tokens: maxTokens,
          temperature,
          prompts: promptList,
        }),
      })

      if (!resp.ok || !resp.body) {
        setRunning(false)
        pushLog(`连接失败: HTTP ${resp.status}`)
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''
        for (const block of blocks) {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt: FirstTokenEvent = JSON.parse(line.slice(6))
              if (evt.type === 'error') {
                setRunning(false)
                pushLog(`❌ ${evt.msg}`)
                toast.error(evt.msg ?? '测试失败')
              } else if (evt.type === 'probe') {
                pushLog(`✓ ${evt.msg}`)
              } else if (evt.type === 'result') {
                setStats(evt)
                setRows((current) => [
                  ...current,
                  {
                    index: evt.index ?? current.length + 1,
                    status: evt.status ?? 'error',
                    firstMs: evt.first_ms,
                    totalMs: evt.total_ms,
                    firstToken: evt.first_token,
                    error: evt.error,
                  },
                ].slice(-300))
                if (evt.status === 'success') {
                  pushLog(`#${evt.index} ✓ 首字 ${fmtMs(evt.first_ms)} · ${evt.first_token ?? ''}`)
                } else {
                  pushLog(`#${evt.index} ❌ ${evt.error ?? '失败'}`)
                }
              } else if (evt.type === 'done') {
                setStats(evt)
                setRunning(false)
                pushLog(`✅ 完成：${evt.ok}/${evt.sent} 成功，平均 ${fmtMs(evt.avg_ms)}，P95 ${fmtMs(evt.p95_ms)}，标准差 ${fmtMs(evt.stddev_ms)}`)
              }
            } catch { /* ignore invalid event */ }
          }
        }
      }
      if (abortRef.current) setRunning(false)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setRunning(false)
        pushLog(`❌ 异常: ${(error as Error).message}`)
      }
    } finally {
      abortRef.current = null
    }
  }

  return (
    <div className='grid gap-6 lg:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Zap className='h-4 w-4 text-yellow-500' />
            首字稳定性配置
            {running && (
              <Badge variant='default' className='ml-auto gap-1'>
                <span className='inline-block h-2 w-2 animate-pulse rounded-full bg-green-400' />
                测试中
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-1.5'>
            <Label>API Key</Label>
            <Input placeholder='sk-...' value={key} onChange={(e) => setKey(e.target.value)} disabled={running} className='font-mono text-xs' />
          </div>
          <div className='space-y-1.5'>
            <Label>网关 Base URL</Label>
            <Input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} disabled={running} className='font-mono text-xs' />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label>模型</Label>
              <Input placeholder='gpt-4o / claude-opus-4-8' value={model} onChange={(e) => setModel(e.target.value)} disabled={running} className='font-mono text-xs' />
            </div>
            <div className='space-y-1.5'>
              <Label>接口类型</Label>
              <Select value={api} onValueChange={(v) => setApi(v ?? 'chat')} disabled={running}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='chat'>chat/completions</SelectItem>
                  <SelectItem value='messages'>messages (Anthropic)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label>请求总数 (≤200)</Label>
              <Input type='number' value={requests} onChange={(e) => setRequests(Number(e.target.value))} disabled={running} />
            </div>
            <div className='space-y-1.5'>
              <Label>并发数 (≤50)</Label>
              <Input type='number' value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} disabled={running} />
            </div>
            <div className='space-y-1.5'>
              <Label>max_tokens</Label>
              <Input type='number' value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} disabled={running} />
            </div>
            <div className='space-y-1.5'>
              <Label>temperature</Label>
              <Input type='number' step='0.1' value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} disabled={running} />
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label>提示词列表（一行一条，批量轮询使用）</Label>
            <Textarea value={prompts} onChange={(e) => setPrompts(e.target.value)} disabled={running} className='min-h-36 font-mono text-xs' />
          </div>
          <div className='flex gap-2 pt-2'>
            {!running ? (
              <Button onClick={start} className='flex-1 gap-2'><Play className='h-4 w-4' />开始批量测试</Button>
            ) : (
              <Button onClick={stop} variant='destructive' className='flex-1 gap-2'><Square className='h-4 w-4' />停止</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className='space-y-4'>
        <div className='grid grid-cols-2 gap-3'>
          <MiniStat label='已发送' value={stats.sent.toLocaleString()} />
          <MiniStat label='成功 / 失败' value={`${stats.ok} / ${stats.fail}`} valueClass={stats.fail > 0 ? 'text-orange-500' : 'text-green-500'} />
          <MiniStat label='平均首字' value={fmtMs(stats.avg_ms)} valueClass='text-yellow-500' />
          <MiniStat label='P50 / P95' value={`${fmtMs(stats.p50_ms)} / ${fmtMs(stats.p95_ms)}`} />
          <MiniStat label='最小 / 最大' value={`${fmtMs(stats.min_ms)} / ${fmtMs(stats.max_ms)}`} />
          <MiniStat label='标准差' value={fmtMs(stats.stddev_ms)} />
        </div>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='flex items-center gap-2 text-sm'><Activity className='h-4 w-4' />实时日志</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={logBoxRef} className='h-[220px] overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed'>
              {logs.length === 0 ? <span className='text-muted-foreground'>等待开始…</span> : logs.map((line) => <div key={line} className='whitespace-pre-wrap break-all'>{line}</div>)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='flex items-center gap-2 text-sm'><BarChart3 className='h-4 w-4' />最近结果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='max-h-[260px] overflow-y-auto rounded-md border text-xs'>
              {rows.length === 0 ? (
                <div className='p-4 text-center text-muted-foreground'>暂无结果</div>
              ) : rows.map((row) => (
                <div key={row.index} className='grid grid-cols-[56px_72px_96px_1fr] gap-2 border-b px-2 py-1.5 last:border-b-0'>
                  <span className='tabular-nums'>#{row.index}</span>
                  <span className={row.status === 'success' ? 'text-green-500' : 'text-red-500'}>{row.status === 'success' ? '成功' : '失败'}</span>
                  <span className='font-mono tabular-nums'><Clock3 className='mr-1 inline h-3 w-3' />{fmtMs(row.firstMs)}</span>
                  <span className='truncate font-mono'>{row.error || row.firstToken || '—'}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function FirstTokenTest() {
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>首字稳定性测试</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <FirstTokenTestContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
