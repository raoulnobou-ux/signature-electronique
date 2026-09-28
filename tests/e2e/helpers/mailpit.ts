/** Lecture des e-mails de test dans Mailpit (serveur SMTP local de Supabase). */
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MailSummary = { ID: string; Subject: string; To: { Address: string }[]; Created: string };

export async function waitForEmail(
  to: string,
  subjectIncludes: string,
  timeoutMs = 15_000,
): Promise<{ html: string; subject: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const data = (await res.json()) as { messages: MailSummary[] };
    const match = data.messages.find((m) => m.Subject.includes(subjectIncludes));
    if (match) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json()) as {
        HTML: string;
        Subject: string;
      };
      return { html: full.HTML, subject: full.Subject };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Aucun e-mail « ${subjectIncludes} » reçu pour ${to}`);
}

/** Premier lien du corps HTML qui contient `pathPart`. */
export function extractLink(html: string, pathPart: string): string {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
  const link = links.find((l) => l.includes(pathPart));
  if (!link) throw new Error(`Lien ${pathPart} introuvable`);
  return link;
}

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
