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

import type { ApiResponse, TokenLookupPage } from './types'

/** Admin: look up tokens by keyword (API key / username / batch id). */
export async function lookupTokens(
  keyword: string
): Promise<ApiResponse<TokenLookupPage>> {
  const res = await api.get(
    `/api/user/token/lookup?keyword=${encodeURIComponent(keyword)}&p=1&page_size=100`
  )
  return res.data
}

/** Admin: set per-token RPM/TPM rate limits. */
export async function setTokenRateLimit(
  tokenId: number,
  rpm: number,
  tpm: number
): Promise<ApiResponse<null>> {
  const res = await api.post('/api/user/token/rate_limit', {
    token_id: tokenId,
    rpm,
    tpm,
  })
  return res.data
}
