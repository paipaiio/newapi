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
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
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
              value={String(cfg.max_per_ip)}
              onChange={(e) => set('max_per_ip', Number(e.target.value) || 0)}
            />
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Detection window (hours)')}</Label>
            <Input
              type='number'
              min={1}
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
          onChange={(v) => set('check_inviter_same_ip', v)}
        />
        <ToggleRow
          title={t('Flag email aliases')}
          description={t(
            'Treat +alias and Gmail dot tricks of the same address as one person.'
          )}
          checked={cfg.check_email_alias}
          onChange={(v) => set('check_email_alias', v)}
        />
        <ToggleRow
          title={t('Flag duplicate browser fingerprints')}
          description={t(
            'Treat as suspicious when the same device fingerprint registers repeatedly.'
          )}
          checked={cfg.check_fingerprint}
          onChange={(v) => set('check_fingerprint', v)}
        />
        <ToggleRow
          title={t('Flag invitee networks')}
          description={t(
            'Treat as suspicious when the new account shares an IP or fingerprint with the inviter’s other invitees — catches sockpuppet pools that rotate IP, fingerprint and email but reuse the same invite code.'
          )}
          checked={cfg.check_invitee_network}
          onChange={(v) => set('check_invitee_network', v)}
        />

        <Separator />

        <div className='space-y-1.5'>
          <Label>{t('Blocked email domains')}</Label>
          <Textarea
            rows={4}
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

        <Separator />

        <div className='space-y-1.5'>
          <Label>{t('Max invites per inviter (Layer 1 — inviter rate)')}</Label>
          <Input
            type='number'
            min={0}
            value={String(cfg.max_invites_per_inviter)}
            onChange={(e) =>
              set('max_invites_per_inviter', Number(e.target.value) || 0)
            }
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Within the detection window, if a single invite code is used by this many new registrations, they are flagged. 0 = disabled. Catches VPN/fingerprint-switching abuse that bypasses IP and fingerprint checks.'
            )}
          </p>
        </div>

        <Separator />

        <ToggleRow
          title={t('Detect datacenter / VPN IPs (Layer 2)')}
          description={t(
            'Flag registrations from hosting or proxy IPs. First checks the local CIDR list, then optionally calls an online IP-reputation API.'
          )}
          checked={cfg.check_datacenter_ip}
          onChange={(v) => set('check_datacenter_ip', v)}
        />
        <ToggleRow
          title={t('Use online IP-reputation API (ip-api.com)')}
          description={t(
            'When local CIDR misses, query ip-api.com (1 s timeout, 7-day Redis cache, fail-open). Free, no key required.'
          )}
          checked={cfg.use_ip_reputation_api}
          disabled={!cfg.check_datacenter_ip}
          onChange={(v) => set('use_ip_reputation_api', v)}
        />

        <ToggleRow
          title={t('Flag subnet registration bursts (IPv4 /24)')}
          description={t(
            'Flag when too many registrations share the same IPv4 /24 subnet within the window — catches VPN IP-pool rotation across nearby IPs.'
          )}
          checked={cfg.check_ip_subnet}
          onChange={(v) => set('check_ip_subnet', v)}
        />
        <ToggleRow
          title={t('Flag subnet registration bursts (IPv6 /64)')}
          description={t(
            'Same as the IPv4 /24 check but for IPv6 /64 subnets, which is how home IPv6 prefixes are typically allocated.'
          )}
          checked={cfg.check_ipv6_subnet}
          disabled={!cfg.check_ip_subnet}
          onChange={(v) => set('check_ipv6_subnet', v)}
        />
        <div className='space-y-1.5'>
          <Label>{t('Max registrations per subnet')}</Label>
          <Input
            type='number'
            min={1}
            disabled={!cfg.check_ip_subnet}
            value={String(cfg.max_per_subnet)}
            onChange={(e) => set('max_per_subnet', Number(e.target.value) || 0)}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Maximum registrations per IPv4 /24 or IPv6 /64 subnet within the window. Set slightly above the per-IP limit to tolerate households or offices.'
            )}
          </p>
        </div>

        <div className='space-y-1.5'>
          <Label>{t('Datacenter / VPN CIDR list (Layer 2 — local)')}</Label>
          <Textarea
            rows={4}
            disabled={!cfg.check_datacenter_ip}
            value={cfg.datacenter_cidr_list}
            onChange={(e) => set('datacenter_cidr_list', e.target.value)}
            placeholder={'45.128.223.0/24\n104.28.0.0/16'}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'One CIDR per line. Registration IPs hitting any of these ranges are flagged immediately without calling the online API.'
            )}
          </p>
        </div>

        <Separator />

        <div className='space-y-1.5'>
          <Label>{t('Topup unlock threshold (CNY ¥)')}</Label>
          <Input
            type='number'
            min={0}
            step={1}
            value={String(cfg.topup_unlock_threshold)}
            onChange={(e) =>
              set('topup_unlock_threshold', Number(e.target.value) || 0)
            }
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Flagged users who accumulate this many CNY in successful top-ups will have their withheld registration and invite bonuses released automatically. Set to 0 to disable auto-unlock. All currently flagged users with no pending bonus will be backfilled on next server restart.'
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
