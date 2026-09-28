"use server";

import { renderEmail } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/send";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { siteConfig } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { contactSchema } from "@/lib/validation/contact";

export type ContactResult =
  { ok: true } | { ok: false; error: "invalid" | "rate_limited" | "server" };

export async function sendContactMessage(input: unknown): Promise<ContactResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const data = parsed.data;

  // Robot détecté par le champ piège : on fait comme si tout allait bien.
  if (data.website) return { ok: true };

  const ip = (await getClientIp()) ?? "unknown";
  if (!(await rateLimit("contact", ip, 5, 3600))) return { ok: false, error: "rate_limited" };

  const { error } = await createAdminClient()
    .from("contact_messages")
    .insert({
      name: data.name,
      email: data.email,
      organization: data.organization || null,
      message: data.message,
    });
  if (error) {
    console.error("[contact] enregistrement impossible", error);
    return { ok: false, error: "server" };
  }

  const email = renderEmail({
    preheader: `Nouveau message de ${data.name}`,
    title: `Nouveau message de ${data.name}`,
    paragraphs: [
      `De : ${data.name} <${data.email}>${data.organization ? ` — ${data.organization}` : ""}`,
      data.message,
    ],
  });
  await sendEmail({
    to: siteConfig.supportEmail,
    replyTo: data.email,
    subject: `[Contact] ${data.name}`,
    ...email,
  });

  return { ok: true };
}
