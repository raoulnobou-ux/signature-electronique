import {
  ArrowRight,
  FilePlus2,
  FileSignature,
  Inbox,
  Send,
  Sparkles,
  Stamp,
  Upload,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge, type Status } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { firstName } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.dashboard");
  return { title: t("metaTitle") };
}

/** Salutation selon l'heure locale de l'utilisateur. */
function greetingKey(timeZone: string): "morning" | "afternoon" | "evening" {
  const hour = Number(
    new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hourCycle: "h23", timeZone }).format(
      new Date(),
    ),
  );
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export default async function DashboardPage(props: PageProps<"/app">) {
  const [account, t, tGreet, searchParams] = await Promise.all([
    requireAccount(),
    getTranslations("app.dashboard"),
    getTranslations("app.greeting"),
    props.searchParams,
  ]);
  const supabase = await createClient();
  const [{ data: recent }, { count: pendingCount }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, status, updated_at")
      .is("trashed_at", null)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("trashed_at", null),
  ]);

  const name = firstName(account.profile.full_name);
  const remaining = account.entitlements.remaining.documentsThisMonth;

  const quickActions = [
    {
      href: "/app/documents?importer=1",
      icon: FileSignature,
      title: t("quick.sign"),
      hint: t("quick.signHint"),
      primary: true,
    },
    { href: "/app/demandes", icon: Send, title: t("quick.request"), hint: t("quick.requestHint") },
    {
      href: "/app/documents?importer=1",
      icon: Upload,
      title: t("quick.import"),
      hint: t("quick.importHint"),
    },
  ];

  const stats = [
    { label: t("stats.signedThisMonth"), value: String(account.usage.documentsSignedThisMonth) },
    { label: t("stats.pending"), value: String(pendingCount ?? 0) },
    {
      label: t("stats.quota"),
      value: remaining === null ? t("stats.unlimited") : String(remaining),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      {searchParams["mot-de-passe"] === "modifie" && (
        <p
          role="status"
          className="mb-6 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {t("passwordUpdated")}
        </p>
      )}
      <PageHeader
        title={
          <>
            {tGreet(greetingKey(account.profile.timezone))}
            {name && <span className="text-gradient">, {name}</span>}
          </>
        }
        description={t("subtitle")}
      />

      <section aria-label={t("quick.sign")} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {quickActions.map(({ href, icon: Icon, title, hint, primary }) => (
          <Link
            key={title}
            href={href}
            className={
              primary
                ? "group relative col-span-2 overflow-hidden rounded-2xl bg-brand-gradient p-4 text-white shadow-[0_14px_40px_-16px_rgb(99_102_241/0.9)] transition-transform hover:-translate-y-0.5 sm:col-span-1 sm:p-5"
                : "group rounded-2xl glass p-4 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-ring/40 sm:p-5"
            }
          >
            <div
              className={
                primary
                  ? "mb-4 flex size-11 items-center justify-center rounded-xl bg-white/20 sm:mb-6"
                  : "mb-4 flex size-11 items-center justify-center rounded-xl bg-accent sm:mb-6"
              }
            >
              <Icon className={primary ? "size-5" : "size-5 text-accent-foreground"} aria-hidden />
            </div>
            <p className="flex items-center justify-between font-display text-base font-semibold sm:text-lg">
              {title}
              <ArrowRight
                className="size-4 opacity-60 transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </p>
            <p
              className={
                primary ? "text-sm text-white/80" : "hidden text-sm text-muted-foreground sm:block"
              }
            >
              {hint}
            </p>
          </Link>
        ))}
      </section>

      <section aria-label="Statistiques" className="mt-6 grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 sm:p-5">
              <p className="font-display text-2xl font-semibold tabular-nums sm:text-3xl">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="recent-title">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="recent-title" className="font-display text-xl font-semibold">
              {t("recent")}
            </h2>
            {recent && recent.length > 0 && (
              <Button asChild variant="link" size="sm">
                <Link href="/app/documents">{t("seeAll")}</Link>
              </Button>
            )}
          </div>
          {recent && recent.length > 0 ? (
            <Card>
              <ul className="divide-y divide-border">
                {recent.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={`/app/documents/${doc.id}`}
                      className="flex items-center gap-3 px-5 py-4 hover:bg-secondary/60"
                    >
                      <FilePlus2 className="size-5 text-muted-foreground" aria-hidden />
                      <span className="flex-1 truncate text-sm font-medium">{doc.title}</span>
                      <StatusBadge status={doc.status as Status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState
              icon={Inbox}
              title={t("emptyTitle")}
              description={t("emptyBody")}
              action={
                <Button asChild>
                  <Link href="/app/documents?importer=1">
                    <Upload /> {t("emptyCta")}
                  </Link>
                </Button>
              }
            />
          )}
        </section>

        <aside aria-labelledby="copilot-title">
          <h2 id="copilot-title" className="mb-4 font-display text-xl font-semibold">
            {t("copilotTitle")}
          </h2>
          <Card className="gradient-border">
            <CardContent className="space-y-4">
              <div className="flex size-11 items-center justify-center rounded-xl bg-brand-gradient text-white">
                <Sparkles className="size-5" aria-hidden />
              </div>
              <p className="text-sm text-muted-foreground">{t("copilotBody")}</p>
              <Button asChild variant="secondary" size="sm">
                <Link href="/app/signatures">
                  <Stamp /> {t("copilotCta")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
