import { beforeEach, describe, expect, it, vi } from "vitest";
import { androidAssetLinks, DEFAULT_ANDROID_PACKAGE } from "@/lib/android";
import { STORE_KEY, STORE_MODE_SCRIPT } from "@/lib/store-app";
import type { Account } from "@/lib/auth/account";

const mocks = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string; html: string; text: string }[],
  profile: null as Record<string, unknown> | null,
  notices: new Set<string>(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async (message: { to: string; subject: string; html: string; text: string }) => {
    mocks.sent.push(message);
  }),
}));
vi.mock("@/lib/pricing", async () => {
  const { DEFAULT_PRICES } = await import("@/lib/entitlements/plans");
  return { getPrices: async () => DEFAULT_PRICES };
});
vi.mock("@/lib/env", () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: "https://quicksign.test" },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "profiles") {
        const q = { select: () => q, eq: () => q, single: async () => ({ data: mocks.profile }) };
        return q;
      }
      return {
        insert: async (row: { user_id: string; kind: string; reference: string }) => {
          const key = `${row.user_id}:${row.kind}:${row.reference}`;
          if (mocks.notices.has(key)) return { error: { code: "23505" } };
          mocks.notices.add(key);
          return { error: null };
        },
      };
    },
  }),
}));

const { isoWeek, limitOffer, sendLimitNotice } = await import("@/lib/billing/limit-notice");

const account = (state: string, plan: string | null) =>
  ({ userId: "u1", entitlements: { state, effectivePlan: plan } }) as unknown as Account;

describe("e-mail automatique « limite atteinte »", () => {
  beforeEach(() => {
    mocks.sent.length = 0;
    mocks.notices.clear();
    mocks.profile = {
      email: "awa@exemple.com",
      full_name: "Awa Ndzi",
      locale: "fr",
      email_notifications: true,
    };
  });

  it("offre selon le compte : gratuit → s'abonner, Essentiel → Pro, Pro → rien", () => {
    expect(limitOffer(account("free", null), "read_only")).toBe("subscribe");
    expect(limitOffer(account("free", null), "quota_exceeded")).toBe("subscribe");
    expect(limitOffer(account("active", "essential"), "feature_not_in_plan")).toBe("upgrade");
    expect(limitOffer(account("active", "essential"), "quota_exceeded")).toBe("upgrade");
    expect(limitOffer(account("active", "pro"), "quota_exceeded")).toBeNull();
    expect(limitOffer(account("grace", "pro"), "feature_not_in_plan")).toBeNull();
  });

  it("part tout seul, avec le lien de paiement du site (/payer), en français", async () => {
    expect(await sendLimitNotice("u1", "subscribe", "documentsStored")).toBe(true);
    expect(mocks.sent).toHaveLength(1);
    const [email] = mocks.sent;
    expect(email!.to).toBe("awa@exemple.com");
    expect(email!.subject).toBe("Votre accès gratuit QuickSign a atteint sa limite");
    expect(email!.text).toContain("importer un nouveau document");
    expect(email!.text).toMatch(/5\s000/u);
    expect(email!.html).toContain("/payer");
    expect(email!.html).not.toContain("/app/abonnement");
  });

  it("au plus un e-mail par semaine", async () => {
    const monday = new Date("2026-10-12T08:00:00Z");
    const sunday = new Date("2026-10-18T20:00:00Z");
    const nextMonday = new Date("2026-10-19T08:00:00Z");
    expect(await sendLimitNotice("u1", "subscribe", undefined, monday)).toBe(true);
    expect(await sendLimitNotice("u1", "upgrade", "documentsThisMonth", sunday)).toBe(false);
    expect(await sendLimitNotice("u1", "subscribe", undefined, nextMonday)).toBe(true);
    expect(mocks.sent).toHaveLength(2);
    expect(isoWeek(monday)).toBe(isoWeek(sunday));
    expect(isoWeek(nextMonday)).not.toBe(isoWeek(monday));
  });

  it("respecte le choix « pas d'e-mails » et les comptes sans adresse", async () => {
    mocks.profile = { ...mocks.profile, email_notifications: false };
    expect(await sendLimitNotice("u1", "subscribe")).toBe(false);
    mocks.profile = null;
    expect(await sendLimitNotice("u1", "subscribe")).toBe(false);
    expect(mocks.sent).toHaveLength(0);
  });

  it("Essentiel → Pro, en anglais", async () => {
    mocks.profile = { ...mocks.profile, locale: "en" };
    await sendLimitNotice("u1", "upgrade", "documentsThisMonth");
    expect(mocks.sent[0]!.subject).toBe("You've reached the limit of your Essential plan");
    expect(mocks.sent[0]!.text).toContain("15,000");
  });
});

describe("application Android", () => {
  it("assetlinks : paquet et empreintes valides seulement", () => {
    const fingerprint = Array.from({ length: 32 }, (_, i) =>
      i.toString(16).padStart(2, "0").toUpperCase(),
    ).join(":");
    expect(androidAssetLinks({ ANDROID_CERT_FINGERPRINTS: fingerprint })).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: DEFAULT_ANDROID_PACKAGE,
          sha256_cert_fingerprints: [fingerprint],
        },
      },
    ]);
    // Rien de publié sans empreinte valide (pas d'application revendiquée par erreur).
    expect(androidAssetLinks({})).toEqual([]);
    expect(androidAssetLinks({ ANDROID_CERT_FINGERPRINTS: "pas-une-empreinte" })).toEqual([]);
    expect(
      androidAssetLinks({
        ANDROID_PACKAGE_NAME: "Pas Valide",
        ANDROID_CERT_FINGERPRINTS: fingerprint,
      }),
    ).toEqual([]);
  });

  /** Exécute le script de détection dans un faux navigateur. */
  function runStoreScript(url: string, referrer: string, stored: string | null = null) {
    const storage = new Map<string, string>(stored ? [[STORE_KEY, stored]] : []);
    const html = { dataset: {} as Record<string, string> };
    const sandbox = {
      window: {
        sessionStorage: {
          getItem: (k: string) => storage.get(k) ?? null,
          setItem: (k: string, v: string) => storage.set(k, v),
        },
      },
      document: { referrer, documentElement: html },
      location: { search: new URL(url).search },
    };
    new Function("window", "document", "location", STORE_MODE_SCRIPT)(
      sandbox.window,
      sandbox.document,
      sandbox.location,
    );
    return html.dataset.store;
  }

  it("mode application : ouverture par l'application, ou plus tard dans le même onglet", () => {
    expect(runStoreScript("https://q.test/app?source=play", "")).toBe("play");
    expect(runStoreScript("https://q.test/app", "android-app://app.quicksign.twa/")).toBe("play");
    expect(runStoreScript("https://q.test/app/documents", "", "play")).toBe("play");
    // Navigateur ordinaire : le paiement reste visible.
    expect(runStoreScript("https://q.test/app", "https://www.google.com/")).toBeUndefined();
    expect(runStoreScript("https://q.test/tarifs?source=playground", "")).toBeUndefined();
  });
});
