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
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionPageLayout } from "@/components/layout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteAnnotation, getStatus, getStatusMeta, getWhoami } from "./api";
import { ComponentCard } from "./components/component-card";
import { ManagePanel } from "./components/manage-panel";
import { ago } from "./lib/format";
import type {
  Annotation,
  ComponentStatus,
  StatusComponent,
  StatusWindow,
} from "./types";

const WINDOW_LABELS: Record<string, string> = {
  "90m": "90m",
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
};

const ANNOTATION_STYLE: Record<string, { label: string; className: string }> = {
  maintenance: {
    label: "Maintenance",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  },
  incident: {
    label: "Incident",
    className: "bg-red-500/15 text-red-600 dark:text-red-300",
  },
  info: {
    label: "Notice",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  },
  resolved: {
    label: "Resolved",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
};

const BANNER_STYLE: Record<ComponentStatus, string> = {
  operational: "border-emerald-500/30 bg-emerald-500/10",
  degraded: "border-amber-500/30 bg-amber-500/10",
  down: "border-red-500/30 bg-red-500/10",
  maintenance: "border-blue-500/30 bg-blue-500/10",
  nodata: "border-border bg-muted/40",
};

function StatusMonitorContent() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [win, setWin] = useState<StatusWindow>("90m");
  const [manage, setManage] = useState(false);
  const [delTarget, setDelTarget] = useState<Annotation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["status-monitor-status"],
    queryFn: getStatus,
    refetchInterval: 90000,
  });

  const { data: meta } = useQuery({
    queryKey: ["status-monitor-meta"],
    queryFn: getStatusMeta,
    refetchInterval: 120000,
  });

  const { data: isAdmin = false } = useQuery({
    queryKey: ["status-monitor-whoami"],
    queryFn: getWhoami,
  });

  const wins =
    status?.windows || (["90m", "24h", "7d", "30d"] as StatusWindow[]);
  const annotations = meta?.annotations || [];

  const overall = status?.overall;
  let bannerTitle = t("Loading…");
  let bannerSub = t("Fetching current status…");
  if (overall === "operational") {
    bannerTitle = t("All systems operational");
    bannerSub = t("The gateway and all group routes are operating normally.");
  } else if (overall === "down") {
    bannerTitle = t("Some services are down");
    bannerSub = t("Some groups are down or slow, see below.");
  } else if (overall) {
    bannerTitle = t("Some services are degraded");
    bannerSub = t("Some groups are down or slow, see below.");
  }

  // Group components by category, inserting category headers with stable keys.
  const grouped = useMemo(() => {
    const out: ({ cat: string; id: string } | { comp: StatusComponent })[] = [];
    let lastCat: string | null = null;
    for (const c of status?.components || []) {
      const cat =
        c.category || (c.key === "gateway" ? t("Gateway") : t("Routes"));
      if (cat !== lastCat) {
        out.push({ cat, id: `cat-${cat}` });
        lastCat = cat;
      }
      out.push({ comp: c });
    }
    return out;
  }, [status?.components, t]);

  const setAnnotations = (anns: Annotation[]) =>
    queryClient.setQueryData(["status-monitor-meta"], (prev: unknown) => ({
      ...(prev as object),
      annotations: anns,
    }));

  const handleDelete = async () => {
    if (!delTarget) return;
    setDeleting(true);
    try {
      const anns = await deleteAnnotation(delTarget.id);
      setAnnotations(anns);
      setDelTarget(null);
    } catch {
      toast.error(t("Operation failed"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">
            {meta?.config?.title || t("Service Status")}
          </div>
          <div className="text-muted-foreground text-sm">
            {meta?.config?.subtitle || t("Real-time availability monitoring")}
          </div>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setManage((m) => !m)}
          >
            {manage ? t("Close management") : t("Manage")}
          </Button>
        )}
      </div>

      {manage && isAdmin && (
        <ManagePanel
          onAnnotations={setAnnotations}
          onExit={() => setManage(false)}
        />
      )}

      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border p-4",
          BANNER_STYLE[status?.overall ?? "nodata"],
        )}
      >
        <div>
          <div className="text-base font-semibold">{bannerTitle}</div>
          <div className="text-muted-foreground text-sm">{bannerSub}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {t("Availability")}
        </span>
        {wins.map((w) => (
          <Button
            key={w}
            variant={w === win ? "default" : "outline"}
            size="sm"
            onClick={() => setWin(w)}
          >
            {WINDOW_LABELS[w] || w}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {grouped.length === 0 && (
          <div className="text-muted-foreground py-6 text-center text-sm">
            {t("No groups are monitored.")}
          </div>
        )}
        {grouped.map((g) =>
          "cat" in g ? (
            <div
              key={g.id}
              className="text-muted-foreground pt-2 text-xs font-medium tracking-wide uppercase"
            >
              {g.cat}
            </div>
          ) : (
            <ComponentCard key={g.comp.key} component={g.comp} win={win} />
          ),
        )}
      </div>

      <div className="border-t pt-4 text-sm font-medium">
        {t("Announcements & events")}
      </div>
      <div className="space-y-2">
        {annotations.length === 0 ? (
          <div className="text-muted-foreground py-4 text-center text-sm">
            {t("No announcements or events yet.")}
          </div>
        ) : (
          annotations.map((a) => {
            const style = ANNOTATION_STYLE[a.type] || ANNOTATION_STYLE.info;
            return (
              <div key={a.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      style.className,
                    )}
                  >
                    {t(style.label)}
                  </span>
                  <span className="font-medium">{a.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {a.date || ""}
                  </span>
                  {manage && isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive ml-auto h-6"
                      onClick={() => setDelTarget(a)}
                    >
                      {t("Delete")}
                    </Button>
                  )}
                </div>
                {a.body && (
                  <div className="text-muted-foreground mt-1 text-sm">
                    {a.body}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="text-muted-foreground pt-2 text-center text-xs">
        {t("Status updates in real time")} · {t("Last updated")}{" "}
        {status?.updated
          ? ago(status.updated, {
              s: t("s ago"),
              m: t("m ago"),
              h: t("h ago"),
            })
          : "—"}
      </div>

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(open) => !open && setDelTarget(null)}
        title={t("Delete announcement")}
        desc={t("Delete this announcement?")}
        confirmText={t("Delete")}
        destructive
        isLoading={deleting}
        handleConfirm={handleDelete}
      />
    </div>
  );
}

export function StatusMonitor() {
  const { t } = useTranslation();
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t("Service Status")}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <StatusMonitorContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  );
}
