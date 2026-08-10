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

import type { ApiResponse, OAuthClient } from './types'

export interface OAuthClientPayload {
  name: string
  logo: string
  redirect_uris: string[]
  scopes: string[]
  is_public: boolean
  auto_approve: boolean
  enabled: boolean
}

export type CreateClientResult = {
  client: OAuthClient
  client_secret: string
}

/** List all OAuth clients (admin). */
export async function getAllOAuthClients(): Promise<
  ApiResponse<OAuthClient[]>
> {
  const res = await api.get('/api/oauth_client/')
  return res.data
}

/** Create an OAuth client; the plaintext secret is returned once for private clients. */
export async function createOAuthClient(
  payload: OAuthClientPayload
): Promise<ApiResponse<CreateClientResult>> {
  const res = await api.post('/api/oauth_client/', payload)
  return res.data
}

/** Update an existing OAuth client. */
export async function updateOAuthClient(
  id: number,
  payload: OAuthClientPayload
): Promise<ApiResponse<OAuthClient>> {
  const res = await api.put(`/api/oauth_client/${id}`, payload)
  return res.data
}

/** Delete an OAuth client. */
export async function deleteOAuthClient(
  id: number
): Promise<ApiResponse<null>> {
  const res = await api.delete(`/api/oauth_client/${id}`)
  return res.data
}

/** Rotate a private client's secret; returns the new plaintext secret once. */
export async function rotateOAuthClientSecret(
  id: number
): Promise<ApiResponse<{ client_secret: string }>> {
  const res = await api.post(`/api/oauth_client/${id}/rotate_secret`)
  return res.data
}

/** Read whether the OAuth provider is enabled (option oauth_server.enabled). */
export async function getProviderEnabled(): Promise<boolean> {
  const res = await api.get('/api/option/')
  if (!res.data?.success) return false
  const opt = ((res.data.data || []) as { key: string; value: string }[]).find(
    (o) => o.key === 'oauth_server.enabled'
  )
  return opt?.value === 'true'
}

/** Toggle the OAuth provider on/off. */
export async function setProviderEnabled(
  enabled: boolean
): Promise<ApiResponse<null>> {
  const res = await api.put('/api/option/', {
    key: 'oauth_server.enabled',
    value: enabled ? 'true' : 'false',
  })
  return res.data
}

export interface ConsentInfo {
  client_name: string
  client_logo: string
  scopes: string[]
  auto_approve?: boolean
}

/** User-facing: fetch the consent request details. */
export async function getOAuthConsent(
  requestId: string
): Promise<ApiResponse<ConsentInfo>> {
  const res = await api.get(`/api/oauth/consent/${requestId}`)
  return res.data
}

/** User-facing: approve or deny a consent request; returns a redirect URL. */
export async function postOAuthConsent(
  requestId: string,
  action: 'approve' | 'deny'
): Promise<ApiResponse<{ redirect: string }>> {
  const res = await api.post(`/api/oauth/consent/${requestId}`, { action })
  return res.data
}
