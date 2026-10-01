import { getPawaPay } from "@/lib/billing";
import { handlePaymentWebhook } from "@/lib/billing/webhook";

/** Notifications de dépôt pawaPay (URL de callback configurée dans le tableau de bord pawaPay). */
export async function POST(request: Request) {
  return handlePaymentWebhook(getPawaPay(), request);
}
