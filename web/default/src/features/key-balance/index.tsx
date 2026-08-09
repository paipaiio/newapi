import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatQuota } from "@/lib/format";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useSystemConfigStore } from "@/stores/system-config-store";

interface ModelStat {
  model_name: string;
  quota: number;
  count: number;
  tokens: number;
}

interface KeyBalanceData {
  name: string;
  group: string;
  expires_at: number;
  unlimited_quota: boolean;
  remain_quota: number;
  used_quota: number;
  total_quota: number;
  request_count: number;
  model_stats: ModelStat[];
}

async function fetchKeyBalance(key: string): Promise<{
  success: boolean;
  message?: string;
  data?: KeyBalanceData;
}> {
  const res = await fetch(
    `/api/public/key-balance?key=${encodeURIComponent(key)}`,
  );
  return res.json();
}

export function KeyBalance() {
  const { t } = useTranslation();
  const { config } = useSystemConfigStore();

  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KeyBalanceData | null>(null);
  const [error, setError] = useState("");

  const handleQuery = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetchKeyBalance(trimmed);
      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setError(res.message || t("Query failed"));
      }
    } catch {
      setError(t("Request failed"));
    }
    setLoading(false);
  };

  const groups = result?.group ? result.group.split(",").filter(Boolean) : [];

  const expiryText = !result?.expires_at
    ? t("Never")
    : new Date(result.expires_at * 1000).toLocaleString();

  // unlimited_quota=true 时后端已返回账户余额作为 remain_quota，直接展示数值
  const balanceText = formatQuota(result?.remain_quota ?? 0);

  return (
    <div className="bg-background flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={config.logo}
              alt={config.systemName}
              className="h-7 w-7 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="text-base font-semibold">{config.systemName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" render={<a href="/key-transfer" />}>
              <ArrowLeftRight className="mr-1 h-4 w-4" />
              {t("Balance Transfer")}
            </Button>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 items-start justify-center p-4 pt-10 sm:pt-16">
        <div className="w-full max-w-2xl space-y-6">
          {/* Page title */}
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-semibold">{t("Key Balance Query")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("Enter your API key to check balance and usage")}
            </p>
          </div>

          {/* Input card */}
          <div className="bg-card space-y-4 rounded-lg border p-6">
            <div className="space-y-2">
              <Label htmlFor="key-input">{t("API Key")}</Label>
              <div className="flex gap-2">
                <Input
                  id="key-input"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="sk-..."
                  onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                  className="font-mono text-sm"
                />
                <Button
                  onClick={handleQuery}
                  disabled={loading || !key.trim()}
                >
                  <Search className="mr-1 h-4 w-4" />
                  {loading ? t("Querying...") : t("Query")}
                </Button>
              </div>
            </div>
            {error && (
              <div className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {/* Stats + details card */}
              <div className="bg-card overflow-hidden rounded-lg border">
                {/* Three-column stats */}
                <div className="divide-border/60 grid grid-cols-3 divide-x border-b">
                  {[
                    {
                      label: t("Current Balance"),
                      value: balanceText,
                      sub: t("Remaining quota"),
                    },
                    {
                      label: t("Total Usage"),
                      value: formatQuota(result.used_quota),
                      sub: t("Total consumed"),
                    },
                    {
                      label: t("API Requests"),
                      value: result.request_count.toLocaleString(),
                      sub: t("Total requests made"),
                    },
                  ].map((item) => (
                    <div key={item.label} className="px-4 py-4">
                      <div className="text-muted-foreground truncate text-xs font-medium tracking-wider uppercase">
                        {item.label}
                      </div>
                      <div className="mt-1 text-xl font-semibold">
                        {item.value}
                      </div>
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        {item.sub}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Detail rows */}
                <div className="divide-border/40 divide-y px-4 py-1 text-sm">
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-muted-foreground">{t("Key Name")}</span>
                    <span className="font-medium">{result.name}</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-muted-foreground">
                      {t("Total Quota")}
                    </span>
                    <span>
                      {result.unlimited_quota
                        ? t("Unlimited")
                        : formatQuota(result.total_quota)}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2 py-2.5">
                    <span className="text-muted-foreground shrink-0">
                      {t("Group")}
                    </span>
                    <div className="flex flex-wrap justify-end gap-1">
                      {groups.length > 0 ? (
                        groups.map((g) => (
                          <Badge key={g} variant="secondary">
                            {g}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-muted-foreground">{t("Expiry")}</span>
                    <span>{expiryText}</span>
                  </div>
                </div>
              </div>

              {/* Per-model breakdown */}
              {result.model_stats && result.model_stats.length > 0 && (
                <div className="bg-card overflow-hidden rounded-lg border">
                  <div className="border-b px-4 py-3">
                    <h2 className="text-sm font-semibold">
                      {t("Usage by Model")}
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-xs uppercase tracking-wider">
                          <th className="px-4 py-2 text-left font-medium">
                            {t("Model")}
                          </th>
                          <th className="px-4 py-2 text-right font-medium">
                            {t("Requests")}
                          </th>
                          <th className="px-4 py-2 text-right font-medium">
                            {t("Tokens")}
                          </th>
                          <th className="px-4 py-2 text-right font-medium">
                            {t("Cost")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-border/40 divide-y">
                        {result.model_stats.map((s) => (
                          <tr key={s.model_name} className="hover:bg-muted/30">
                            <td className="px-4 py-2 font-mono text-xs">
                              {s.model_name}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {s.count.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {s.tokens.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-right font-medium">
                              {formatQuota(s.quota)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
