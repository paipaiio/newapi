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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

import {
  type AlertSettings,
  DEFAULT_ALERT_SETTINGS,
  getAlertSettings,
  QUOTA_PER_UNIT,
  saveAlertSettings,
} from './api'

/** A toggle row with a title, description and switch. */
function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className='flex items-center justify-between gap-4'>
      <div>
        <div className='font-medium'>{title}</div>
        <div className='text-muted-foreground text-sm'>{description}</div>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  )
}

function AlertSettingsContent() {
  const { t } = useTranslation()
  const [cfg, setCfg] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS)
  const [saving, setSaving] = useState(false)

  const { data } = useQuery({
    queryKey: ['alert-settings'],
    queryFn: getAlertSettings,
  })

  useEffect(() => {
    if (data) setCfg(data)
  }, [data])

  const set = <K extends keyof AlertSettings>(
    key: K,
    value: AlertSettings[K]
  ) => setCfg((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const ok = await saveAlertSettings(cfg)
      if (ok) toast.success(t('Saved successfully'))
      else toast.error(t('Some settings failed to save, please retry'))
    } catch {
      toast.error(t('Save failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='mx-auto max-w-[800px]'>
      <p className='text-muted-foreground mb-4 text-sm'>
        {t(
          'Send alerts to the super admin email via the site SMTP. Configure SMTP under System Settings first.'
        )}
      </p>

      <div className='space-y-4 rounded-lg border p-6'>
        <ToggleRow
          title={t('Enable email alerts')}
          description={t('Master switch. When off, no alerts are sent at all.')}
          checked={cfg.enabled}
          onChange={(v) => set('enabled', v)}
        />

        <Separator />

        <ToggleRow
          title={t('Abnormal usage alert')}
          description={t(
            'Email when a single user spends over the threshold within 5 minutes (anti-abuse).'
          )}
          checked={cfg.abnormal_usage_enabled}
          disabled={!cfg.enabled}
          onChange={(v) => set('abnormal_usage_enabled', v)}
        />
        {cfg.abnormal_usage_enabled && (
          <div className='flex items-center gap-2'>
            <Label className='text-muted-foreground text-sm'>
              {t('Threshold (USD)')}
            </Label>
            <Input
              type='number'
              min={0}
              step='0.01'
              disabled={!cfg.enabled}
              className='w-40'
              value={String(cfg.abnormal_usage_threshold / QUOTA_PER_UNIT)}
              onChange={(e) =>
                set(
                  'abnormal_usage_threshold',
                  Math.round((Number(e.target.value) || 0) * QUOTA_PER_UNIT)
                )
              }
            />
          </div>
        )}

        <Separator />

        <ToggleRow
          title={t('Quota surge alert')}
          description={t('Email when a single top-up exceeds the threshold.')}
          checked={cfg.quota_surge_enabled}
          disabled={!cfg.enabled}
          onChange={(v) => set('quota_surge_enabled', v)}
        />
        {cfg.quota_surge_enabled && (
          <div className='flex items-center gap-2'>
            <Label className='text-muted-foreground text-sm'>
              {t('Threshold (USD)')}
            </Label>
            <Input
              type='number'
              min={0}
              step='0.01'
              disabled={!cfg.enabled}
              className='w-40'
              value={String(cfg.quota_surge_threshold / QUOTA_PER_UNIT)}
              onChange={(e) =>
                set(
                  'quota_surge_threshold',
                  Math.round((Number(e.target.value) || 0) * QUOTA_PER_UNIT)
                )
              }
            />
          </div>
        )}

        <Separator />

        <ToggleRow
          title={t('Daily report email')}
          description={t(
            'Email a summary of yesterday’s spending / top-ups / calls / new users at 00:05 daily.'
          )}
          checked={cfg.daily_report_enabled}
          disabled={!cfg.enabled}
          onChange={(v) => set('daily_report_enabled', v)}
        />

        <div className='pt-2'>
          <Button onClick={handleSave} disabled={saving}>
            {t('Save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AlertSettingsPage() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Email Alerts')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <AlertSettingsContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
