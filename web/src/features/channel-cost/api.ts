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

import type { ApiResponse, ChannelCostRow, DailyProfitRow } from './types'

/** Get per-channel revenue/cost/profit statistics for a time range (admin). */
export async function getChannelCostStats(
  start: number,
  end: number
): Promise<ApiResponse<ChannelCostRow[]>> {
  const res = await api.get(`/api/log/channel_cost?start=${start}&end=${end}`)
  return res.data
}

/** Get the daily revenue/cost/profit trend for a time range (admin). */
export async function getProfitReport(
  start: number,
  end: number
): Promise<ApiResponse<DailyProfitRow[]>> {
  const res = await api.get(`/api/log/profit_report?start=${start}&end=${end}`)
  return res.data
}
