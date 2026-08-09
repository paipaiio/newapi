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
import { api } from '@/lib/api'

export interface InviteAbuseSettings {
  enabled: boolean
  max_per_ip: number
  window_hours: number
  check_inviter_same_ip: boolean
  check_email_alias: boolean
  check_fingerprint: boolean
  /** Newline-separated domain list for the textarea (JSON array on the wire). */
  blocked_email_domains: string
  /** Layer 1: max invited registrations per inviter within the window (0 = off). */
  max_invites_per_inviter: number
  /** Layer 2: enable datacenter/VPN IP detection. */
  check_datacenter_ip: boolean
  /** Layer 2: enable online IP-reputation API fallback when local CIDR misses. */
  use_ip_reputation_api: boolean
  /** Layer 2: newline-separated CIDR list for the textarea (JSON array on the wire). */
  datacenter_cidr_list: string
  /** Topup unlock: CNY amount a flagged user must accumulate to auto-release their withheld bonuses (0 = disabled). */
  topup_unlock_threshold: number
}

export const DEFAULT_INVITE_ABUSE_SETTINGS: InviteAbuseSettings = {
  enabled: false,
  max_per_ip: 3,
  window_hours: 24,
  check_inviter_same_ip: true,
  check_email_alias: true,
  check_fingerprint: true,
  blocked_email_domains: '',
  max_invites_per_inviter: 2,
  check_datacenter_ip: true,
  use_ip_reputation_api: true,
  datacenter_cidr_list: '',
  topup_unlock_threshold: 50,
}

interface OptionItem {
  key: string
  value: string
}

/** Parse a stored JSON-array-string of domains into newline-separated text. */
function parseDomains(value: string | undefined): string {
  if (!value) return ''
  try {
    const arr = JSON.parse(value)
    return Array.isArray(arr) ? arr.join('\n') : ''
  } catch {
    return value
  }
}

/** Serialize newline-separated textarea text into a JSON array string. */
function serializeDomains(text: string): string {
  const arr = text
    .split('\n')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  return JSON.stringify(arr)
}

export async function getInviteAbuseSettings(): Promise<InviteAbuseSettings> {
  const res = await api.get('/api/option/')
  if (!res.data?.success) return { ...DEFAULT_INVITE_ABUSE_SETTINGS }
  const map: Record<string, string> = {}
  for (const o of (res.data.data || []) as OptionItem[]) map[o.key] = o.value
  const bool = (k: string, d: boolean) =>
    k in map ? map[k] === 'true' : d
  const num = (k: string, d: number) =>
    k in map ? Number.parseInt(map[k], 10) || d : d
  return {
    enabled: bool('invite_abuse_setting.enabled', false),
    max_per_ip: num('invite_abuse_setting.max_per_ip', 3),
    window_hours: num('invite_abuse_setting.window_hours', 24),
    check_inviter_same_ip: bool(
      'invite_abuse_setting.check_inviter_same_ip',
      true
    ),
    check_email_alias: bool('invite_abuse_setting.check_email_alias', true),
    check_fingerprint: bool('invite_abuse_setting.check_fingerprint', true),
    blocked_email_domains: parseDomains(
      map['invite_abuse_setting.blocked_email_domains']
    ),
    max_invites_per_inviter: num(
      'invite_abuse_setting.max_invites_per_inviter',
      2
    ),
    check_datacenter_ip: bool('invite_abuse_setting.check_datacenter_ip', true),
    use_ip_reputation_api: bool(
      'invite_abuse_setting.use_ip_reputation_api',
      true
    ),
    datacenter_cidr_list: parseDomains(
      map['invite_abuse_setting.datacenter_cidr_list']
    ),
    topup_unlock_threshold: (() => {
      const v = map['invite_abuse_setting.topup_unlock_threshold']
      return v !== undefined ? parseFloat(v) || 50 : 50
    })(),
  }
}

export async function saveInviteAbuseSettings(
  cfg: InviteAbuseSettings
): Promise<boolean> {
  const items: [string, string][] = [
    ['invite_abuse_setting.enabled', String(cfg.enabled)],
    ['invite_abuse_setting.max_per_ip', String(cfg.max_per_ip)],
    ['invite_abuse_setting.window_hours', String(cfg.window_hours)],
    [
      'invite_abuse_setting.check_inviter_same_ip',
      String(cfg.check_inviter_same_ip),
    ],
    ['invite_abuse_setting.check_email_alias', String(cfg.check_email_alias)],
    ['invite_abuse_setting.check_fingerprint', String(cfg.check_fingerprint)],
    [
      'invite_abuse_setting.blocked_email_domains',
      serializeDomains(cfg.blocked_email_domains),
    ],
    [
      'invite_abuse_setting.max_invites_per_inviter',
      String(cfg.max_invites_per_inviter),
    ],
    ['invite_abuse_setting.check_datacenter_ip', String(cfg.check_datacenter_ip)],
    [
      'invite_abuse_setting.use_ip_reputation_api',
      String(cfg.use_ip_reputation_api),
    ],
    [
      'invite_abuse_setting.datacenter_cidr_list',
      serializeDomains(cfg.datacenter_cidr_list),
    ],
    [
      'invite_abuse_setting.topup_unlock_threshold',
      String(cfg.topup_unlock_threshold),
    ],
  ]
  const results = await Promise.all(
    items.map(([key, value]) => api.put('/api/option/', { key, value }))
  )
  return results.every((r) => r?.data?.success)
}
