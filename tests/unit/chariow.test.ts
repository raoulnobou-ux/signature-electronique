import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ChariowProvider,
  chariowPhone,
  mapChariowStatus,
  splitName,
  verifyChariowSignature,
  type ChariowProducts,
} from "@/lib/billing/providers/card/chariow";
import { providerErrorKind, type CheckoutRequest } from "@/lib/billing/providers/types";

vi.mock("@/lib/monitoring/app-errors", () => ({ logAppError: vi.fn() }));

const REF = "4f7b2c1e-8a3d-4b6e-9c2f-1a2b3c4d5e6f";
const SALE = "sal_abc123xyz";
const SECRET = "whsec_test_secret";
const PRODUCTS: ChariowProducts = {
  "essential.monthly": "prd_ess_m",
  "essential.yearly": "prd_ess_y",
  "pro.monthly": "prd_pro_m",
  "pro.yearly": undefined,
};

const request: CheckoutRequest = {
  reference: REF,
  amount: 5000,
  currency: "XAF",
  description: "Abonnement Essentiel — mensuel",
  productName: "QuickSign Essentiel",
  language: "fr",
  customer: { email: "awa@exemple.com", name: "Awa Ndzi Fotso", phone: "+237670000000" },
  redirectUrl: `https://quicksign.test/app/abonnement/paiement?ref=${REF}`,
  plan: "essential",
  cycle: "monthly",
  kind: "new",
  customerIp: "203.0.113.7",
  meta: {},
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Faux Chariow : produit à `price` FCFA, puis réponse `checkout` à la création. */
function chariow(price: number, checkout: Response = json(201, okCheckout)) {
  return vi
    .fn()
    .mockResolvedValueOnce(
      json(200, {
        data: {
          id: "prd_ess_m",
          type: "license",
          status: "published",
          pricing: { type: "one_time", current_price: { value: price, currency: "XAF" } },
        },
      }),
    )
    .mockResolvedValueOnce(checkout);
}
const okCheckout = {
  data: {
    step: "payment",
    purchase: { id: SALE, status: "awaiting_payment" },
    payment: { checkout_url: "https://pay.chariow.com/checkout/abc?country=CM" },
  },
};
const provider = (fetcher: unknown, secret?: string) =>
  new ChariowProvider("sk_live_x", PRODUCTS, secret, fetcher as typeof fetch);

describe("Chariow : création du paiement", () => {
  it("vérifie le prix du produit, puis crée la vente avec notre référence", async () => {
    const fetcher = chariow(5000);
    expect(await provider(fetcher).createCheckout(request)).toEqual({
      url: "https://pay.chariow.com/checkout/abc?country=CM",
      transactionId: SALE,
    });
    const [productUrl, productInit] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(productUrl).toBe("https://api.chariow.com/v1/products/prd_ess_m");
    expect((productInit.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_x");
    const [checkoutUrl, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(checkoutUrl).toBe("https://api.chariow.com/v1/checkout");
    expect(JSON.parse(String(init.body))).toEqual({
      product_id: "prd_ess_m",
      email: "awa@exemple.com",
      first_name: "Awa",
      last_name: "Ndzi Fotso",
      phone: { number: "670000000", country_code: "CM" },
      redirect_url: request.redirectUrl,
      custom_metadata: { qs_ref: REF, qs_kind: "new" },
      customer_ip: "203.0.113.7",
    });
  });

  it("prix différent de celui de QuickSign : aucun paiement créé (erreur de configuration)", async () => {
    const fetcher = chariow(4500);
    const error = await provider(fetcher)
      .createCheckout(request)
      .catch((e: Error) => e);
    expect(providerErrorKind(error)).toBe("config");
    expect((error as Error).message).toContain("4500");
    expect(fetcher).toHaveBeenCalledTimes(1); // jamais de POST /checkout
  });

  it("refus avant tout appel : produit absent, prorata, téléphone manquant, référence invalide", async () => {
    const fetcher = vi.fn();
    const p = provider(fetcher);
    const kind = (req: CheckoutRequest) => p.createCheckout(req).catch(providerErrorKind);
    expect(await kind({ ...request, plan: "pro", cycle: "yearly" })).toBe("config");
    expect(await kind({ ...request, kind: "upgrade" })).toBe("rejected");
    expect(await kind({ ...request, customer: { ...request.customer, phone: null } })).toBe(
      "rejected",
    );
    expect(await kind({ ...request, customer: { ...request.customer, phone: "123" } })).toBe(
      "rejected",
    );
    expect(await kind({ ...request, reference: "pas-un-uuid" })).toBe("internal");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("réponses de Chariow : clé refusée, requête refusée, étape inattendue, vente gratuite", async () => {
    const kindOf = (checkout: Response) =>
      provider(chariow(5000, checkout)).createCheckout(request).catch(providerErrorKind);
    expect(await kindOf(json(401, { message: "Invalid API key" }))).toBe("config");
    expect(await kindOf(json(400, { message: "Invalid phone number +237670000000" }))).toBe(
      "rejected",
    );
    expect(await kindOf(json(200, { data: { step: "already_purchased", purchase: null } }))).toBe(
      "invalid_response",
    );
    // Numéro masqué dans le message gardé pour le diagnostic.
    const masked = await provider(
      chariow(5000, json(400, { message: "Invalid phone number +237670000000" })),
    )
      .createCheckout(request)
      .catch((e: Error) => e.message);
    expect(masked).toBe("Chariow 400 : Invalid phone number [numéro]");
    // Remise de 100 % : vente terminée, retour direct sur la page d'état (revérifiée).
    const free = await provider(
      chariow(5000, json(201, { data: { step: "completed", purchase: { id: SALE } } })),
    ).createCheckout(request);
    expect(free).toEqual({ url: request.redirectUrl, transactionId: SALE });
  });

  it("nom et téléphone au format Chariow", () => {
    expect(splitName("Awa", "awa@x.cm")).toEqual({ first: "Awa", last: "Awa" });
    expect(splitName("  ", "jean.d@x.cm")).toEqual({ first: "jean.d", last: "jean.d" });
    expect(splitName("A".repeat(80), "a@b.c").first).toHaveLength(50);
    expect(chariowPhone("+33612345678")).toEqual({ number: "612345678", country_code: "FR" });
    expect(chariowPhone(null)).toBeNull();
  });
});

describe("Chariow : vérification de la vente", () => {
  const sale = (over: Record<string, unknown>) =>
    json(200, {
      data: {
        id: SALE,
        status: "completed",
        amount: { value: 5000, currency: "XAF" },
        custom_metadata: { qs_ref: REF },
        product: { id: "prd_ess_m" },
        ...over,
      },
    });
  const verify = (response: Response, transactionId: string | null = SALE) =>
    provider(vi.fn().mockResolvedValue(response)).verifyTransaction({
      reference: REF,
      transactionId,
    });

  it("vente payée : montant et devise relus chez Chariow", async () => {
    expect(await verify(sale({}))).toEqual({
      status: "successful",
      reference: REF,
      transactionId: SALE,
      amount: 5000,
      currency: "XAF",
      method: "chariow",
      failureReason: null,
    });
    expect((await verify(sale({ status: "settled" })))?.status).toBe("successful");
  });

  it("statuts : en attente, échouée, abandonnée", async () => {
    expect((await verify(sale({ status: "awaiting_payment" })))?.status).toBe("pending");
    expect(await verify(sale({ status: "failed" }))).toMatchObject({
      status: "failed",
      failureReason: "failed",
    });
    expect(await verify(sale({ status: "abandoned" }))).toMatchObject({
      status: "failed",
      failureReason: "abandoned",
    });
    expect(mapChariowStatus("initiated")).toBe("pending");
    expect(mapChariowStatus(undefined)).toBe("pending");
  });

  it("vente d'un autre paiement ou d'un autre produit : jamais acceptée", async () => {
    expect(
      (await verify(sale({ custom_metadata: { qs_ref: "00000000-0000-4000-8000-000000000000" } })))
        ?.failureReason,
    ).toBe("reference_mismatch");
    expect((await verify(sale({ product: { id: "prd_inconnu" } })))?.failureReason).toBe(
      "reference_mismatch",
    );
    expect(await verify(sale({ id: "sal_autre1234" }))).toBeNull();
  });

  it("identifiant absent ou invalide, vente introuvable : reste en attente", async () => {
    expect(await verify(sale({}), null)).toBeNull();
    expect(await verify(sale({}), "trx.pas-chariow")).toBeNull();
    expect(await verify(json(404, { message: "Not found" }))).toBeNull();
  });
});

describe("Chariow : notifications (Pulses)", () => {
  const body = JSON.stringify({
    event: "successful.sale",
    sale: {
      id: SALE,
      status: "completed",
      amount: { value: 5000, currency: "XAF" },
      custom_metadata: { qs_ref: REF },
    },
    customer: { email: "awa@exemple.com", phone: "+237670000000", name: "Awa" },
  });
  const headers = (raw: string, event = "successful.sale", secret = SECRET) =>
    new Headers({
      "x-chariow-signature": "sha256=" + createHmac("sha256", secret).update(raw).digest("hex"),
      "x-pulse-delivery-id": "dlv_123",
      "x-pulse-event": event,
    });

  it("signature exigée, sur le corps brut", () => {
    expect(provider(vi.fn()).parseWebhook(headers(body), body)).toBeNull(); // pas de secret
    const p = provider(vi.fn(), SECRET);
    expect(p.parseWebhook(new Headers(), body)).toBeNull();
    expect(p.parseWebhook(headers(body, "successful.sale", "whsec_autre"), body)).toBeNull();
    expect(p.parseWebhook(headers(body), `${body} `)).toBeNull();
    expect(verifyChariowSignature("pas-sha256", body, SECRET)).toBe(false);
  });

  it("vente réussie ou échouée : notre référence, l'identifiant de vente, la clé de livraison", () => {
    const p = provider(vi.fn(), SECRET);
    expect(p.parseWebhook(headers(body), body)).toMatchObject({
      key: "dlv_123",
      type: "successful.sale",
      reference: REF,
      transactionId: SALE,
    });
    expect(p.parseWebhook(headers(body, "failed.sale"), body)?.reference).toBe(REF);
    // Autres événements (licences, affiliés…) : notés, ignorés.
    expect(p.parseWebhook(headers(body, "issued.licence"), body)).toMatchObject({
      reference: null,
      transactionId: null,
    });
  });

  it("le journal ne garde jamais les coordonnées du client", () => {
    const event = provider(vi.fn(), SECRET).parseWebhook(headers(body), body);
    const stored = JSON.stringify(event?.payload);
    expect(stored).not.toContain("awa@exemple.com");
    expect(stored).not.toContain("670000000");
    expect(stored).toContain(SALE);
  });
});
