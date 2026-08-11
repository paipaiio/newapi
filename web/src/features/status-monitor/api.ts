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

import type {
  Annotation,
  MetricsData,
  MonitorGroup,
  StatusData,
  StatusMeta,
} from './types'

const BASE = '/api/tt-status/api'

/** Public: current status snapshot. */
export async function getStatus(): Promise<StatusData> {
  const res = await api.get(`${BASE}/status`)
  return res.data
}

/** Public: page meta (title/subtitle) + annotations. */
export async function getStatusMeta(): Promise<StatusMeta> {
  const res = await api.get(`${BASE}/meta`)
  return res.data
}

/** Determine whether the current session is an admin. */
export async function getWhoami(): Promise<boolean> {
  const res = await api.get(`${BASE}/whoami`)
  return !!res.data?.admin
}

/** Admin: list monitored groups with their config. */
export async function getMonitorGroups(): Promise<MonitorGroup[]> {
  const res = await api.get(`${BASE}/groups`)
  return res.data?.groups || []
}

/** Admin: traffic metrics windows. */
export async function getTrafficMetrics(): Promise<MetricsData | null> {
  const res = await api.get(`${BASE}/metrics`)
  return res.data?.windows ? res.data : null
}

/** Admin: patch a group's monitoring config. */
export async function saveGroupConfig(
  key: string,
  patch: Partial<MonitorGroup>
): Promise<void> {
  await api.post(`${BASE}/config`, { config: { groups: { [key]: patch } } })
}

/** Admin: add an annotation; returns the updated annotation list. */
export async function addAnnotation(payload: {
  type: string
  title: string
  date: string
  body: string
}): Promise<Annotation[]> {
  const res = await api.post(`${BASE}/annotation`, payload)
  return res.data?.annotations || []
}

/** Admin: delete an annotation; returns the updated annotation list. */
export async function deleteAnnotation(id: string): Promise<Annotation[]> {
  const res = await api.post(`${BASE}/annotation/delete`, { id })
  return res.data?.annotations || []
}
