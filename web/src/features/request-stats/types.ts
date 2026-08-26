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
export interface SuccessStatsSummary {
  total: number
  success: number
  failed: number
  success_rate: number // 0-100
  avg_use_time: number // seconds
}

export interface SuccessStatsDayPoint {
  date: string // YYYY-MM-DD
  total: number
  success: number
  failed: number
}

export interface SuccessStatsErrorReason {
  reason: string
  count: number
  pct: number // % of total failures
}

export interface SuccessStatsUserRow {
  user_id: number
  username: string
  total: number
  success: number
  failed: number
  success_rate: number
}

export interface SuccessStatsResponse {
  summary: SuccessStatsSummary
  trend: SuccessStatsDayPoint[]
  errors: SuccessStatsErrorReason[]
  by_user?: SuccessStatsUserRow[]
}

export interface SuccessStatsParams {
  start?: number // Unix seconds
  end?: number
  username?: string
  user_id?: number
  model_name?: string
}
