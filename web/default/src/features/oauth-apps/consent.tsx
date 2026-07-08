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
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getOAuthConsent, postOAuthConsent } from "./api";

function useScopeText() {
  const { t } = useTranslation();
  return (scope: string): string => {
    switch (scope) {
      case "openid":
        return t("Confirm your identity");
      case "profile":
        return t("Read your display name and username");
      case "email":
        return t("Read your email address");
      case "groups":
        return t("Read the groups you belong to");
      default:
        return scope;
    }
  };
}

export function OAuthConsentPage({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const scopeText = useScopeText();
  const [submitting, setSubmitting] = useState(false);

  const { data: info, isLoading } = useQuery({
    queryKey: ["oauth-consent", requestId],
    queryFn: async () => {
      const res = await getOAuthConsent(requestId);
      if (!res.success) {
        toast.error(
          res.message || t("The authorization request is invalid or expired"),
        );
        return null;
      }
      return res.data ?? null;
    },
    enabled: !!requestId,
  });

  const decide = async (action: "approve" | "deny") => {
    setSubmitting(true);
    try {
      const res = await postOAuthConsent(requestId, action);
      if (res.success && res.data?.redirect) {
        window.location.href = res.data.redirect;
        return;
      }
      toast.error(res.message || t("Operation failed"));
    } catch {
      toast.error(t("Operation failed"));
    }
    setSubmitting(false);
  };

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <div className="text-muted-foreground py-10 text-center text-sm">
        {t("Loading...")}
      </div>
    );
  } else if (!info) {
    content = (
      <div className="py-8 text-center">
        <div className="font-medium">
          {t("The authorization request is invalid or expired")}
        </div>
        <div className="text-muted-foreground mt-1 text-sm">
          {t("Please return to the app and start login again")}
        </div>
      </div>
    );
  } else {
    content = (
      <>
        <div className="mb-5 flex flex-col items-center text-center">
          {info.client_logo ? (
            <img
              src={info.client_logo}
              alt={info.client_name}
              className="size-14 rounded-xl object-cover"
            />
          ) : (
            <div className="bg-muted flex size-14 items-center justify-center rounded-xl">
              <KeyRound className="text-primary size-7" />
            </div>
          )}
          <div className="mt-3 text-lg font-semibold">{info.client_name}</div>
          <div className="text-muted-foreground text-sm">
            {t("is requesting access to your account")}
          </div>
        </div>

        <div className="mb-2 font-medium">{t("This app will be granted:")}</div>
        <div className="mb-6 space-y-1">
          {(info.scopes || []).map((s) => (
            <div key={s} className="flex items-start gap-2 py-1 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              <span>{scopeText(s)}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            disabled={submitting}
            onClick={() => decide("deny")}
          >
            {t("Deny")}
          </Button>
          <Button
            className="flex-1"
            disabled={submitting}
            onClick={() => decide("approve")}
          >
            {t("Approve")}
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-[440px] rounded-2xl border p-7 shadow-sm">
        {content}
      </div>
    </div>
  );
}
