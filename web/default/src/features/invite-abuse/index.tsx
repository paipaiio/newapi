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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_INVITE_ABUSE_SETTINGS,
  getInviteAbuseSettings,
  type InviteAbuseSettings,
  saveInviteAbuseSettings,
} from './api'

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
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

function InviteAbuseContent() {
  const { t } = useTranslation()
  const [cfg, setCfg] = useState<InviteAbuseSettings>(
    DEFAULT_INVITE_ABUSE_SETTINGS
  )
  const [saving, setSaving] = useState(false)

  const { data } = useQuery({
    queryKey: ['invite-abuse-settings'],
    queryFn: getInviteAbuseSettings,
  })

  useEffect(() => {
    if (data) setCfg(data)
  }, [data])

  const set = <K extends keyof InviteAbuseSettings>(
    key: K,
    value: InviteAbuseSettings[K]
  ) => setCfg((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const ok = await saveInviteAbuseSettings(cfg)
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
          'Detect suspicious invite-reward farming (many throwaway accounts). Flagged accounts receive no invite reward until an admin reviews them.'
        )}
      </p>

      <div className='space-y-4 rounded-lg border p-6'>
        <ToggleRow
          title={t('Enable invite-abuse detection')}
          description={t('Master switch for all checks below.')}
          checked={cfg.enabled}
          onChange={(v) => set('enabled', v)}
        />

        <Separator />

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label>{t('Max registrations per IP')}</Label>
            <Input
              type='number'
              min={1}
              disabled={!cfg.enabled}
              value={String(cfg.max_per_ip)}
              onChange={(e) => set('max_per_ip', Number(e.target.value) || 0)}
            />
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Detection window (hours)')}</Label>
            <Input
              type='number'
              min={1}
              disabled={!cfg.enabled}
              value={String(cfg.window_hours)}
              onChange={(e) => set('window_hours', Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <Separator />

        <ToggleRow
          title={t('Flag inviter/invitee sharing an IP')}
          description={t(
            'Treat as suspicious when the inviter and the new account register from the same IP.'
          )}
          checked={cfg.check_inviter_same_ip}
          disabled={!cfg.enabled}
          onChange={(v) => set('check_inviter_same_ip', v)}
        />
        <ToggleRow
          title={t('Flag email aliases')}
          description={t(
            'Treat +alias and Gmail dot tricks of the same address as one person.'
          )}
          checked={cfg.check_email_alias}
          disabled={!cfg.enabled}
          onChange={(v) => set('check_email_alias', v)}
        />
        <ToggleRow
          title={t('Flag duplicate browser fingerprints')}
          description={t(
            'Treat as suspicious when the same device fingerprint registers repeatedly.'
          )}
          checked={cfg.check_fingerprint}
          disabled={!cfg.enabled}
          onChange={(v) => set('check_fingerprint', v)}
        />

        <Separator />

        <div className='space-y-1.5'>
          <Label>{t('Blocked email domains')}</Label>
          <Textarea
            rows={4}
            disabled={!cfg.enabled}
            value={cfg.blocked_email_domains}
            onChange={(e) => set('blocked_email_domains', e.target.value)}
            placeholder={'example.com\nmailinator.com'}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'One domain per line (without @). Registrations from these domains are flagged.'
            )}
          </p>
        </div>

        <div className='pt-2'>
          <Button onClick={handleSave} disabled={saving}>
            {t('Save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function InviteAbusePage() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Invite-abuse Detection')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <InviteAbuseContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
