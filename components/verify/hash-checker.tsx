"use client";

import { CheckCircle2, FileSearch, Loader2, ShieldAlert, Upload } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { verifyHash } from "@/app/(marketing)/verify/actions";
import { cn } from "@/lib/utils";

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Outcome =
  | { kind: "match"; label: "final" | "original" | "intermediate" }
  | { kind: "found"; title: string; version: number; createdAt: string; requestId: string | null }
  | { kind: "nomatch" };

/**
 * Dépôt d'un fichier : son empreinte SHA-256 est calculée localement (le fichier ne quitte
 * pas l'appareil), puis comparée aux empreintes connues.
 */
export function HashChecker({ known }: { known?: { sha256: string; kind: "original" | "intermediate" | "final" }[] }) {
  const t = useTranslations("verify");
  const format = useFormatter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const check = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setOutcome(null);
    try {
      const digest = await sha256(file);
      setHash(digest);
      if (known) {
        const match = known.find((k) => k.sha256 === digest);
        setOutcome(match ? { kind: "match", label: match.kind } : { kind: "nomatch" });
      } else {
        const result = await verifyHash(digest);
        setOutcome(result.found ? { kind: "found", ...result } : { kind: "nomatch" });
      }
    } finally {
      setBusy(false);
    }
  };

  const ok = outcome && outcome.kind !== "nomatch";

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void check(e.dataTransfer.files[0]);
        }}
        className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-border px-6 py-10 text-center transition-colors hover:border-brand-violet hover:bg-accent/40"
      >
        {busy ? <Loader2 className="size-8 animate-spin text-brand-violet" aria-hidden /> : <Upload className="size-8 text-brand-violet" aria-hidden />}
        <span className="font-semibold">{t("drop")}</span>
        <span className="text-sm text-muted-foreground">{t("privacy")}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        className="hidden"
        data-testid="verify-input"
        onChange={(e) => void check(e.target.files?.[0])}
      />

      {outcome && (
        <div
          role="status"
          data-testid="verify-result"
          data-ok={ok ? "true" : "false"}
          className={cn("flex gap-3 rounded-2xl border p-4", ok ? "border-success/30 bg-success/10" : "border-destructive/30 bg-destructive/10")}
        >
          {ok ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          ) : (
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          )}
          <div className="min-w-0 space-y-1 text-sm">
            {outcome.kind === "match" && <p className="font-semibold">{t(`match.${outcome.label}`)}</p>}
            {outcome.kind === "found" && (
              <>
                <p className="font-semibold">{t("found", { title: outcome.title })}</p>
                <p className="text-muted-foreground">
                  {t("foundDetail", {
                    version: outcome.version,
                    date: format.dateTime(new Date(outcome.createdAt), { dateStyle: "long", timeStyle: "short" }),
                  })}
                </p>
                {outcome.requestId && (
                  <Link href={`/verify/${outcome.requestId}`} className="inline-flex items-center gap-1 font-medium text-accent-foreground underline">
                    <FileSearch className="size-4" aria-hidden /> {t("seeRequest")}
                  </Link>
                )}
              </>
            )}
            {outcome.kind === "nomatch" && (
              <>
                <p className="font-semibold">{t("nomatch")}</p>
                <p className="text-muted-foreground">{t("nomatchHint")}</p>
              </>
            )}
            {hash && <p className="font-mono text-xs break-all text-muted-foreground">SHA-256 : {hash}</p>}
          </div>
        </div>
      )}
      {!outcome && !busy && (
        <p className="text-center text-xs">
          <Link href="/securite" className="text-muted-foreground underline hover:text-foreground">
            {t("learnMore")}
          </Link>
        </p>
      )}
    </div>
  );
}
