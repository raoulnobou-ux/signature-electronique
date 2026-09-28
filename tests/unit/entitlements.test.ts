import { describe, expect, it } from "vitest";
import {
  checkAccess,
  getEntitlements,
  type SubscriptionSnapshot,
  type UsageSnapshot,
} from "@/lib/entitlements";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-28T10:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const noUsage: UsageSnapshot = {
  documentsSignedThisMonth: 0,
  aiMessagesToday: 0,
  signatureAssetsCount: 0,
  storageBytesUsed: 0,
};

function sub(overrides: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return {
    plan: "trial",
    status: "trialing",
    currentPeriodEnd: at(6),
    cancelAtPeriodEnd: false,
    scheduledPlan: null,
    ...overrides,
  };
}

describe("essai gratuit", () => {
  it("donne toutes les fonctionnalités Pro pendant 6 jours", () => {
    const ent = getEntitlements({ subscription: sub({}), usage: noUsage, now: NOW });
    expect(ent.state).toBe("trial");
    expect(ent.effectivePlan).toBe("pro");
    expect(ent.readOnly).toBe(false);
    expect(Object.values(ent.features).every(Boolean)).toBe(true);
    expect(ent.remaining.documentsThisMonth).toBeNull();
  });

  it("compte les jours restants en arrondissant au jour supérieur", () => {
    expect(
      getEntitlements({ subscription: sub({}), usage: noUsage, now: NOW }).trialDaysRemaining,
    ).toBe(6);
    expect(
      getEntitlements({
        subscription: sub({}),
        usage: noUsage,
        now: new Date(at(5).getTime() + 3600_000),
      }).trialDaysRemaining,
    ).toBe(1);
    expect(
      getEntitlements({ subscription: sub({}), usage: noUsage, now: at(1.5) }).trialDaysRemaining,
    ).toBe(5);
  });

  it("passe en lecture seule dès la fin de l'essai, sans période de grâce", () => {
    const ent = getEntitlements({ subscription: sub({}), usage: noUsage, now: at(6) });
    expect(ent.state).toBe("expired");
    expect(ent.readOnly).toBe(true);
    expect(ent.effectivePlan).toBeNull();
    expect(ent.trialDaysRemaining).toBe(0);
    expect(Object.values(ent.features).some(Boolean)).toBe(false);
    expect(checkAccess(ent, "sign")).toEqual({ ok: false, reason: "read_only" });
  });
});

describe("abonnement Essentiel", () => {
  const essential = sub({ plan: "essential", status: "active", currentPeriodEnd: at(20) });

  it("limite les fonctionnalités au plan", () => {
    const ent = getEntitlements({ subscription: essential, usage: noUsage, now: NOW });
    expect(ent.state).toBe("active");
    expect(ent.features.sign).toBe(true);
    expect(ent.features.ai_assistant).toBe(true);
    expect(ent.features.stamps).toBe(false);
    expect(ent.features.multi_signers).toBe(false);
    expect(ent.trialDaysRemaining).toBeNull();
    expect(checkAccess(ent, "stamps")).toEqual({ ok: false, reason: "feature_not_in_plan" });
  });

  it("calcule les quotas restants", () => {
    const ent = getEntitlements({
      subscription: essential,
      usage: {
        documentsSignedThisMonth: 48,
        aiMessagesToday: 20,
        signatureAssetsCount: 2,
        storageBytesUsed: 0,
      },
      now: NOW,
    });
    expect(ent.remaining.documentsThisMonth).toBe(2);
    expect(ent.remaining.aiMessagesToday).toBe(0);
    expect(ent.remaining.signatureAssets).toBe(3);
    expect(checkAccess(ent, "sign", { kind: "documentsThisMonth" })).toEqual({ ok: true });
    expect(checkAccess(ent, "sign", { kind: "documentsThisMonth", amount: 3 })).toEqual({
      ok: false,
      reason: "quota_exceeded",
    });
    expect(checkAccess(ent, "ai_assistant", { kind: "aiMessagesToday" }).ok).toBe(false);
  });

  it("ne descend jamais sous zéro", () => {
    const ent = getEntitlements({
      subscription: essential,
      usage: { ...noUsage, documentsSignedThisMonth: 70 },
      now: NOW,
    });
    expect(ent.remaining.documentsThisMonth).toBe(0);
  });

  it("utilise les limites de plans_config quand elles sont fournies", () => {
    const ent = getEntitlements({
      subscription: essential,
      usage: noUsage,
      limits: {
        essential: {
          documentsPerMonth: 100,
          signatureAssets: 5,
          storageBytes: 1,
          aiMessagesPerDay: 20,
          teamMembers: 1,
        },
      },
      now: NOW,
    });
    expect(ent.remaining.documentsThisMonth).toBe(100);
  });
});

