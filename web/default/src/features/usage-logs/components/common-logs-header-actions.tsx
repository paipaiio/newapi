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
import { getRouteApi } from "@tanstack/react-router";
import { Download, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsAdmin } from "@/hooks/use-admin";

import { LOG_TYPE_ALL_VALUE } from "../constants";
import { exportUsageLogs } from "../lib/export";
import { CommonLogsStats } from "./common-logs-stats";
import { useUsageLogsContext } from "./usage-logs-provider";

const route = getRouteApi("/_authenticated/usage-logs/$section");

/**
 * Page-header actions for the Common Logs view: live usage stats plus a
 * toggle for masking sensitive values (token names, usernames, group names,
 * and the quota figure shown in stats). Both controls live in the page
 * header so the toolbar below stays focused on filter inputs and form
 * actions only.
 */
export function CommonLogsHeaderActions() {
  const { t } = useTranslation();
  const { sensitiveVisible, setSensitiveVisible } = useUsageLogsContext();
  const isAdmin = useIsAdmin();
  const search = route.useSearch();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const type = Array.isArray(search.type)
        ? search.type[0] || LOG_TYPE_ALL_VALUE
        : (search.type ?? LOG_TYPE_ALL_VALUE);
      await exportUsageLogs(isAdmin, {
        type: String(type),
        username: search.username || undefined,
        token: search.token || undefined,
        model: search.model || undefined,
        channel: search.channel || undefined,
        group: search.group || undefined,
        requestId: search.requestId || undefined,
        startTimestamp: search.startTime
          ? Math.floor(search.startTime / 1000)
          : undefined,
        endTimestamp: search.endTime
          ? Math.floor(search.endTime / 1000)
          : undefined,
      });
      toast.success(t("Export successful"));
    } catch {
      toast.error(t("Export failed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CommonLogsStats />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExport}
              disabled={exporting}
              aria-label={t("Export")}
              className="text-muted-foreground hover:text-foreground size-7"
            />
          }
        >
          <Download />
        </TooltipTrigger>
        <TooltipContent>{t("Export")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSensitiveVisible(!sensitiveVisible)}
              aria-label={sensitiveVisible ? t("Hide") : t("Show")}
              className="text-muted-foreground hover:text-foreground size-7"
            />
          }
        >
          {sensitiveVisible ? <Eye /> : <EyeOff />}
        </TooltipTrigger>
        <TooltipContent>
          {sensitiveVisible ? t("Hide") : t("Show")}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
