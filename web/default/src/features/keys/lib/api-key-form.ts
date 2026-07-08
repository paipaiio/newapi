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
import type { TFunction } from "i18next";
import { z } from "zod";

import { parseQuotaFromDollars, quotaUnitsToDollars } from "@/lib/format";

import { DEFAULT_GROUP } from "../constants";
import type { ApiKeyFormData, ApiKey } from "../types";

// ============================================================================
// Form Schema
// ============================================================================

export function getApiKeyFormSchema(t: TFunction) {
  return z
    .object({
      name: z.string().min(1, t("Please enter a name")),
      remain_quota_dollars: z.number().optional(),
      expired_time: z.date().optional(),
      unlimited_quota: z.boolean(),
      model_limits: z.array(z.string()),
      allow_ips: z.string().optional(),
      group: z.string().optional(),
      // Additional groups appended to the primary group (comma-separated on the
      // wire); the backend routes across all of them in order.
      extra_groups: z.array(z.string()).optional(),
      cross_group_retry: z.boolean().optional(),
      rpm: z.number().min(0).optional(),
      tpm: z.number().min(0).optional(),
      tokenCount: z.number().min(1).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.unlimited_quota) {
        return;
      }

      if (
        data.remain_quota_dollars === undefined ||
        data.remain_quota_dollars < 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["remain_quota_dollars"],
          message: t("Quota must be zero or greater"),
        });
      }
    });
}

export type ApiKeyFormValues = z.infer<ReturnType<typeof getApiKeyFormSchema>>;

// ============================================================================
// Form Defaults
// ============================================================================

export const API_KEY_FORM_DEFAULT_VALUES: ApiKeyFormValues = {
  name: "",
  remain_quota_dollars: 10,
  expired_time: undefined,
  unlimited_quota: true,
  model_limits: [],
  allow_ips: "",
  group: DEFAULT_GROUP,
  extra_groups: [],
  cross_group_retry: true,
  rpm: 0,
  tpm: 0,
  tokenCount: 1,
};

export function getApiKeyFormDefaultValues(
  defaultUseAutoGroup: boolean,
): ApiKeyFormValues {
  return {
    ...API_KEY_FORM_DEFAULT_VALUES,
    group: defaultUseAutoGroup ? "auto" : DEFAULT_GROUP,
    cross_group_retry: defaultUseAutoGroup,
  };
}

// ============================================================================
// Form Data Transformation
// ============================================================================

/**
 * Transform form data to API payload
 */
export function transformFormDataToPayload(
  data: ApiKeyFormValues,
): ApiKeyFormData {
  return {
    name: data.name,
    remain_quota: data.unlimited_quota
      ? 0
      : parseQuotaFromDollars(data.remain_quota_dollars || 0),
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : -1,
    unlimited_quota: data.unlimited_quota,
    model_limits_enabled: data.model_limits.length > 0,
    model_limits: data.model_limits.join(","),
    allow_ips: data.allow_ips || "",
    group: buildGroupValue(data.group, data.extra_groups),
    cross_group_retry: data.group === "auto" ? !!data.cross_group_retry : false,
    rpm: data.rpm || 0,
    tpm: data.tpm || 0,
  };
}

/**
 * Join the primary group with any additional groups into the comma-separated
 * value the backend expects. The `auto` group never combines with extras.
 */
function buildGroupValue(
  group: string | undefined,
  extraGroups: string[] | undefined,
): string {
  const primary = group || "";
  if (primary === "auto") return primary;
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const g of [primary, ...(extraGroups ?? [])]) {
    const v = g.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      ordered.push(v);
    }
  }
  return ordered.join(",");
}

/**
 * Transform API key data to form defaults
 */
export function transformApiKeyToFormDefaults(
  apiKey: ApiKey,
): ApiKeyFormValues {
  return {
    name: apiKey.name,
    remain_quota_dollars: apiKey.unlimited_quota
      ? 0
      : quotaUnitsToDollars(apiKey.remain_quota),
    expired_time:
      apiKey.expired_time > 0
        ? new Date(apiKey.expired_time * 1000)
        : undefined,
    unlimited_quota: apiKey.unlimited_quota,
    model_limits: apiKey.model_limits
      ? apiKey.model_limits.split(",").filter(Boolean)
      : [],
    allow_ips: apiKey.allow_ips || "",
    group: parseGroups(apiKey.group).primary,
    extra_groups: parseGroups(apiKey.group).extras,
    cross_group_retry: !!apiKey.cross_group_retry,
    rpm: apiKey.rpm || 0,
    tpm: apiKey.tpm || 0,
    tokenCount: 1,
  };
}

/**
 * Split a stored comma-separated group value into the primary group plus any
 * additional groups for the form's separate controls.
 */
function parseGroups(group: string | null | undefined): {
  primary: string;
  extras: string[];
} {
  const parts = (group || "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  if (parts.length === 0) return { primary: DEFAULT_GROUP, extras: [] };
  return { primary: parts[0], extras: parts.slice(1) };
}
