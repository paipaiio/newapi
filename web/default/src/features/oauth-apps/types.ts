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
export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

/**
 * An OAuth client (mirrors backend model.OAuthClient json tags). Note the
 * backend serializes `redirect_uris` as a newline-joined string and `scopes`
 * as a space-joined string.
 */
export interface OAuthClient {
  id: number
  client_id: string
  name: string
  logo: string
  redirect_uris: string
  scopes: string
  is_public: boolean
  auto_approve: boolean
  enabled: boolean
  created_at?: number
  updated_at?: number
}

/** Editable form model (arrays are joined/split at the API boundary). */
export interface OAuthClientInput {
  id: number
  name: string
  logo: string
  redirect_uris: string
  scopes: string[]
  is_public: boolean
  auto_approve: boolean
  enabled: boolean
}

export const SCOPE_OPTIONS = ['openid', 'profile', 'email', 'groups']

export const EMPTY_CLIENT: OAuthClientInput = {
  id: 0,
  name: '',
  logo: '',
  redirect_uris: '',
  scopes: ['openid', 'profile', 'email'],
  is_public: false,
  auto_approve: false,
  enabled: true,
}
