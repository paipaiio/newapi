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
import { Download, Plus, Trash2 } from "lucide-react";
import { SectionPageLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { batchCreateApiSale, getGroups } from "./api";
import { BatchStatsSection } from "./components/batch-stats-section";
import type { ApiSaleItem } from "./types";

type Mode = "generate" | "import";

interface Row {
  id: string;
  username: string;
  password: string;
  customKey: string;
  group: string;
  quota: number;
  unlimited: boolean;
  status: "" | "ok" | "error";
  apiKey: string;
  errMsg: string;
}

const genId = () => Math.random().toString(36).slice(2);

const buildRow = (partial: Partial<Row> = {}): Row => ({
  id: genId(),
  username: "",
  password: "",
  customKey: "",
  group: "default",
  quota: 10,
  unlimited: false,
  status: "",
  apiKey: "",
  errMsg: "",
  ...partial,
});

function ApiSaleContent() {
  const { t } = useTranslation();

  const [mode, setMode] = useState<Mode>("generate");
  const [count, setCount] = useState(10);
  const [importText, setImportText] = useState("");

  const [defGroup, setDefGroup] = useState("default");
  const [defQuota, setDefQuota] = useState(10);
  const [defUnlimited, setDefUnlimited] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [groupOptions, setGroupOptions] = useState<string[]>(["default"]);
  const [loading, setLoading] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    getGroups()
      .then((res) => {
        if (res.success && res.data?.length) {
          setGroupOptions(res.data);
          setDefGroup(res.data[0]);
        }
      })
      .catch(() => {});
  }, []);

  const handlePreview = () => {
    const newRows: Row[] = [];
    if (mode === "generate") {
      for (let i = 0; i < (count || 1); i++) {
        newRows.push(
          buildRow({
            group: defGroup,
            quota: defQuota,
            unlimited: defUnlimited,
          }),
        );
      }
    } else {
      const keys = importText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!keys.length) {
        toast.error(t("Please enter at least one API Key"));
        return;
      }
      keys.forEach((k) =>
        newRows.push(
          buildRow({
            customKey: k,
            group: defGroup,
            quota: defQuota,
            unlimited: defUnlimited,
          }),
        ),
      );
    }
    setRows(newRows);
    setPreviewed(true);
    setCreated(false);
  };

  const updateRow = (id: string, field: keyof Row, value: unknown) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const deleteRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleBatchCreate = async () => {
    if (!rows.length) {
      toast.error(t("No items to create"));
      return;
    }
    setLoading(true);
    const items: ApiSaleItem[] = rows.map((r) => ({
      username: r.username,
      password: r.password,
      custom_key: r.customKey,
      group: r.group,
      quota: r.quota,
      unlimited: r.unlimited,
    }));
    try {
      const res = await batchCreateApiSale(items);
      if (res.success && res.data) {
        const data = res.data;
        setRows((prev) =>
          prev.map((r, i) => ({
            ...r,
            username: data[i]?.username || r.username,
            password: data[i]?.password || r.password,
            apiKey: data[i]?.api_key || "",
            status: data[i]?.error ? "error" : "ok",
            errMsg: data[i]?.error || "",
          })),
        );
        const failed = data.filter((d) => d.error).length;
        if (failed === 0) {
          toast.success(
            t("All {{n}} created successfully", { n: data.length }),
          );
        } else {
          toast.error(
            t("{{f}} failed, {{s}} succeeded", {
              f: failed,
              s: data.length - failed,
            }),
          );
        }
        setCreated(true);
      } else {
        toast.error(res.message || t("Batch creation failed"));
      }
    } catch {
      toast.error(t("Request failed"));
    }
    setLoading(false);
  };

  const handleDownload = () => {
    const header = "username,password,api_key,group,quota\n";
    const body = rows
      .filter((r) => r.status === "ok")
      .map(
        (r) =>
          `${r.username},${r.password},${r.apiKey},${r.group},${r.unlimited ? "unlimited" : r.quota}`,
      )
      .join("\n");
    const blob = new Blob([`﻿${header}${body}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `api_keys_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Config panel */}
      <div className="bg-muted/40 flex flex-wrap items-end gap-6 rounded-lg p-4">
        <div className="space-y-1">
          <Label>{t("Mode")}</Label>
          <RadioGroup
            value={mode}
            onValueChange={(v) => {
              setMode(v as Mode);
              setPreviewed(false);
              setRows([]);
            }}
            className="flex gap-4 pt-1"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="generate" id="m-gen" />
              <Label htmlFor="m-gen" className="font-normal">
                {t("Auto generate")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="import" id="m-imp" />
              <Label htmlFor="m-imp" className="font-normal">
                {t("Import keys")}
              </Label>
            </div>
          </RadioGroup>
        </div>

        {mode === "generate" ? (
          <div className="space-y-1">
            <Label>{t("Count")}</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-24"
            />
          </div>
        ) : (
          <div className="min-w-[280px] flex-1 space-y-1">
            <Label>{t("API Keys (one per line)")}</Label>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={3}
              placeholder={"sk-abc123\nsk-def456"}
            />
          </div>
        )}

        <div className="space-y-1">
          <Label>{t("Default group")}</Label>
          <Select
            value={defGroup}
            onValueChange={(value) => setDefGroup(value ?? "")}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupOptions.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>{t("Unlimited quota")}</Label>
          <div className="pt-1">
            <Switch checked={defUnlimited} onCheckedChange={setDefUnlimited} />
          </div>
        </div>

        {!defUnlimited && (
          <div className="space-y-1">
            <Label>{t("Default quota")}</Label>
            <Input
              type="number"
              min={0}
              value={defQuota}
              onChange={(e) => setDefQuota(Number(e.target.value))}
              className="w-28"
            />
          </div>
        )}

        <Button onClick={handlePreview}>
          <Plus className="mr-1 h-4 w-4" />
          {t("Generate preview")}
        </Button>
      </div>

      {/* Table */}
      {previewed && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {t("{{n}} records", { n: rows.length })}
            </span>
            <div className="flex gap-2">
              <Button
                onClick={handleBatchCreate}
                disabled={loading || !rows.length || created}
              >
                {t("Batch create")}
              </Button>
              {created && (
                <Button variant="outline" onClick={handleDownload}>
                  <Download className="mr-1 h-4 w-4" />
                  {t("Download CSV")}
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>{t("Username")}</TableHead>
                  <TableHead>{t("Password")}</TableHead>
                  <TableHead>{t("API Key")}</TableHead>
                  <TableHead className="w-36">{t("Group")}</TableHead>
                  <TableHead className="w-40">{t("Quota")}</TableHead>
                  <TableHead className="w-20">{t("Status")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={r.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>
                      {r.status === "ok" ? (
                        <span className="text-sm">{r.username}</span>
                      ) : (
                        <Input
                          value={r.username}
                          placeholder={t("Auto")}
                          onChange={(e) =>
                            updateRow(r.id, "username", e.target.value)
                          }
                          className="h-8"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status === "ok" ? (
                        <span className="text-sm">{r.password}</span>
                      ) : (
                        <Input
                          value={r.password}
                          placeholder={t("Auto")}
                          onChange={(e) =>
                            updateRow(r.id, "password", e.target.value)
                          }
                          className="h-8"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status === "ok" ? (
                        <span className="font-mono text-xs">{r.apiKey}</span>
                      ) : (
                        <Input
                          value={r.customKey}
                          placeholder={t("Auto")}
                          onChange={(e) =>
                            updateRow(r.id, "customKey", e.target.value)
                          }
                          className="h-8"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status === "ok" ? (
                        <Badge variant="secondary">{r.group}</Badge>
                      ) : (
                        <Select
                          value={r.group}
                          onValueChange={(v) => updateRow(r.id, "group", v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {groupOptions.map((g) => (
                              <SelectItem key={g} value={g}>
                                {g}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status === "ok" ? (
                        <span className="text-sm">
                          {r.unlimited ? t("Unlimited") : r.quota}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={r.unlimited}
                            onCheckedChange={(v) =>
                              updateRow(r.id, "unlimited", v)
                            }
                          />
                          {!r.unlimited && (
                            <Input
                              type="number"
                              min={0}
                              value={r.quota}
                              onChange={(e) =>
                                updateRow(r.id, "quota", Number(e.target.value))
                              }
                              className="h-8 w-20"
                            />
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status === "ok" && (
                        <Badge className="bg-green-600">{t("OK")}</Badge>
                      )}
                      {r.status === "error" && (
                        <Badge variant="destructive" title={r.errMsg}>
                          {t("Failed")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status !== "ok" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => deleteRow(r.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <BatchStatsSection />
    </div>
  );
}

export function ApiSale() {
  const { t } = useTranslation();
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t("API Sales")}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <ApiSaleContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  );
}
