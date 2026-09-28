import "server-only";
import { serverEnv } from "@/lib/env.server";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: string /* base64 */ }[];
};

export type SendResult =
  { ok: true; id: string | null; skipped?: boolean } | { ok: false; error: string };

/**
 * Envoi d'un e-mail transactionnel via l'API Resend.
 * Sans RESEND_API_KEY (développement), l'e-mail est seulement journalisé.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (!serverEnv.RESEND_API_KEY) {
    console.info(
      `[email] RESEND_API_KEY absente — e-mail non envoyé : « ${message.subject} » → ${String(message.to)}`,
    );
    return { ok: true, id: null, skipped: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: serverEnv.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo,
        attachments: message.attachments,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("[email] échec Resend", response.status, body);
      return { ok: false, error: `Resend ${response.status}` };
    }
    const data = (await response.json()) as { id?: string };
    return { ok: true, id: data.id ?? null };
  } catch (error) {
    console.error("[email] erreur réseau", error);
    return { ok: false, error: "network" };
  }
}
