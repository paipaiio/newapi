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

export type UserGroupsPreviewResponse = {
  success: boolean;
  message?: string;
  data?: {
    user_id: number;
    username: string;
    group: string;
    groups: Record<string, { ratio: number | string; desc: string }>;
  };
};

/** Admin: preview the visible groups + ratios for an arbitrary user. */
export async function getUserGroupsPreview(
  userId: number,
): Promise<UserGroupsPreviewResponse> {
  const res = await api.get<UserGroupsPreviewResponse>(
    `/api/user/${userId}/groups`,
  );
  return res.data;
}

export type GroupUsageStats = {
  users: number;
  tokens: number;
  channels: number;
};

export type GroupUsageResponse = {
  success: boolean;
  message?: string;
  data?: GroupUsageStats;
};

/** Admin: how many users / tokens / channels still reference a group. */
export async function getGroupUsage(name: string): Promise<GroupUsageResponse> {
  const res = await api.get<GroupUsageResponse>("/api/group/usage", {
    params: { name },
  });
  return res.data;
}
