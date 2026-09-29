import { CheckCircle2, Clock, ShieldCheck, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/providers/client-messages";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { HashChecker } from "@/components/verify/hash-checker";
import { getVerification } from "@/lib/requests/verify";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("verify");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Page ouverte par le QR code du certificat : état de la demande, signataires, empreintes. */
export default async function VerifyRequestPage(props: PageProps<"/verify/[id]">) {
  const { id } = await props.params;
  const [data, t, format] = await Promise.all([
    getVerification(id),
    getTranslations("verify"),
    getFormatter(),
  ]);
  if (!data) notFound();
  const completed = data.status === "completed";
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-16 sm:py-20">
      <div className="space-y-3 text-center">
        <div
          className={`mx-auto flex size-14 items-center justify-center rounded-2xl text-white shadow-lift ${completed ? "bg-success" : "bg-secondary text-muted-foreground"}`}
        >
          {completed ? (
            <ShieldCheck className="size-7" aria-hidden />
          ) : (
            <Clock className="size-7" aria-hidden />
          )}
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {completed ? t("completedTitle") : t("statusTitle")}
        </h1>
        <p className="text-lg">{data.title}</p>
        <Badge variant={completed ? "success" : "warning"}>
          {t(
            `status.${data.status as "completed" | "pending" | "declined" | "expired" | "canceled"}`,
          )}
        </Badge>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <dl className="grid gap-3 text-sm sm:grid-cols-[180px_1fr]">
            <dt className="text-muted-foreground">{t("sender")}</dt>
            <dd>{data.senderName}</dd>
            <dt className="text-muted-foreground">{t("created")}</dt>
            <dd>{when(data.createdAt)}</dd>
            {data.completedAt && (
              <>
                <dt className="text-muted-foreground">{t("completed")}</dt>
                <dd>{when(data.completedAt)}</dd>
              </>
            )}
            {data.finalSha256 && (
              <>
                <dt className="text-muted-foreground">{t("finalHash")}</dt>
                <dd className="font-mono text-xs break-all">{data.finalSha256}</dd>
              </>
            )}
            {data.originalSha256 && (
              <>
                <dt className="text-muted-foreground">{t("originalHash")}</dt>
                <dd className="font-mono text-xs break-all">{data.originalSha256}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="signers">
        <h2 id="signers" className="font-display text-xl font-semibold">
          {t("signers")}
        </h2>
        <ul className="space-y-2">
          {data.signers.map((s, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-border p-4 text-sm"
            >
              {s.status === "signed" ? (
                <CheckCircle2 className="size-5 text-success" aria-hidden />
              ) : (
                <XCircle className="size-5 text-muted-foreground" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.name}</p>
                {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
              </div>
              <span className="text-xs text-muted-foreground">
                {s.signedAt ? t("signedAt", { date: when(s.signedAt) }) : t("notSigned")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="check">
        <h2 id="check" className="font-display text-xl font-semibold">
          {t("checkTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("checkIntro")}</p>
        <ClientMessages namespaces={["verify"]}>
          <HashChecker known={data.hashes} />
        </ClientMessages>
      </section>
    </div>
  );
}
