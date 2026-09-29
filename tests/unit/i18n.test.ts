import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/security/csp";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

type Tree = { [key: string]: Tree | string | Tree[] | string[] };

function leaves(tree: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof tree === "string") out.set(prefix, tree);
  else if (Array.isArray(tree))
    tree.forEach((v, i) => leaves(v, `${prefix}[${i}]`).forEach((s, k) => out.set(k, s)));
  else if (tree && typeof tree === "object")
    for (const [k, v] of Object.entries(tree as Tree))
      leaves(v, prefix ? `${prefix}.${k}` : k).forEach((s, key) => out.set(key, s));
  return out;
}

const variables = (s: string) =>
  // Les branches de pluriel (« one {…} ») contiennent du texte, pas des variables.
  new Set(
    [...s.matchAll(/(?<!(?:=\d+|zero|one|two|few|many|other)\s)\{(\w+)(?=[,}])/g)]
      .map((m) => m[1])
      .concat([...s.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`)),
  );

describe("traductions", () => {
  const f = leaves(fr);
  const e = leaves(en);

  it("l'anglais a exactement les mêmes clés que le français", () => {
    expect([...e.keys()].filter((k) => !f.has(k))).toEqual([]);
    expect([...f.keys()].filter((k) => !e.has(k))).toEqual([]);
  });

  it("mêmes variables et balises dans chaque message", () => {
    const mismatches = [...f].filter(([key, value]) => {
      const a = variables(value);
      const b = variables(e.get(key)!);
      return a.size !== b.size || [...a].some((v) => !b.has(v));
    });
    expect(mismatches.map(([k]) => k)).toEqual([]);
  });

  it("aucun message anglais laissé vide par erreur", () => {
    const empty = [...e].filter(([key, value]) => !value.trim() && f.get(key)!.trim());
    expect(empty).toEqual([]);
  });
});

describe("CSP", () => {
  it("nonce, sources Supabase, aucune exécution de script arbitraire", () => {
    const csp = buildCsp("abc123==", {
      supabaseUrl: "https://xyz.supabase.co",
      appUrl: "https://quicksign.app",
      dev: false,
    });
    expect(csp).toContain("script-src 'self' 'nonce-abc123==' 'strict-dynamic' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("connect-src 'self' https://xyz.supabase.co wss://xyz.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(
      buildCsp("n", {
        supabaseUrl: "http://127.0.0.1:54321",
        appUrl: "http://localhost:3000",
        dev: true,
      }),
    ).toContain("'unsafe-eval'");
  });
});
