/**
 * Politique de sécurité du contenu (CSP) stricte, avec un nonce par requête : seuls les
 * scripts émis par Next.js pour cette réponse s'exécutent (aucun script injecté).
 */
export function buildCsp(
  nonce: string,
  env: { supabaseUrl: string; appUrl: string; dev: boolean },
): string {
  const supabase = new URL(env.supabaseUrl);
  const supabaseWs = `${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`;
  // Paiement par carte : Paddle.js (chargé avec le nonce) et son formulaire en iframe.
  const paddle = "https://*.paddle.com";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' : les scripts chargés par un script de confiance le sont aussi.
    // 'wasm-unsafe-eval' : décodeurs d'images WebAssembly de pdf.js (pas d'eval JavaScript).
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
      ...(env.dev ? ["'unsafe-eval'"] : []),
    ],
    // Positions des signatures et zones : styles en ligne indispensables (aucun script).
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:", supabase.origin, paddle],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabase.origin, supabaseWs, paddle],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'", "blob:", paddle],
    "media-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([key, values]) => `${key} ${values.join(" ")}`);
  if (env.appUrl.startsWith("https://")) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}
