import { FileSignature, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app/page-header";
import { ProUpsell } from "@/components/app/pro-upsell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DISPLAY_STATUS_VARIANT } from "@/components/requests/status";
import { Progress } from "@/components/ui/progress";
import { requireAccount } from "@/lib/auth/account";
import { DISPLAY_STATUSES, displayRequestStatus, isDisplayStatus } from "@/lib/requests/status";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("requests");
  return { title: t("metaTitle") };
}

export default async function RequestsPage({ searchParams }: PageProps<"/app/demandes">) {
  const [account, t, format, supabase, params] = await Promise.all([
    requireAccount(),
    getTranslations("requests"),
    getFormatter(),
    createClient(),
    searchParams,
  ]);
  const { data: requests } = await supabase
    .from("signature_requests")
    .select("id, title, status, created_at, expires_at, request_signers(status)")
    .order("created_at", { ascending: false })
    .limit(200);
  const allowed = account.entitlements.features.multi_signers;
  // Statut affiché (Brouillon, Envoyé, Vu, En attente, Signé…) et filtre par statut.
  const rows = (requests ?? []).map((r) => ({
    ...r,
    display: displayRequestStatus(r.status, r.request_signers),
  }));
  const filter = isDisplayStatus(params.statut) ? params.statut : null;
  const counts = Object.fromEntries(
    DISPLAY_STATUSES.map((s) => [s, rows.filter((r) => r.display === s).length]),
  ) as Record<(typeof DISPLAY_STATUSES)[number], number>;
  const visible = filter ? rows.filter((r) => r.display === filter) : rows;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("list.title")}
        description={t("list.description")}
        actions={
          allowed && (
            <Button asChild>
              <Link href="/app/documents">
                <FileSignature /> {t("list.openDocuments")}
              </Link>
            </Button>
          )
        }
      />
      {!allowed && !requests?.length ? (
        <ProUpsell
          icon={Send}
          title={t("list.proTitle")}
          text={t("list.proText")}
          cta={t("list.upgrade")}
        />
      ) : !rows.length ? (
        <EmptyState icon={Send} title={t("list.empty")} description={t("list.emptyHint")} />
      ) : (
        <div className="space-y-4">
          <nav aria-label={t("list.filter")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <Link
              href="/app/demandes"
              aria-current={filter === null ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
                filter === null
                  ? "border-transparent bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t("list.all")} <span className="tabular-nums opacity-70">{rows.length}</span>
            </Link>
            {DISPLAY_STATUSES.filter((s) => counts[s] > 0 || s === filter).map((s) => (
              <Link
                key={s}
                href={`/app/demandes?statut=${s}`}
                aria-current={filter === s ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
                  filter === s
                    ? "border-transparent bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`status.${s}`)} <span className="tabular-nums opacity-70">{counts[s]}</span>
              </Link>
            ))}
          </nav>
          {!visible.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("list.noneForFilter")}
            </p>
          ) : (
            <ul className="space-y-3" data-testid="request-list">
              {visible.map((r) => {
                const total = r.request_signers.length;
                const signed = r.request_signers.filter((s) => s.status === "signed").length;
                return (
                  <li key={r.id}>
                    <Link
                      href={`/app/demandes/${r.id}`}
                      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-secondary/60 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("list.created", {
                            date: format.dateTime(new Date(r.created_at), { dateStyle: "medium" }),
                          })}
                        </p>
                      </div>
                      <div className="w-full space-y-1 sm:w-40">
                        <Progress value={total ? (signed / total) * 100 : 0} />
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {t("list.progress", { signed, total })}
                        </p>
                      </div>
                      <Badge variant={DISPLAY_STATUS_VARIANT[r.display]}>
                        {t(`status.${r.display}`)}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
