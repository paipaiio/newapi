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
/** An "Other Service" entry (mirrors backend model.OtherService json tags). */
export interface OtherService {
  id: number
  name: string
  description: string
  url: string
  icon: string
  category: string
  sort_order: number
  enabled: boolean
  open_in_new_tab: boolean
  created_at?: number
  updated_at?: number
}

/** Editable subset used by the create/update form. */
export type OtherServiceInput = Omit<
  OtherService,
  'created_at' | 'updated_at'
>

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export const EMPTY_SERVICE: OtherServiceInput = {
  id: 0,
  name: '',
  description: '',
  url: '',
  icon: '',
  category: '',
  sort_order: 0,
  enabled: true,
  open_in_new_tab: true,
}
