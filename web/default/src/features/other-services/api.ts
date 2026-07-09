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
import type { ApiResponse, OtherService, OtherServiceInput } from './types'

/** User-facing: list enabled services (ordered by sort_order). */
export async function getOtherServices(): Promise<
  ApiResponse<OtherService[]>
> {
  const res = await api.get('/api/other_service/')
  return res.data
}

/** Admin: list all services including disabled ones. */
export async function getAllOtherServices(): Promise<
  ApiResponse<OtherService[]>
> {
  const res = await api.get('/api/other_service/all')
  return res.data
}

/** Admin: create a new service. */
export async function createOtherService(
  payload: OtherServiceInput
): Promise<ApiResponse<OtherService>> {
  const res = await api.post('/api/other_service/', payload)
  return res.data
}

/** Admin: update an existing service. */
export async function updateOtherService(
  payload: OtherServiceInput
): Promise<ApiResponse<OtherService>> {
  const res = await api.put('/api/other_service/', payload)
  return res.data
}

/** Admin: delete a service by id. */
export async function deleteOtherService(
  id: number
): Promise<ApiResponse<null>> {
  const res = await api.delete(`/api/other_service/${id}`)
  return res.data
}
