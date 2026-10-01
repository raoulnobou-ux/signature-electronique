import { getPaddle } from "@/lib/billing";
import { handlePaymentWebhook } from "@/lib/billing/webhook";

/** Notifications Paddle (destination configurée dans Paddle → Developer tools → Notifications). */
export async function POST(request: Request) {
  return handlePaymentWebhook(getPaddle(), request);
}
