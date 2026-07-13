/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

For commercial licensing, please contact support@quantumnous.com
*/
import { useRef, useState } from 'react'
import { Flame, Play, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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

interface BurnEvent {
  type: 'probe' | 'progress' | 'done' | 'error'
  sent: number
  ok: number
  fail: number
  tokens: number
  rate: number
  spent_usd: number
  remain_usd: number
  start_usd: number
  elapsed: number
  msg?: string
  errors?: Record<string, number>
}

const emptyStats: BurnEvent = {
  type: 'progress',
  sent: 0, ok: 0, fail: 0, tokens: 0,
  rate: 0, spent_usd: 0, remain_usd: 0, start_usd: 0, elapsed: 0,
}

function MiniStat({ label, value, valueClass }: {
  label: string; value: string; valueClass?: string
}) {
  return (
    <Card>
      <CardContent className='p-3'>
        <div className='text-xs text-muted-foreground'>{label}</div>
        <div className={`mt-0.5 text-lg font-bold tabular-nums ${valueClass ?? ''}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function BurnToolContent() {
  const [key, setKey] = useState('')
  const [baseURL, setBaseURL] = useState('http://127.0.0.1:3000')
  const [model, setModel] = useState('')
  const [api, setApi] = useState('chat')
  const [maxTokens, setMaxTokens] = useState(512)
  const [concurrency, setConcurrency] = useState(8)
  const [stopType, setStopType] = useState('spend')
  const [stopValue, setStopValue] = useState(1)

  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<BurnEvent>(emptyStats)
  const [logs, setLogs] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const logBoxRef = useRef<HTMLDivElement | null>(null)

  const pushLog = (line: string) => {
    setLogs(l => {
      const ts = new Date().toLocaleTimeString('zh-CN')
      const next = [...l, `[${ts}] ${line}`]
      return next.length > 200 ? next.slice(-200) : next
    })
    requestAnimationFrame(() => {
      if (logBoxRef.current)
        logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
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

    setRunning(true)
    setStats(emptyStats)
    setLogs([])
    pushLog(`开始：模型 ${model}，并发 ${concurrency}，停止条件 ${stopType}=${stopType === 'until_empty' ? '耗尽' : stopValue}`)

    const ac = new AbortController()
    abortRef.current = ac

    try {
      const resp = await fetch('/api/admin_tools/burn/stream', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({
          key: key.trim(),
          base_url: baseURL.trim(),
          model: model.trim(),
          api, max_tokens: maxTokens, concurrency,
          stop_type: stopType, stop_value: stopValue,
        }),
      })

      if (!resp.ok || !resp.body) {
        setRunning(false)
        pushLog(`连接失败: HTTP ${resp.status}`)
        return
      }

      const reader = resp.body.getReader()
      const dec = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const blocks = buf.split('\n\n')
        buf = blocks.pop() ?? ''
        for (const block of blocks) {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt: BurnEvent = JSON.parse(line.slice(6))
              if (evt.type === 'error') {
                setRunning(false)
                pushLog(`❌ ${evt.msg}`)
                toast.error(evt.msg ?? '探针失败')
              } else if (evt.type === 'probe') {
                pushLog(`✓ ${evt.msg}`)
              } else if (evt.type === 'progress') {
                setStats(evt)
              } else if (evt.type === 'done') {
                setStats(evt)
                setRunning(false)
                pushLog(`✅ 完成：发送 ${evt.sent}（ok ${evt.ok}/fail ${evt.fail}），实测消耗 $${evt.spent_usd.toFixed(4)}，耗时 ${evt.elapsed.toFixed(1)}s`)
              }
            } catch { /* ignore */ }
          }
        }
      }
      if (abortRef.current) setRunning(false)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setRunning(false)
        pushLog(`❌ 异常: ${(e as Error).message}`)
      }
    } finally {
      abortRef.current = null
    }
  }

  return (
    <div className='grid gap-6 lg:grid-cols-2'>
      {/* 左：配置 */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Flame className='h-4 w-4 text-orange-500' />
            消耗配置
            {running && (
              <Badge variant='default' className='ml-auto gap-1'>
                <span className='inline-block h-2 w-2 animate-pulse rounded-full bg-green-400' />
                消耗中
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-1.5'>
            <Label>API Key</Label>
            <Input placeholder='sk-...' value={key}
              onChange={e => setKey(e.target.value)} disabled={running}
              className='font-mono text-xs' />
          </div>
          <div className='space-y-1.5'>
            <Label>网关 Base URL</Label>
            <Input value={baseURL} onChange={e => setBaseURL(e.target.value)}
              disabled={running} className='font-mono text-xs' />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label>模型</Label>
              <Input placeholder='grok-4.5' value={model}
                onChange={e => setModel(e.target.value)} disabled={running}
                className='font-mono text-xs' />
            </div>
            <div className='space-y-1.5'>
              <Label>接口类型</Label>
              <Select value={api} onValueChange={setApi} disabled={running}>
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
              <Label>max_tokens</Label>
              <Input type='number' value={maxTokens}
                onChange={e => setMaxTokens(Number(e.target.value))} disabled={running} />
            </div>
            <div className='space-y-1.5'>
              <Label>并发数 (≤32)</Label>
              <Input type='number' value={concurrency}
                onChange={e => setConcurrency(Number(e.target.value))} disabled={running} />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label>停止条件</Label>
              <Select value={stopType} onValueChange={setStopType} disabled={running}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='spend'>消耗达到 $</SelectItem>
                  <SelectItem value='requests'>请求数</SelectItem>
                  <SelectItem value='duration'>持续秒数</SelectItem>
                  <SelectItem value='until_empty'>烧到额度耗尽</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label>
                {stopType === 'spend' ? '目标金额 ($)' :
                 stopType === 'requests' ? '请求数' :
                 stopType === 'duration' ? '秒数' : '（无需填）'}
              </Label>
              <Input type='number' value={stopValue}
                onChange={e => setStopValue(Number(e.target.value))}
                disabled={running || stopType === 'until_empty'} />
            </div>
          </div>
          <div className='flex gap-2 pt-2'>
            {!running ? (
              <Button onClick={start} className='flex-1 gap-2'>
                <Play className='h-4 w-4' />开始消耗
              </Button>
            ) : (
              <Button onClick={stop} variant='destructive' className='flex-1 gap-2'>
                <Square className='h-4 w-4' />停止
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 右：实时结果 */}
      <div className='space-y-4'>
        <div className='grid grid-cols-2 gap-3'>
          <MiniStat label='已发送' value={stats.sent.toLocaleString()} />
          <MiniStat label='成功 / 失败' value={`${stats.ok} / ${stats.fail}`}
            valueClass={stats.fail > 0 ? 'text-orange-500' : 'text-green-500'} />
          <MiniStat label='Token 消耗' value={stats.tokens.toLocaleString()} />
          <MiniStat label='速率' value={`${stats.rate.toFixed(1)} req/s`} />
          <MiniStat label='实测消耗' value={`$${stats.spent_usd.toFixed(4)}`}
            valueClass='text-orange-500' />
          <MiniStat label='当前余额'
            value={stats.remain_usd > 0 ? `$${stats.remain_usd.toFixed(2)}` : '—'} />
        </div>
        {stats.start_usd > 0 && (
          <div className='text-xs text-muted-foreground px-1'>
            起始余额 ${stats.start_usd.toFixed(2)} → 当前 ${stats.remain_usd.toFixed(2)}（实测消耗 ${stats.spent_usd.toFixed(4)}）
          </div>
        )}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm'>实时日志</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={logBoxRef}
              className='h-[280px] overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed'>
              {logs.length === 0
                ? <span className='text-muted-foreground'>等待开始…</span>
                : logs.map((l, i) => (
                  <div key={i} className='whitespace-pre-wrap break-all'>{l}</div>
                ))}
            </div>
            {stats.errors && Object.keys(stats.errors).length > 0 && (
              <div className='mt-3 space-y-1'>
                <div className='text-xs font-medium text-muted-foreground'>错误分布</div>
                {Object.entries(stats.errors).sort((a, b) => b[1] - a[1]).map(([msg, cnt]) => (
                  <div key={msg}
                    className='flex justify-between gap-2 rounded bg-red-500/10 px-2 py-1 text-xs'>
                    <span className='truncate font-mono'>{msg}</span>
                    <span className='shrink-0 tabular-nums'>{cnt}x</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function BurnTool() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Burn Tool')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <BurnToolContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
