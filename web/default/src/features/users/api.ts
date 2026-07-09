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
import type { PermissionCatalog } from "@/lib/admin-permissions";
import { api } from "@/lib/api";

import type {
  User,
  GetUsersParams,
  GetUsersResponse,
  SearchUsersParams,
  UserFormData,
  ManageUserAction,
  ManageUserQuotaPayload,
  ApiResponse,
} from "./types";

// ============================================================================
// User Management APIs
// ============================================================================

/**
 * Get paginated users list
 */
export async function getUsers(
  params: GetUsersParams = {},
): Promise<GetUsersResponse> {
  const { p = 1, page_size = 10 } = params;
  const res = await api.get(`/api/user/?p=${p}&page_size=${page_size}`);
  return res.data;
}

/**
 * Search users by keyword or group
 */
export async function searchUsers(
  params: SearchUsersParams,
): Promise<GetUsersResponse> {
  const {
    keyword = "",
    group = "",
    role = "",
    status = "",
    p = 1,
    page_size = 10,
  } = params;
  const queryParams = new URLSearchParams();
  queryParams.set("keyword", keyword);
  queryParams.set("group", group);
  if (role) queryParams.set("role", role);
  if (status) queryParams.set("status", status);
  queryParams.set("p", String(p));
  queryParams.set("page_size", String(page_size));
  const res = await api.get(`/api/user/search?${queryParams.toString()}`);
  return res.data;
}

/**
 * Get single user by ID
 */
export async function getUser(id: number): Promise<ApiResponse<User>> {
  const res = await api.get(`/api/user/${id}`);
  return res.data;
}

/**
 * Create a new user
 */
export async function createUser(
  data: UserFormData,
): Promise<ApiResponse<User>> {
  const res = await api.post("/api/user/", data);
  return res.data;
}

/**
 * Update an existing user
 */
export async function updateUser(
  data: UserFormData & { id: number },
): Promise<ApiResponse<Partial<User>>> {
  const res = await api.put("/api/user/", data);
  return res.data;
}

/**
 * Delete a single user (hard delete)
 */
export async function deleteUser(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/user/${id}/`);
  return res.data;
}

/**
 * Manage user (promote, demote, enable, disable, delete)
 */
export async function manageUser(
  id: number,
  action: ManageUserAction,
): Promise<ApiResponse<Partial<User>>> {
  const res = await api.post("/api/user/manage", { id, action });
  return res.data;
}

/**
 * Adjust user quota atomically (add/subtract/override)
 */
export async function adjustUserQuota(
  payload: ManageUserQuotaPayload,
): Promise<ApiResponse<Partial<User>>> {
  const res = await api.post("/api/user/manage", payload);
  return res.data;
}

/**
 * Set the visible-group whitelist for one or more users (display-only). An
 * empty `groups` array clears the restriction (all available groups shown).
 */
export async function setVisibleGroups(
  ids: number[],
  groups: string[],
): Promise<ApiResponse> {
  const res = await api.post("/api/user/manage/batch_visible_groups", {
    ids,
    groups,
  });
  return res.data;
}

/**
 * Batch enable / disable / delete / enable_login / disable_login for many users.
 * POST /api/user/manage/batch_action  body: { ids, action }
 */
export async function batchManageUser(
  ids: number[],
  action: "enable" | "disable" | "delete" | "enable_login" | "disable_login",
): Promise<ApiResponse> {
  const res = await api.post("/api/user/manage/batch_action", { ids, action });
  return res.data;
}

/**
 * Batch toggle online top-up permission.
 * POST /api/user/manage/batch_topup  body: { ids, allow_topup }
 */
export async function batchSetTopup(
  ids: number[],
  allowTopup: boolean,
): Promise<ApiResponse> {
  const res = await api.post("/api/user/manage/batch_topup", {
    ids,
    allow_topup: allowTopup,
  });
  return res.data;
}

/**
 * Batch reassign user group.
 * POST /api/user/manage/batch_group  body: { ids, group }
 */
export async function batchSetGroup(
  ids: number[],
  group: string,
): Promise<ApiResponse> {
  const res = await api.post("/api/user/manage/batch_group", { ids, group });
  return res.data;
}

/**
 * Batch adjust user quota. `value` is the internal quota unit (already
 * converted from display currency). mode: add / subtract / override.
 * POST /api/user/manage/batch_quota  body: { ids, mode, value }
 */
export async function batchManageQuota(
  ids: number[],
  mode: "add" | "subtract" | "override",
  value: number,
): Promise<ApiResponse> {
  const res = await api.post("/api/user/manage/batch_quota", {
    ids,
    mode,
    value,
  });
  return res.data;
}

/**
 * Reset user's Passkey registration
 */
export async function resetUserPasskey(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/user/${id}/reset_passkey`);
  return res.data;
}

/**
 * Reset user's Two-Factor Authentication setup
 */
export async function resetUserTwoFA(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/user/${id}/2fa`);
  return res.data;
}

/**
 * Get all available groups
 */
export async function getGroups(): Promise<ApiResponse<string[]>> {
  const res = await api.get("/api/group/");
  return res.data;
}

/**
 * Get the permission catalog (resources, actions, and role baselines).
 * Source of truth lives in the backend authz package.
 */
export async function getPermissionCatalog(): Promise<PermissionCatalog> {
  const res = await api.get("/api/authz/catalog");
  return {
    resources: res.data?.data?.resources ?? [],
    roles: res.data?.data?.roles ?? [],
  };
}

// ============================================================================
// Admin Binding Management APIs
// ============================================================================

export interface OAuthBinding {
  provider_id: string;
  provider_name: string;
  user_id?: number;
  external_id?: string;
}

/**
 * Get user's custom OAuth bindings (admin)
 */
export async function getUserOAuthBindings(
  userId: number,
): Promise<ApiResponse<OAuthBinding[]>> {
  const res = await api.get(`/api/user/${userId}/oauth/bindings`);
  return res.data;
}

/**
 * Clear a user's built-in binding (admin)
 */
export async function adminClearUserBinding(
  userId: number,
  bindingType: string,
): Promise<ApiResponse> {
  const res = await api.delete(`/api/user/${userId}/bindings/${bindingType}`);
  return res.data;
}

/**
 * Unbind custom OAuth for a user (admin)
 */
export async function adminUnbindCustomOAuth(
  userId: number,
  providerId: string,
): Promise<ApiResponse> {
  const res = await api.delete(
    `/api/user/${userId}/oauth/bindings/${providerId}`,
  );
  return res.data;
}
