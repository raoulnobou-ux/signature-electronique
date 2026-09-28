import type { ReactNode } from "react";

type Labels = {
  title: string;
  meta: string;
  signed: string;
  signedAt: string;
  signer: string;
  stamp: string;
  hash: string;
};

/**
 * Illustration du héro : un document dont la signature s'écrit, puis le cachet se pose.
 * Animation 100 % CSS (aucun JavaScript), jouée une fois ; état final affiché
 * directement si l'utilisateur préfère le mouvement réduit.
 */
export function SignedDocumentDemo({
  labels,
  icons,
}: {
  labels: Labels;
  icons: { check: ReactNode; hash: ReactNode };
}) {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
      {/* Halo de marque derrière la carte */}
      <div className="absolute -inset-10 -z-10 bg-[radial-gradient(closest-side,rgb(139_92_246/0.45),rgb(99_102_241/0.25)_50%,transparent)] dark:opacity-80" />

      <div className="gradient-border animate-float rounded-[1.75rem] glass p-3 shadow-lift sm:p-4">
        {/* Barre du fichier */}
        <div className="flex items-center justify-between gap-3 px-2 pt-1 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-[10px] font-bold text-destructive">
              PDF
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{labels.title}</p>
              <p className="text-xs text-muted-foreground">{labels.meta}</p>
            </div>
          </div>
          <span
            className="inline-flex animate-pop-in items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
            style={{ animationDelay: "3s" }}
          >
            {icons.check}
            {labels.signed}
          </span>
        </div>

        {/* Feuille de papier */}
        <div className="relative overflow-hidden rounded-2xl bg-[#FBFBFD] px-6 pt-6 pb-5 text-slate-900 shadow-inner sm:px-8 sm:pt-8">
          <div className="mb-5 flex items-start justify-between">
            <div className="space-y-1.5">
              <div className="h-2.5 w-28 rounded-full bg-slate-800/80" />
              <div className="h-2 w-20 rounded-full bg-slate-300" />
            </div>
            <div className="size-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 opacity-80" />
          </div>
          <div className="space-y-2">
            {["w-full", "w-[94%]", "w-[97%]", "w-[88%]", "w-full", "w-[72%]"].map((w, i) => (
              <div key={i} className={`h-1.5 rounded-full bg-slate-200 ${w}`} />
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {["w-[96%]", "w-[90%]", "w-[60%]"].map((w, i) => (
              <div key={i} className={`h-1.5 rounded-full bg-slate-200 ${w}`} />
            ))}
          </div>

          {/* Bloc signature */}
          <div className="relative mt-7 flex items-end justify-between gap-4">
            <div className="text-[10px] leading-relaxed text-slate-500">
              Fait à Douala,
              <br />
              le 28 septembre 2026
            </div>
            <div className="relative w-[58%]">
              <p className="mb-1 text-[10px] tracking-wide text-slate-500 uppercase">Signature</p>
              <svg viewBox="0 0 220 90" className="h-16 w-full overflow-visible sm:h-20">
                <path
                  pathLength={1}
                  className="animate-sig-draw"
                  d="M8 62c10-38 26-44 30-14 3 22-9 30-10 12-1-16 22-30 30-10 4 10 6 12 12-2 4-9 8-9 10 6 2 11 8 8 12-4 4-12 12-14 14 2 2 12 10 8 16-8 4-10 10-14 14 0 3 10-2 26-8 22-6-4 12-16 32-14 15 1 30-6 45-12"
                  fill="none"
                  stroke="#1E2A78"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  pathLength={1}
                  className="animate-sig-draw [animation-delay:2.2s] [animation-duration:0.5s]"
                  d="M30 80c50-6 110-8 170-12"
                  fill="none"
                  stroke="#1E2A78"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              </svg>
              <div className="h-px w-full bg-slate-300" />
              <p className="mt-1 text-[10px] text-slate-600">{labels.signer}</p>

              {/* Cachet encré */}
              <svg
                viewBox="0 0 100 100"
                className="absolute -top-2 -left-24 size-24 animate-stamp-in sm:-left-28 sm:size-28"
              >
                <defs>
                  <filter id="ink" x="-10%" y="-10%" width="120%" height="120%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
                    <feDisplacementMap in="SourceGraphic" scale="2.2" />
                  </filter>
                  <path id="stamp-circle" d="M50 50m-35 0a35 35 0 1 1 70 0a35 35 0 1 1-70 0" />
                </defs>
                <g filter="url(#ink)" fill="none" stroke="#2743C9" opacity="0.9">
                  <circle cx="50" cy="50" r="46" strokeWidth="2.4" />
                  <circle cx="50" cy="50" r="42" strokeWidth="0.9" />
                  <circle cx="50" cy="50" r="25" strokeWidth="1.2" />
                  <text
                    fill="#2743C9"
                    stroke="none"
                    fontSize="8"
                    fontWeight="700"
                    letterSpacing="1.6"
                  >
                    <textPath href="#stamp-circle">{labels.stamp} ·</textPath>
                  </text>
                  <text
                    x="50"
                    y="48"
                    fill="#2743C9"
                    stroke="none"
                    fontSize="9"
                    fontWeight="800"
                    textAnchor="middle"
                  >
                    APPROUVÉ
                  </text>
                  <text
                    x="50"
                    y="59"
                    fill="#2743C9"
                    stroke="none"
                    fontSize="6.5"
                    textAnchor="middle"
                  >
                    28.09.2026
                  </text>
                </g>
              </svg>
            </div>
          </div>
        </div>

        {/* Preuves */}
        <div className="flex flex-wrap items-center gap-2 px-1 pt-3">
          <span
            className="inline-flex animate-pop-in items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground"
            style={{ animationDelay: "3.3s" }}
          >
            {icons.check}
            {labels.signedAt}
          </span>
          <span
            className="inline-flex animate-pop-in items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground"
            style={{ animationDelay: "3.6s" }}
          >
            {icons.hash}
            {labels.hash}
          </span>
        </div>
      </div>
    </div>
  );
}
