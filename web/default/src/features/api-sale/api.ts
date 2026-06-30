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
import type { ApiResponse, ApiSaleItem, ApiSaleResult } from './types'

/**
 * Batch create user accounts with API keys (admin only).
 */
export async function batchCreateApiSale(
  items: ApiSaleItem[]
): Promise<ApiResponse<ApiSaleResult[]>> {
  const res = await api.post('/api/user/api-sale/batch', items)
  return res.data
}

/**
 * Get all available groups.
 */
export async function getGroups(): Promise<ApiResponse<string[]>> {
  const res = await api.get('/api/group/')
  return res.data
}
