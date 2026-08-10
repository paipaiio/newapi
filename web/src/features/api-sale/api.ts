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
  ApiResponse,
  ApiSaleItem,
  ApiSaleResult,
  BatchStat,
  TokenLookupItem,
} from './types'

/**
 * Batch create user accounts with API keys (admin only).
 */
export async function batchCreateApiSale(
  items: ApiSaleItem[]
): Promise<ApiResponse<ApiSaleResult[]>> {
  const res = await api.post('/api/user/api-sale/batch', items)
  return res.data
}

export { getAllGroupNames } from '@/features/users/api'

/**
 * Get aggregated statistics for all sale batches (admin only).
 */
export async function getBatchStats(): Promise<ApiResponse<BatchStat[]>> {
  const res = await api.get('/api/user/batch/stats')
  return res.data
}

/**
 * Look up tokens by keyword (batch id) to build a per-batch CSV export.
 */
export async function lookupBatchTokens(
  batchId: string
): Promise<ApiResponse<{ items: TokenLookupItem[] }>> {
  const res = await api.get(
    `/api/user/token/lookup?keyword=${encodeURIComponent(batchId)}&p=1&page_size=1000`
  )
  return res.data
}
