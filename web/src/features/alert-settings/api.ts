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

const QUOTA_PER_UNIT = 500000

export interface AlertSettings {
  enabled: boolean
  abnormal_usage_enabled: boolean
  /** Threshold in internal quota units. */
  abnormal_usage_threshold: number
  quota_surge_enabled: boolean
  quota_surge_threshold: number
  daily_report_enabled: boolean
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  enabled: false,
  abnormal_usage_enabled: false,
  abnormal_usage_threshold: 5000000,
  quota_surge_enabled: false,
  quota_surge_threshold: 50000000,
  daily_report_enabled: false,
}

export { QUOTA_PER_UNIT }

interface OptionItem {
  key: string
  value: string
}

/** Load alert settings from the global option store. */
export async function getAlertSettings(): Promise<AlertSettings> {
  const res = await api.get('/api/option/')
  if (!res.data?.success) return { ...DEFAULT_ALERT_SETTINGS }
  const map: Record<string, string> = {}
  for (const o of (res.data.data || []) as OptionItem[]) map[o.key] = o.value
  return {
    enabled: map['alert_setting.enabled'] === 'true',
    abnormal_usage_enabled:
      map['alert_setting.abnormal_usage_enabled'] === 'true',
    abnormal_usage_threshold: Number.parseInt(
      map['alert_setting.abnormal_usage_threshold'] || '5000000',
      10
    ),
    quota_surge_enabled: map['alert_setting.quota_surge_enabled'] === 'true',
    quota_surge_threshold: Number.parseInt(
      map['alert_setting.quota_surge_threshold'] || '50000000',
      10
    ),
    daily_report_enabled: map['alert_setting.daily_report_enabled'] === 'true',
  }
}

/** Persist alert settings (one option key per field). */
export async function saveAlertSettings(cfg: AlertSettings): Promise<boolean> {
  const items: [string, string][] = [
    ['alert_setting.enabled', String(cfg.enabled)],
    [
      'alert_setting.abnormal_usage_enabled',
      String(cfg.abnormal_usage_enabled),
    ],
    [
      'alert_setting.abnormal_usage_threshold',
      String(cfg.abnormal_usage_threshold),
    ],
    ['alert_setting.quota_surge_enabled', String(cfg.quota_surge_enabled)],
    ['alert_setting.quota_surge_threshold', String(cfg.quota_surge_threshold)],
    ['alert_setting.daily_report_enabled', String(cfg.daily_report_enabled)],
  ]
  const results = await Promise.all(
    items.map(([key, value]) => api.put('/api/option/', { key, value }))
  )
  return results.every((r) => r?.data?.success)
}
