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
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog } from "@/components/dialog";
import { MultiSelect, type Option } from "@/components/multi-select";
import { getUsers } from "@/features/users/api";
import { setExclusiveGroup } from "../api";

interface ExclusiveEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Non-empty when editing an existing exclusive group. */
  groupName: string;
  initialUserIds: number[];
  /** Groups available to newly mark as exclusive (excludes existing ones). */
  availableGroups: string[];
  /** Resolved userId -> username labels for already-authorized users. */
  userLabels: Record<number, string>;
  onSaved: () => void;
}

export function ExclusiveEditDialog({
  open,
  onOpenChange,
  groupName,
  initialUserIds,
  availableGroups,
  userLabels,
  onSaved,
}: ExclusiveEditDialogProps) {
  const { t } = useTranslation();
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const isEdit = !!groupName;

  useEffect(() => {
    if (open) {
      setSelectedGroup(groupName);
      setSelectedUsers(initialUserIds.map(String));
    }
  }, [open, groupName, initialUserIds]);

  // Preload a batch of users for selection (client-side filtered by MultiSelect).
  const { data: userBatch } = useQuery({
    queryKey: ["group-exclusive-users"],
    queryFn: async () => {
      const res = await getUsers({ p: 1, page_size: 100 });
      return res.success ? res.data?.items || [] : [];
    },
    enabled: open,
  });

  const userOptions = useMemo<Option[]>(() => {
    const map = new Map<string, string>();
    // Already-authorized users (resolved labels) come first so they stay visible.
    for (const id of initialUserIds) {
      map.set(
        String(id),
        userLabels[id] ? `${userLabels[id]} (ID:${id})` : `ID:${id}`,
      );
    }
    for (const u of userBatch || []) {
      map.set(String(u.id), `${u.username} (ID:${u.id})`);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [userBatch, initialUserIds, userLabels]);

  const handleSave = async () => {
    const group = isEdit ? groupName : selectedGroup;
    if (!group) {
      toast.error(t("Please select a group"));
      return;
    }
    setSaving(true);
    try {
      const res = await setExclusiveGroup(group, selectedUsers.map(Number));
      if (res.success) {
        toast.success(t("Saved successfully"));
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(res.message || t("Save failed"));
      }
    } catch {
      toast.error(t("Request failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        isEdit
          ? `${t("Edit authorization")}: ${groupName}`
          : t("New exclusive group")
      }
      contentClassName="sm:max-w-lg"
      contentHeight="auto"
      bodyClassName="space-y-4"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {t("Save")}
          </Button>
        </div>
      }
    >
      {!isEdit && (
        <div className="space-y-1.5">
          <Label>{t("Select group")}</Label>
          <Select
            value={selectedGroup}
            onValueChange={(v) => setSelectedGroup(v ?? "")}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t("Select a group to make exclusive")}
              />
            </SelectTrigger>
            <SelectContent>
              {availableGroups.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableGroups.length === 0 && (
            <p className="text-muted-foreground text-xs">
              {t("No groups available (define one in group ratios first)")}
            </p>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <Label>{t("Authorized users")}</Label>
        <MultiSelect
          options={userOptions}
          selected={selectedUsers}
          onChange={setSelectedUsers}
          placeholder={t("Select users, or type to search")}
          emptyText={t("No users")}
        />
        <p className="text-muted-foreground text-xs">
          {t("Leave empty and save = remove the exclusivity of this group")}
        </p>
      </div>
    </Dialog>
  );
}
