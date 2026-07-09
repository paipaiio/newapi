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
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, LayoutGrid, Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SectionPageLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getOtherServices } from "./api";
import type { OtherService } from "./types";

/** An icon is a URL when it points to an image; otherwise treat as emoji/text. */
function isImageUrl(icon: string): boolean {
  return (
    typeof icon === "string" &&
    (icon.startsWith("http://") ||
      icon.startsWith("https://") ||
      icon.startsWith("/"))
  );
}

function openService(service: OtherService) {
  if (!service.url) return;
  if (service.open_in_new_tab) {
    window.open(service.url, "_blank", "noopener,noreferrer");
  } else {
    window.location.href = service.url;
  }
}

function ServiceCard({ service }: { service: OtherService }) {
  return (
    <Card
      className="hover:border-primary/40 h-full cursor-pointer rounded-2xl p-6 transition-all hover:-translate-y-1 hover:shadow-md"
      onClick={() => openService(service)}
    >
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          {isImageUrl(service.icon) ? (
            <img
              src={service.icon}
              alt={service.name}
              className="size-14 rounded-2xl object-cover"
            />
          ) : (
            <div className="bg-primary/10 flex size-14 items-center justify-center rounded-2xl text-3xl">
              {service.icon || <LayoutGrid className="size-7" />}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[17px] font-semibold">
              {service.name}
            </span>
            <ExternalLink className="text-muted-foreground size-3.5 shrink-0" />
          </div>
          {service.description && (
            <p className="text-muted-foreground mt-1.5 line-clamp-3 text-sm leading-relaxed">
              {service.description}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function OtherServicesContent() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["other-services"],
    queryFn: async () => {
      const res = await getOtherServices();
      return res.success ? res.data || [] : [];
    },
  });

  const services = useMemo(() => data || [], [data]);

  // Group by category ("" -> ungrouped bucket rendered without a heading).
  const grouped = useMemo(() => {
    const map = new Map<string, OtherService[]>();
    for (const s of services) {
      const key = s.category?.trim() || "";
      const bucket = map.get(key) ?? [];
      bucket.push(s);
      map.set(key, bucket);
    }
    return [...map.entries()];
  }, [services]);

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {["a", "b", "c"].map((k) => (
          <Skeleton key={k} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  } else if (services.length === 0) {
    body = (
      <div className="text-muted-foreground flex flex-col items-center gap-3 py-16">
        <Link2 className="size-10 opacity-40" />
        <span>{t("No other services yet")}</span>
      </div>
    );
  } else {
    body = (
      <div className="space-y-6">
        {grouped.map(([category, items]) => (
          <div key={category || "__none__"}>
            {category && (
              <div className="mb-3">
                <Badge variant="secondary" className="rounded-full">
                  {category}
                </Badge>
              </div>
            )}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {items.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <p className="text-muted-foreground mb-4 text-sm">
        {t(
          "A collection of other services and tools we provide. Click a card to open.",
        )}
      </p>
      {body}
    </div>
  );
}

export function OtherServices() {
  const { t } = useTranslation();
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t("Other Services")}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <OtherServicesContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  );
}
