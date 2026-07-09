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
import { api } from "@/lib/api";
import { LOG_TYPE_ALL_VALUE } from "../constants";

export interface ExportLogsFilters {
  type?: string;
  username?: string;
  token?: string;
  model?: string;
  channel?: string;
  group?: string;
  requestId?: string;
  /** Unix seconds. */
  startTimestamp?: number;
  endTimestamp?: number;
}

/**
 * Download the current usage logs as a CSV file. Uses the admin export
 * endpoint when `isAdmin`, otherwise the self-scoped endpoint.
 */
export async function exportUsageLogs(
  isAdmin: boolean,
  filters: ExportLogsFilters,
): Promise<void> {
  const params = new URLSearchParams();
  params.set("type", filters.type ?? LOG_TYPE_ALL_VALUE);
  if (filters.token) params.set("token_name", filters.token);
  if (filters.model) params.set("model_name", filters.model);
  if (filters.group) params.set("group", filters.group);
  if (filters.requestId) params.set("request_id", filters.requestId);
  if (filters.startTimestamp) {
    params.set("start_timestamp", String(filters.startTimestamp));
  }
  if (filters.endTimestamp) {
    params.set("end_timestamp", String(filters.endTimestamp));
  }
  if (isAdmin) {
    if (filters.username) params.set("username", filters.username);
    if (filters.channel) params.set("channel", filters.channel);
  }

  const path = isAdmin ? "/api/log/export" : "/api/log/self/export";
  const res = await api.get(`${path}?${params.toString()}`, {
    responseType: "blob",
  });

  const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `usage_logs_${new Date().toISOString().slice(0, 19).replaceAll(/[:T]/g, "")}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
