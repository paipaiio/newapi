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
import type { ApiResponse, ExclusiveGroupItem } from './types'

/** List all exclusive groups with their authorized user ids (admin). */
export async function getExclusiveGroups(): Promise<
  ApiResponse<ExclusiveGroupItem[]>
> {
  const res = await api.get('/api/group/exclusive')
  return res.data
}

/**
 * Set the authorized user list for a group. Passing an empty `userIds`
 * removes the group's exclusivity.
 */
export async function setExclusiveGroup(
  groupName: string,
  userIds: number[]
): Promise<ApiResponse<null>> {
  const res = await api.post('/api/group/exclusive', {
    group_name: groupName,
    user_ids: userIds,
  })
  return res.data
}
