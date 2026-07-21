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
import { Link } from "@tanstack/react-router";
import { Gift, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { formatQuota } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";

const DISMISS_KEY = "pending_quota_banner_dismissed";

export function PendingQuotaBanner() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.auth.user);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1",
  );

  const pendingQuota = user?.pending_quota ?? 0;
  if (pendingQuota <= 0 || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5 flex items-center gap-3 text-sm"
    >
      <Gift
        className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <p className="flex-1 text-amber-900 dark:text-amber-200 min-w-0">
        <span className="font-semibold">
          {t("注册赠额 {{amount}} 待解锁", {
            amount: formatQuota(pendingQuota),
          })}
        </span>
        {" — "}
        {t(
          "绑定邮箱（验证后）、LinuxDo 或微信中的任意一项即可自动解锁。此举旨在防止账号滥用，感谢您的理解。",
        )}{" "}
        <Link
          to="/profile"
          className="underline underline-offset-2 font-medium text-amber-800 dark:text-amber-300 hover:text-amber-600 dark:hover:text-amber-400"
        >
          {t("前往绑定")}
        </Link>
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 size-7 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
        onClick={handleDismiss}
        aria-label={t("关闭提示")}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
