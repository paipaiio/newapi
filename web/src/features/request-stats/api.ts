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
