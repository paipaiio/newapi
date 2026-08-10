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
