import { getNotchPay } from "@/lib/billing";
import { handlePaymentWebhook } from "@/lib/billing/webhook";

/** Notifications Notch Pay (URL déclarée dans le tableau de bord Notch Pay → Webhooks). */
export async function POST(request: Request) {
  return handlePaymentWebhook(getNotchPay(), request);
}