describe("fin de période et grâce", () => {
  it("maintient l'accès 3 jours après la fin d'une période payée non renouvelée", () => {
    const s = sub({ plan: "pro", status: "active", currentPeriodEnd: NOW });
    const inGrace = getEntitlements({ subscription: s, usage: noUsage, now: at(2) });
    expect(inGrace.state).toBe("grace");
    expect(inGrace.readOnly).toBe(false);
    expect(inGrace.effectivePlan).toBe("pro");
    expect(inGrace.graceEndsAt?.toISOString()).toBe(at(3).toISOString());

    const after = getEntitlements({ subscription: s, usage: noUsage, now: at(3) });
    expect(after.state).toBe("expired");
    expect(after.readOnly).toBe(true);
  });

  it("applique la même grâce à un paiement échoué (past_due)", () => {
    const s = sub({ plan: "essential", status: "past_due", currentPeriodEnd: at(-1) });
    expect(getEntitlements({ subscription: s, usage: noUsage, now: NOW }).state).toBe("grace");
    expect(getEntitlements({ subscription: s, usage: noUsage, now: at(2.5) }).state).toBe(
      "expired",
    );
  });

  it("garde l'accès jusqu'à la fin de la période payée après une annulation", () => {
    const s = sub({
      plan: "pro",
      status: "canceled",
      currentPeriodEnd: at(10),
      cancelAtPeriodEnd: true,
    });
    const before = getEntitlements({ subscription: s, usage: noUsage, now: at(9) });
    expect(before.state).toBe("active");
    expect(before.effectivePlan).toBe("pro");
    expect(before.cancelAtPeriodEnd).toBe(true);
    expect(getEntitlements({ subscription: s, usage: noUsage, now: at(10) }).state).toBe("expired");
  });

  it("conserve le plan Pro jusqu'au terme en cas de rétrogradation programmée", () => {
    const s = sub({
      plan: "pro",
      status: "active",
      currentPeriodEnd: at(5),
      scheduledPlan: "essential",
    });
    const ent = getEntitlements({ subscription: s, usage: noUsage, now: NOW });
    expect(ent.effectivePlan).toBe("pro");
    expect(ent.scheduledPlan).toBe("essential");
  });

  it("un compte expiré n'a plus aucun quota mais n'est pas supprimé", () => {
    const ent = getEntitlements({
      subscription: sub({ plan: "essential", status: "expired", currentPeriodEnd: at(-30) }),
      usage: noUsage,
      now: NOW,
    });
    expect(ent.readOnly).toBe(true);
    expect(ent.remaining).toEqual({
      documentsThisMonth: 0,
      aiMessagesToday: 0,
      signatureAssets: 0,
      storageBytes: 0,
    });
  });
});

describe("annulation et changements de plan programmés (Phase 6)", () => {
  it("une annulation (statut actif) s'arrête net à la fin de la période, sans grâce", () => {
    const s = sub({ plan: "essential", status: "active", currentPeriodEnd: at(1), cancelAtPeriodEnd: true });
    expect(getEntitlements({ subscription: s, usage: noUsage, now: NOW }).state).toBe("active");
    const after = getEntitlements({ subscription: s, usage: noUsage, now: at(1.5) });
    expect(after.state).toBe("expired");
    expect(after.graceEndsAt).toBeNull();
  });

  it("bascule sur le plan programmé à sa date d'effet", () => {
    const s = sub({
      plan: "pro",
      status: "active",
      currentPeriodEnd: at(35),
      scheduledPlan: "essential",
      scheduledPlanAt: at(5),
    });
    expect(getEntitlements({ subscription: s, usage: noUsage, now: at(4) }).effectivePlan).toBe("pro");
    const later = getEntitlements({ subscription: s, usage: noUsage, now: at(6) });
    expect(later.effectivePlan).toBe("essential");
    expect(later.features.stamps).toBe(false);
  });

  it("un paiement pendant l'essai garde l'essai Pro jusqu'à son terme", () => {
    const s = sub({
      plan: "trial",
      status: "active",
      currentPeriodEnd: at(34),
      scheduledPlan: "essential",
      scheduledPlanAt: at(4),
    });
    expect(getEntitlements({ subscription: s, usage: noUsage, now: NOW }).effectivePlan).toBe("pro");
    expect(getEntitlements({ subscription: s, usage: noUsage, now: at(4) }).effectivePlan).toBe("essential");
  });
});
