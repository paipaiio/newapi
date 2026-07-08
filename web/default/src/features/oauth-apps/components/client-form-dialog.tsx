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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/dialog";
import { MultiSelect, type Option } from "@/components/multi-select";
import {
  createOAuthClient,
  type CreateClientResult,
  type OAuthClientPayload,
  updateOAuthClient,
} from "../api";
import { EMPTY_CLIENT, type OAuthClientInput, SCOPE_OPTIONS } from "../types";

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: OAuthClientInput | null;
  onSaved: () => void;
  /** Called with one-time credentials after creating a private client. */
  onCredentials: (result: CreateClientResult) => void;
}

const scopeItems: Option[] = SCOPE_OPTIONS.map((s) => ({ value: s, label: s }));

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved,
  onCredentials,
}: ClientFormDialogProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<OAuthClientInput>(EMPTY_CLIENT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(client ? { ...client } : { ...EMPTY_CLIENT });
  }, [open, client]);

  const isEdit = !!form.id;
  const update = (patch: Partial<OAuthClientInput>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t("Application name is required"));
      return;
    }
    const uris = form.redirect_uris
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (uris.length === 0) {
      toast.error(t("At least one http(s) redirect URI is required"));
      return;
    }
    const payload: OAuthClientPayload = {
      name: form.name.trim(),
      logo: form.logo.trim(),
      redirect_uris: uris,
      scopes: form.scopes,
      is_public: form.is_public,
      auto_approve: form.auto_approve,
      enabled: form.enabled,
    };
    setSaving(true);
    try {
      if (isEdit) {
        const res = await updateOAuthClient(form.id, payload);
        if (res.success) {
          toast.success(t("Saved successfully"));
          onOpenChange(false);
          onSaved();
        } else {
          toast.error(res.message || t("Save failed"));
        }
      } else {
        const res = await createOAuthClient(payload);
        if (res.success) {
          toast.success(t("Saved successfully"));
          onOpenChange(false);
          onSaved();
          if (res.data?.client_secret) onCredentials(res.data);
        } else {
          toast.error(res.message || t("Save failed"));
        }
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
      title={isEdit ? t("Edit application") : t("Add application")}
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
      <div className="space-y-1.5">
        <Label>{t("Application name")}</Label>
        <Input
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("Logo URL")}</Label>
        <Input
          value={form.logo}
          placeholder="https://..."
          onChange={(e) => update({ logo: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("Redirect URIs (one per line)")}</Label>
        <Textarea
          value={form.redirect_uris}
          placeholder="https://app.example.com/callback"
          rows={3}
          onChange={(e) => update({ redirect_uris: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Scopes</Label>
        <MultiSelect
          options={scopeItems}
          selected={form.scopes}
          onChange={(scopes) => update({ scopes })}
          allowCreate
          placeholder={t("Select scopes")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-6 pt-1">
        <div className="flex items-center gap-2">
          <Switch
            checked={form.is_public}
            onCheckedChange={(v) => update({ is_public: v })}
          />
          <Label>{t("Public client (PKCE, no secret)")}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.auto_approve}
            onCheckedChange={(v) => update({ auto_approve: v })}
          />
          <Label>{t("Skip consent (trusted app)")}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
          <Label>{t("Enabled")}</Label>
        </div>
      </div>
    </Dialog>
  );
}
