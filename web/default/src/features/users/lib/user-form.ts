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
import { z } from "zod";

import {
  type PermissionCatalog,
  type AdminPermissionMatrix,
  normalizeAdminPermissions,
} from "@/lib/admin-permissions";
import { quotaUnitsToDollars } from "@/lib/format";
import { ROLE } from "@/lib/roles";

import { DEFAULT_GROUP } from "../constants";
import type { UserFormData, User } from "../types";

// ============================================================================
// Form Schema
// ============================================================================

export const userFormSchema = z.object({
  username: z.string().min(1, "Username is required"),
  display_name: z.string().optional(),
  password: z.string().optional(),
  role: z.number().optional(),
  quota_dollars: z.number().min(0).optional(),
  group: z.string().optional(),
  remark: z.string().optional(),
  admin_permissions: z
    .record(z.string(), z.record(z.string(), z.boolean()))
    .optional(),
  // Fork customization: per-user recharge discount rate (0-1, 1 = no discount);
  // combined with the global discount, the lower (better) rate applies.
  topup_discount: z.number().min(0).max(1).optional(),
  // Fork customization: visible-group whitelist (display-only). Empty = all
  // available groups are shown. Persisted via a dedicated batch endpoint.
  visible_groups: z.array(z.string()).optional(),
  // Fork customization: per-user group ratio overrides (billing + display).
  // Rows form in the UI; converted to a {group: ratio} map on save via a
  // dedicated endpoint. Priority: personal > GroupGroupRatio > global.
  group_ratios: z
    .array(z.object({ group: z.string(), ratio: z.number().min(0) }))
    .optional(),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

// ============================================================================
// Form Defaults
// ============================================================================

export const USER_FORM_DEFAULT_VALUES: UserFormValues = {
  username: "",
  display_name: "",
  password: "",
  role: 1, // Default to common user
  quota_dollars: 0,
  group: DEFAULT_GROUP,
  remark: "",
  // Filled against the backend catalog at render time; see UsersMutateDrawer.
  admin_permissions: {},
  topup_discount: 1,
  visible_groups: [],
  group_ratios: [],
};

// ============================================================================
// Form Data Transformation
// ============================================================================

/**
 * Transform form data to API payload
 */
export function transformFormDataToPayload(
  data: UserFormValues,
  userId?: number,
  catalog?: PermissionCatalog,
): UserFormData & { id?: number } {
  const payload: UserFormData & { id?: number } = {
    username: data.username,
    display_name: data.display_name || data.username,
    password: data.password || undefined,
  };

  const role = userId === undefined ? data.role || 1 : (data.role ?? 0);

  // Only send the permission matrix when the target is an admin and the catalog
  // is available; without the catalog we cannot build a full matrix, so we omit
  // the field (the backend then leaves existing permissions untouched).
  if (role >= ROLE.ADMIN && catalog) {
    payload.admin_permissions = normalizeAdminPermissions(
      data.admin_permissions as AdminPermissionMatrix | undefined,
      catalog,
    );
  }

  // For create: only send required fields
  if (userId === undefined) {
    payload.role = role;
  } else {
    // For update: quota is adjusted atomically via /api/user/manage, not sent here
    payload.group = data.group;
    payload.remark = data.remark || undefined;
    payload.id = userId;
    // Recharge discount: only send a valid rate (0 < x <= 1); the backend guards
    // against zero-value overwrites, but we omit invalid values to be safe.
    if (
      data.topup_discount !== undefined &&
      data.topup_discount > 0 &&
      data.topup_discount <= 1
    ) {
      payload.topup_discount = data.topup_discount;
    }
  }

  return payload;
}

/**
 * Transform user data to form defaults. The admin permission matrix is passed
 * through as-is (the backend already returns a full matrix); it is filled against
 * the catalog at render time in UsersMutateDrawer.
 */
export function transformUserToFormDefaults(user: User): UserFormValues {
  return {
    username: user.username,
    display_name: user.display_name,
    password: "",
    role: user.role,
    quota_dollars: quotaUnitsToDollars(user.quota),
    group: user.group || DEFAULT_GROUP,
    remark: user.remark || "",
    admin_permissions: user.admin_permissions ?? {},
    topup_discount:
      typeof user.topup_discount === "number" && user.topup_discount > 0
        ? user.topup_discount
        : 1,
    visible_groups: parseVisibleGroups(user.setting),
    group_ratios: parseGroupRatios(user.setting),
  };
}

/** Extract the visible-group whitelist from the user's setting JSON blob. */
function parseVisibleGroups(setting: string | undefined): string[] {
  if (!setting) return [];
  try {
    const parsed = JSON.parse(setting) as { visible_groups?: string[] };
    return Array.isArray(parsed.visible_groups) ? parsed.visible_groups : [];
  } catch {
    return [];
  }
}

/** Extract personal group ratio overrides from the user's setting JSON blob. */
function parseGroupRatios(
  setting: string | undefined,
): Array<{ group: string; ratio: number }> {
  if (!setting) return [];
  try {
    const parsed = JSON.parse(setting) as {
      group_ratios?: Record<string, number>;
    };
    if (!parsed.group_ratios || typeof parsed.group_ratios !== "object") {
      return [];
    }
    return Object.entries(parsed.group_ratios)
      .filter(([group, ratio]) => group && typeof ratio === "number")
      .map(([group, ratio]) => ({ group, ratio }));
  } catch {
    return [];
  }
}
