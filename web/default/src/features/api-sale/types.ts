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
  success: boolean;
  message?: string;
  data?: T;
}

export interface ApiSaleItem {
  username: string;
  password: string;
  custom_key: string;
  group: string;
  quota: number;
  unlimited: boolean;
}

export interface ApiSaleResult {
  username: string;
  password: string;
  api_key: string;
  group: string;
  quota: number;
  error?: string;
}

/** Aggregated statistics for a sale batch (mirrors backend batch/stats). */
export interface BatchStat {
  batch_id: string;
  user_count: number;
  total_remain: number;
  total_used: number;
  created: number;
}

/** A single token row returned by the admin token lookup (used for CSV export). */
export interface TokenLookupItem {
  username?: string;
  email?: string;
  full_key?: string;
  group?: string;
  batch_id?: string;
}
