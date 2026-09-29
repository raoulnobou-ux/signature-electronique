import type { AccessState } from "@/lib/entitlements";
import type { PaidPlan, PlanId } from "@/lib/entitlements/plans";

/** Résumé sérialisable du compte transmis aux composants client de l'application. */
export type ShellAccount = {
  name: string;
  email: string;
  avatarUrl: string | null;
  state: AccessState;
  effectivePlan: PaidPlan | null;
  subscriptionPlan: PlanId;
  trialDaysRemaining: number | null;
  periodEndsAt: string;
  graceEndsAt: string | null;
  readOnly: boolean;
  /** Assistant : outils avancés (analyse de documents, actions) — plan Pro. */
  aiAdvanced: boolean;
  /** Messages à l'assistant restants aujourd'hui (null = illimité). */
  aiRemaining: number | null;
};
