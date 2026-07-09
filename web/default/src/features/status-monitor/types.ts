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
export type ComponentStatus =
  | 'operational'
  | 'degraded'
  | 'down'
  | 'maintenance'
  | 'nodata'

export type StatusWindow = '90m' | '24h' | '7d' | '30d'

export interface UptimeBar {
  t: number
  status?: ComponentStatus
  pct?: number | null
  ms?: number | null
}

export interface ComponentMetrics {
  cache_hit?: number | null
  success?: number | null
  ttft_p50?: number | null
  ttft_p95?: number | null
}

export interface StatusComponent {
  key: string
  name: string
  desc?: string
  category?: string
  status: ComponentStatus
  uptime?: Partial<Record<StatusWindow, number | null>>
  bars?: Partial<Record<StatusWindow, UptimeBar[]>>
  latency_ms?: number | null
  latency_60m?: { ms: number }[]
  metrics?: ComponentMetrics
}

export interface StatusData {
  overall: ComponentStatus
  updated?: number
  windows?: StatusWindow[]
  components?: StatusComponent[]
}

export interface Annotation {
  id: string
  type: 'info' | 'maintenance' | 'incident' | 'resolved'
  title: string
  date?: string
  body?: string
}

export interface StatusMeta {
  config?: { title?: string; subtitle?: string }
  annotations?: Annotation[]
}

export interface MonitorGroup {
  key: string
  display?: string
  enabled: boolean
  model: string
  models?: string[]
}

export interface TrafficMetricRow {
  reqs?: number | null
  rpm?: number | null
  tokens?: number | null
  tpm?: number | null
  cache_hit?: number | null
  success?: number | null
  spend_usd?: number | null
}

export interface MetricsWindow {
  groups?: Record<string, TrafficMetricRow>
  overall?: TrafficMetricRow
}

export interface MetricsData {
  windows?: Record<string, MetricsWindow>
}
