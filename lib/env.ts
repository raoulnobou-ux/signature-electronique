import { z } from "zod";

/**
 * Variables publiques (exposées au navigateur). Accès littéral à process.env.X
 * obligatoire pour que Next.js les injecte au build.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

/**
 * Adresse du site : NEXT_PUBLIC_APP_URL, sinon (Vercel) l'adresse de production du projet,
 * pour que liens de signature et e-mails fonctionnent même avant d'avoir un domaine.
 */
const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
export const appUrl =
  process.env.NEXT_PUBLIC_APP_URL || (vercelUrl ? `https://${vercelUrl}` : undefined);

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_APP_URL: appUrl,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
