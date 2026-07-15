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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { GroupBadge } from "@/components/group-badge";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { API_KEY_STATUS, API_KEY_STATUSES } from "@/features/keys/constants";
import { ApiKeysMutateDrawer } from "@/features/keys/components/api-keys-mutate-drawer";
import type { ApiKey } from "@/features/keys/types";
import { formatQuota, formatTimestamp } from "@/lib/format";

import {
  adminDeleteUserToken,
  adminGetUserTokenKey,
  adminGetUserTokens,
  adminUpdateUserToken,
} from "../api";

interface UserKeysPanelProps {
  userId: number;
}

const PAGE_SIZE = 20;

export function UserKeysPanel({ userId }: UserKeysPanelProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<ApiKey | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const queryKey = ["adminUserTokens", userId, page];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => adminGetUserTokens(userId, page, PAGE_SIZE),
    staleTime: 30_000,
  });

  const items = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Status toggle
  const toggleMutation = useMutation({
    mutationFn: ({ token, newStatus }: { token: ApiKey; newStatus: number }) =>
      adminUpdateUserToken(userId, token.id, { status: newStatus }, true),
    onSuccess: (res, { newStatus }) => {
      if (res.success) {
        const label =
          newStatus === API_KEY_STATUS.ENABLED
            ? t("API Key enabled successfully")
            : t("API Key disabled successfully");
        toast.success(label);
        qc.invalidateQueries({ queryKey: ["adminUserTokens", userId] });
      } else {
        toast.error(res.message ?? t("Operation failed"));
      }
    },
    onError: () => toast.error(t("Operation failed")),
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: (token: ApiKey) => adminDeleteUserToken(userId, token.id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t("API Key deleted successfully"));
        qc.invalidateQueries({ queryKey: ["adminUserTokens", userId] });
      } else {
        toast.error(res.message ?? t("Delete failed"));
      }
    },
    onError: () => toast.error(t("Delete failed")),
  });

  // Copy full key
  const copyKeyMutation = useMutation({
    mutationFn: (token: ApiKey) => adminGetUserTokenKey(userId, token.id),
    onSuccess: async (res) => {
      if (res.success && res.data?.key) {
        // DB stores the raw key without prefix; the UI convention is `sk-`.
        const fullKey = `sk-${res.data.key}`;
        await navigator.clipboard.writeText(fullKey);
        toast.success(t("Copied to clipboard"));
      } else {
        toast.error(res.message ?? t("Failed to retrieve key"));
      }
    },
    onError: () => toast.error(t("Failed to retrieve key")),
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {t("No API keys")}
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[160px]">{t("Name")}</TableHead>
            <TableHead>{t("Status")}</TableHead>
            <TableHead>{t("Key")}</TableHead>
            <TableHead>{t("Quota")}</TableHead>
            <TableHead>{t("Group")}</TableHead>
            <TableHead>{t("RPM / TPM")}</TableHead>
            <TableHead>{t("Expires")}</TableHead>
            <TableHead className="text-right">{t("Actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((token) => {
            const statusInfo =
              API_KEY_STATUSES[token.status as keyof typeof API_KEY_STATUSES];
            const isActive = token.status === API_KEY_STATUS.ENABLED;
            const canToggle =
              token.status === API_KEY_STATUS.ENABLED ||
              token.status === API_KEY_STATUS.DISABLED;
            return (
              <TableRow key={token.id}>
                <TableCell className="font-medium max-w-[160px] truncate">
                  {token.name}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {statusInfo ? (
                      <StatusBadge
                        label={statusInfo.label}
                        variant={statusInfo.variant}
                      />
                    ) : (
                      <Badge variant="outline">{token.status}</Badge>
                    )}
                    {canToggle && (
                      <Switch
                        checked={isActive}
                        disabled={toggleMutation.isPending}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({
                            token,
                            newStatus: checked
                              ? API_KEY_STATUS.ENABLED
                              : API_KEY_STATUS.DISABLED,
                          })
                        }
                        aria-label={t("Toggle key status")}
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  sk-{token.key}
                </TableCell>
                <TableCell>
                  {token.unlimited_quota
                    ? t("Unlimited")
                    : formatQuota(token.remain_quota)}
                </TableCell>
                <TableCell>
                  {token.group ? (
                    <GroupBadge group={token.group} />
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {(token.rpm ?? 0) === 0 && (token.tpm ?? 0) === 0
                    ? "—"
                    : `${token.rpm ?? 0} / ${token.tpm ?? 0}`}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {token.expired_time === -1
                    ? t("Never")
                    : formatTimestamp(token.expired_time)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={t("Copy full key")}
                      disabled={copyKeyMutation.isPending}
                      onClick={() => copyKeyMutation.mutate(token)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={t("Edit")}
                      onClick={() => {
                        setEditTarget(token);
                        setEditOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title={t("Delete")}
                      onClick={() => {
                        setDeleteTarget(token);
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("Previous")}
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("Next")}
          </Button>
        </div>
      )}

      {/* Edit drawer — reuses the shared keys form in admin mode so it hits the
          per-user admin endpoints instead of the self-service ones. */}
      {editOpen && editTarget && (
        <ApiKeysMutateDrawer
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setEditTarget(null);
          }}
          currentRow={editTarget}
          adminUserId={userId}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["adminUserTokens", userId] })
          }
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete API Key")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Delete key "{{name}}"? This cannot be undone.', {
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget);
                  setDeleteOpen(false);
                }
              }}
            >
              {t("Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
