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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  addAnnotation,
  getMonitorGroups,
  getTrafficMetrics,
  saveGroupConfig,
} from '../api'
import { fnum, fp, fusd } from '../lib/format'
import type { Annotation, MetricsData, MonitorGroup } from '../types'

interface ManagePanelProps {
  onAnnotations: (annotations: Annotation[]) => void
  onExit: () => void
}

export function ManagePanel({ onAnnotations, onExit }: ManagePanelProps) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<MonitorGroup[] | null>(null)
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [mWin, setMWin] = useState('24h')
  const [aType, setAType] = useState('info')
  const [aTitle, setATitle] = useState('')
  const [aDate, setADate] = useState('')
  const [aBody, setABody] = useState('')

  const loadGroups = () =>
    getMonitorGroups()
      .then(setGroups)
      .catch(() => setGroups([]))
  const loadMetrics = () =>
    getTrafficMetrics()
      .then(setMetrics)
      .catch(() => setMetrics(null))

  useEffect(() => {
    loadGroups()
    loadMetrics()
  }, [])

  const patchGroup = async (key: string, patch: Partial<MonitorGroup>) => {
    try {
      await saveGroupConfig(key, patch)
      loadGroups()
    } catch {
      toast.error(t('Operation failed'))
    }
  }

  const submitAnnotation = async () => {
    if (!aTitle.trim()) return
    try {
      const anns = await addAnnotation({
        type: aType,
        title: aTitle.trim(),
        date: aDate.trim(),
        body: aBody.trim(),
      })
      onAnnotations(anns)
      setATitle('')
      setABody('')
      toast.success(t('Announcement published'))
    } catch {
      toast.error(t('Operation failed'))
    }
  }

  const w = metrics?.windows?.[mWin]
  const rows = w ? Object.keys(w.groups || {}).sort() : []

  return (
    <div className='space-y-4 rounded-xl border p-4'>
      <div className='font-medium'>
        {t('Manage · monitoring & announcements')}
      </div>

      <div>
        <div className='mb-2 text-sm font-medium'>
          {t('Group monitoring (toggle + probe model, saved instantly)')}
        </div>
        {!groups ? (
          <div className='text-muted-foreground text-sm'>
            {t('Loading groups…')}
          </div>
        ) : (
          <div className='space-y-2'>
            {groups.map((g) => (
              <div
                key={g.key}
                className='flex flex-wrap items-center gap-2 rounded-md border p-2'
              >
                <span
                  className='text-muted-foreground w-28 shrink-0 truncate text-xs'
                  title={t('Raw group name (admin only)')}
                >
                  {g.key}
                </span>
                <Input
                  className='h-8 w-40'
                  defaultValue={g.display || ''}
                  placeholder={t('Public display name')}
                  onBlur={(e) => patchGroup(g.key, { display: e.target.value })}
                />
                <label className='flex items-center gap-1.5 text-sm'>
                  <Switch
                    checked={g.enabled}
                    onCheckedChange={(v) => patchGroup(g.key, { enabled: v })}
                  />
                  {t('Monitor')}
                </label>
                <NativeSelect
                  className='h-8 w-40'
                  defaultValue={g.model}
                  onChange={(e) => patchGroup(g.key, { model: e.target.value })}
                >
                  {(g.models || []).map((m) => (
                    <NativeSelectOption key={m} value={m}>
                      {m}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className='mb-2 flex items-center gap-2 text-sm font-medium'>
          {t('Traffic metrics · admin only')}
          <NativeSelect
            className='h-7 w-28'
            value={mWin}
            onChange={(e) => setMWin(e.target.value)}
          >
            <NativeSelectOption value='24h'>24h</NativeSelectOption>
            <NativeSelectOption value='1h'>1h</NativeSelectOption>
          </NativeSelect>
        </div>
        {!w ? (
          <div className='text-muted-foreground text-sm'>
            {t('No traffic data for this window.')}
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-muted-foreground border-b text-left text-xs'>
                  <th className='py-1.5'>{t('Group')}</th>
                  <th>{t('Requests')}</th>
                  <th>RPM</th>
                  <th>Tokens</th>
                  <th>TPM</th>
                  <th>{t('Cache hit')}</th>
                  <th>{t('Success')}</th>
                  <th>{t('Spend')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((name) => {
                  const m = w.groups?.[name]
                  if (!m) return null
                  return (
                    <tr key={name} className='border-b'>
                      <td className='py-1.5'>{name}</td>
                      <td>{fnum(m.reqs)}</td>
                      <td>{m.rpm ?? '—'}</td>
                      <td>{fnum(m.tokens)}</td>
                      <td>{m.tpm ?? '—'}</td>
                      <td>{fp(m.cache_hit)}</td>
                      <td>{fp(m.success)}</td>
                      <td>{fusd(m.spend_usd)}</td>
                    </tr>
                  )
                })}
                {w.overall && (
                  <tr className='font-medium'>
                    <td className='py-1.5'>{t('Total')}</td>
                    <td>{fnum(w.overall.reqs)}</td>
                    <td>{w.overall.rpm ?? '—'}</td>
                    <td>{fnum(w.overall.tokens)}</td>
                    <td>{w.overall.tpm ?? '—'}</td>
                    <td>{fp(w.overall.cache_hit)}</td>
                    <td>{fp(w.overall.success)}</td>
                    <td>{fusd(w.overall.spend_usd)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className='space-y-2'>
        <div className='text-sm font-medium'>{t('Add announcement')}</div>
        <div className='flex flex-wrap gap-2'>
          <NativeSelect
            className='h-8 w-28'
            value={aType}
            onChange={(e) => setAType(e.target.value)}
          >
            <NativeSelectOption value='info'>{t('Notice')}</NativeSelectOption>
            <NativeSelectOption value='maintenance'>
              {t('Maintenance')}
            </NativeSelectOption>
            <NativeSelectOption value='incident'>
              {t('Incident')}
            </NativeSelectOption>
            <NativeSelectOption value='resolved'>
              {t('Resolved')}
            </NativeSelectOption>
          </NativeSelect>
          <Input
            className='h-8 flex-1'
            value={aTitle}
            onChange={(e) => setATitle(e.target.value)}
            placeholder={t('Title (required)')}
          />
          <Input
            className='h-8 w-44'
            value={aDate}
            onChange={(e) => setADate(e.target.value)}
            placeholder='YYYY-MM-DD'
          />
        </div>
        <Textarea
          value={aBody}
          onChange={(e) => setABody(e.target.value)}
          placeholder={t('Details (optional)')}
          rows={2}
        />
        <div className='flex gap-2'>
          <Button size='sm' onClick={submitAnnotation}>
            {t('Publish announcement')}
          </Button>
          <Button size='sm' variant='outline' onClick={onExit}>
            {t('Exit management')}
          </Button>
        </div>
      </div>
    </div>
  )
}
