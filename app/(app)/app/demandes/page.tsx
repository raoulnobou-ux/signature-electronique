import { FileSignature, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app/page-header";
import { ProUpsell } from "@/components/app/pro-upsell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { REQUEST_STATUS_VARIANT } from "@/components/requests/status";
import { Progress } from "@/components/ui/progress";
import { requireAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("requests");
  return { title: t("metaTitle") };
}

export default async function RequestsPage() {
  const [account, t, format, supabase] = await Promise.all([
    requireAccount(),
    getTranslations("requests"),
    getFormatter(),
    createClient(),
  ]);
  const { data: requests } = await supabase
    .from("signature_requests")
    .select("id, title, status, created_at, expires_at, request_signers(status)")
    .order("created_at", { ascending: false })
    .limit(100);
  const allowed = account.entitlements.features.multi_signers;

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
        <ProUpsell icon={Send} title={t("list.proTitle")} text={t("list.proText")} cta={t("list.upgrade")} />
      ) : !requests?.length ? (
        <EmptyState icon={Send} title={t("list.empty")} description={t("list.emptyHint")} />
      ) : (
        <ul className="space-y-3" data-testid="request-list">
          {requests.map((r) => {
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
                      {t("list.created", { date: format.dateTime(new Date(r.created_at), { dateStyle: "medium" }) })}
                    </p>
                  </div>
                  <div className="w-full space-y-1 sm:w-40">
                    <Progress value={total ? (signed / total) * 100 : 0} />
                    <p className="text-xs text-muted-foreground tabular-nums">{t("list.progress", { signed, total })}</p>
                  </div>
                  <Badge variant={REQUEST_STATUS_VARIANT[r.status as keyof typeof REQUEST_STATUS_VARIANT] ?? "muted"}>
                    {t(`status.${r.status as keyof typeof REQUEST_STATUS_VARIANT}`)}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
