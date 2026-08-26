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

import type { SuccessStatsParams, SuccessStatsResponse } from './types'

function buildParams(params: SuccessStatsParams): string {
  const p = new URLSearchParams()
  if (params.start) p.set('start', String(params.start))
  if (params.end) p.set('end', String(params.end))
  if (params.username) p.set('username', params.username)
  if (params.user_id) p.set('user_id', String(params.user_id))
  if (params.model_name) p.set('model_name', params.model_name)
  return p.toString()
}

export async function getSuccessStats(
  params: SuccessStatsParams
): Promise<{ data: SuccessStatsResponse }> {
  const qs = buildParams(params)
  const res = await api.get(`/api/log/success_stats${qs ? '?' + qs : ''}`)
  return res.data
}

export async function getSelfSuccessStats(
  params: SuccessStatsParams
): Promise<{ data: SuccessStatsResponse }> {
  const qs = buildParams(params)
  const res = await api.get(`/api/log/self/success_stats${qs ? '?' + qs : ''}`)
  return res.data
}
