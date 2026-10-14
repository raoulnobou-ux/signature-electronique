import { getChariow } from "@/lib/billing";
import { handlePaymentWebhook } from "@/lib/billing/webhook";

/** Notifications Chariow (Pulse « successful.sale » et « failed.sale », déclarée dans Chariow → Automatisations → Pulses). */
export async function POST(request: Request) {
  return handlePaymentWebhook(getChariow(), request);
}
