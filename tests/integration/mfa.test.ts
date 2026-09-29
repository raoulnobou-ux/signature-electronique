import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { totp } from "../e2e/helpers/totp";
import { admin, hasLocalDb, url } from "./setup";

describe.skipIf(!hasLocalDb)("double authentification appliquée par la base (RLS)", () => {
  it("session aal1 d'un compte protégé : aucune donnée ; après le code : accès normal", async () => {
    const email = `mfa-${Date.now()}@example.com`;
    const password = "Integration-2026";
    const { data: created } = await admin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const client = () => createClient<Database>(url, anon, { auth: { persistSession: false } });

    // Activation du facteur TOTP.
    const first = client();
    await first.auth.signInWithPassword({ email, password });
    expect((await first.from("profiles").select("id")).data).toHaveLength(1);
    const { data: factor } = await first.auth.mfa.enroll({ factorType: "totp" });
    const verified = await first.auth.mfa.challengeAndVerify({
      factorId: factor!.id,
      code: totp(factor!.totp.secret),
    });
    expect(verified.error).toBeNull();

    // Nouvelle connexion par mot de passe seul (aal1) : tout est refusé, y compris le stockage.
    const second = client();
    await second.auth.signInWithPassword({ email, password });
    expect((await second.from("profiles").select("id")).data).toEqual([]);
    expect((await second.from("documents").select("id")).data).toEqual([]);
    const upload = await second.storage
      .from("documents")
      .upload(`${created.user!.id}/x/test.pdf`, new Blob(["%PDF"]), {
        contentType: "application/pdf",
      });
    expect(upload.error).not.toBeNull();

    // Code saisi (aal2) : accès rétabli.
    const { data: factors } = await second.auth.mfa.listFactors();
    const check = await second.auth.mfa.challengeAndVerify({
      factorId: factors!.totp[0]!.id,
      code: totp(factor!.totp.secret),
    });
    expect(check.error).toBeNull();
    expect((await second.from("profiles").select("id")).data).toHaveLength(1);
  });
});
