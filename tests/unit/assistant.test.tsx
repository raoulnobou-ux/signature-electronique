import { PDFDocument, StandardFonts } from "pdf-lib";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { draftToPreset } from "@/components/assistant/request-draft";
import { Markdown } from "@/components/assistant/markdown";
import { contextBlock, toDisplay } from "@/lib/ai/conversations";
import { renderDraftPdf } from "@/lib/ai/draft-pdf";
import { extractLayout, formatLayout } from "@/lib/ai/layout";
import { runTool, sanitizeZones, TOOLS, toolsFor, type ToolContext } from "@/lib/ai/tools";
import type { Account } from "@/lib/auth/account";
import fr from "@/messages/fr.json";

// Le client Supabase n'est pas sollicité par les cas testés ici.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const ctx = (emit = vi.fn()): ToolContext => ({
  supabase: {} as ToolContext["supabase"],
  userId: "u1",
  attachedDocumentId: null,
  emit,
});

describe("outils de l'assistant", () => {
  it("chaque outil est strict : schéma fermé, tous les champs requis, libellé traduit", () => {
    const check = (schema: Record<string, unknown>, where: string) => {
      if (schema.type === "object") {
        expect(schema.additionalProperties, where).toBe(false);
        const props = Object.keys((schema.properties ?? {}) as object);
        expect([...((schema.required as string[]) ?? [])].sort(), where).toEqual(props.sort());
        for (const [k, v] of Object.entries(
          (schema.properties ?? {}) as Record<string, Record<string, unknown>>,
        ))
          check(v, `${where}.${k}`);
      }
      if (schema.type === "array") check(schema.items as Record<string, unknown>, `${where}[]`);
    };
    for (const t of TOOLS) {
      expect(t.definition.strict).toBe(true);
      expect(t.definition.eager_input_streaming).toBe(true);
      check(t.definition.input_schema as Record<string, unknown>, t.definition.name);
      expect(fr.assistant.tools).toHaveProperty(t.definition.name);
    }
  });

  it("Essentiel : seuls les outils de guidage sont proposés", () => {
    const names = toolsFor(false).map((t) => t.definition.name);
    expect(names).toContain("show_in_app");
    expect(names).not.toContain("propose_signature_zones");
    expect(names).not.toContain("find_document");
    expect(toolsFor(true).length).toBe(TOOLS.length);
  });

  it("valide les paramètres avant d'exécuter (paramètres invalides → erreur, rien n'est fait)", async () => {
    const emit = vi.fn();
    const bad = await runTool(
      TOOLS,
      "show_in_app",
      { target: "nulle-part", label: "x" },
      ctx(emit),
    );
    expect(bad.isError).toBe(true);
    expect(bad.content).toContain("INVALID_INPUT");
    expect(emit).not.toHaveBeenCalled();

    const unknown = await runTool(TOOLS, "supprimer_tout", {}, ctx(emit));
    expect(unknown.isError).toBe(true);

    const ok = await runTool(
      TOOLS,
      "show_in_app",
      { target: "import", label: "Cliquez ici" },
      ctx(emit),
    );
    expect(ok.isError).toBe(false);
    expect(emit).toHaveBeenCalledWith({
      kind: "highlight",
      target: "import",
      label: "Cliquez ici",
    });
  });

  it("zones : seul le document joint peut être annoté", async () => {
    const emit = vi.fn();
    const zone = {
      page: 1,
      x: 10,
      y: 80,
      w: 28,
      h: 7,
      type: "signature",
      signer: "Client",
      reason: "Signature :",
    };
    const res = await runTool(
      TOOLS,
      "propose_signature_zones",
      { document_id: "7a0c0f3e-1c9b-4d6e-9f59-8f8c0b8f4a10", summary: "1 zone", zones: [zone] },
      ctx(emit),
    );
    expect(res.content).toContain("document joint");
    expect(emit).not.toHaveBeenCalled();
  });

  it("zones ramenées dans la page, pages inexistantes écartées, pages en base 0", () => {
    const zones = sanitizeZones(
      [
        { page: 1, x: 90, y: 97, w: 28, h: 7, type: "signature", signer: "Bailleur", reason: "" },
        { page: 3, x: 10, y: 10, w: 20, h: 5, type: "initials", signer: "Bailleur", reason: "" },
      ],
      2,
    );
    expect(zones).toEqual([
      { page: 0, x: 72, y: 93, w: 28, h: 7, type: "signature", signer: "Bailleur", reason: "" },
    ]);
  });
});

describe("relevé des lignes d'un PDF", () => {
  it("positions en % depuis le haut, lignes triées, une page après l'autre", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const title of ["Contrat de bail", "Annexe"]) {
      const page = pdf.addPage([595.28, 841.89]);
      page.drawText(title, { x: 60, y: 770, size: 22, font });
      page.drawText("Le bailleur", { x: 60, y: 160, size: 12, font });
      page.drawText("Signature :", { x: 300, y: 160, size: 12, font });
    }
    const layout = await extractLayout(await pdf.save());
    expect(layout.pageCount).toBe(2);
    expect(layout.lines).toHaveLength(4);
    const title = layout.lines[0]!;
    const sign = layout.lines[1]!;
    expect(title).toMatchObject({ page: 1, text: "Contrat de bail" });
    expect(title.y).toBeGreaterThan(5);
    expect(title.y).toBeLessThan(10);
    expect(sign.text).toBe("Le bailleur Signature :");
    expect(sign.x).toBeCloseTo(10.1, 0);
    expect(sign.y).toBeGreaterThan(79);
    expect(sign.y).toBeLessThan(82);
    expect(formatLayout([sign])).toMatch(/^p1 y=\d+\.\d x=10\.1 \| Le bailleur Signature :$/);

    const cut = await extractLayout(await pdf.save(), 20);
    expect(cut.truncated).toBe(true);
    expect(cut.lines).toHaveLength(1);
  });
});

describe("conversations", () => {
  it("historique affiché : contexte masqué, résultats d'outils ignorés, réponses fusionnées", () => {
    const rows = [
      {
        id: "1",
        role: "user",
        content: [
          { type: "document_ref", documentId: "d", path: "p", title: "Bail.pdf", pages: 2 },
          {
            type: "text",
            text: "<contexte>Prénom : Awa · Plan : Pro</contexte>\n\nRepère les zones",
          },
        ],
        tool_calls: null,
      },
      {
        id: "2",
        role: "assistant",
        content: [
          { type: "thinking", thinking: "…", signature: "s" },
          { type: "text", text: "Je regarde." },
          { type: "tool_use", id: "t", name: "x", input: {} },
        ],
        tool_calls: null,
      },
      {
        id: "3",
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }],
        tool_calls: null,
      },
      {
        id: "4",
        role: "assistant",
        content: [{ type: "text", text: "Voici 2 zones." }],
        tool_calls: [{ kind: "highlight", target: "import", label: "Ici" }],
      },
    ];
    expect(toDisplay(rows)).toEqual([
      { id: "1", role: "user", text: "Repère les zones", actions: [], document: "Bail.pdf" },
      {
        id: "2",
        role: "assistant",
        text: "Je regarde.\n\nVoici 2 zones.",
        actions: [{ kind: "highlight", target: "import", label: "Ici" }],
        document: null,
      },
    ]);
  });

  it("contexte : prénom, plan et quota uniquement", () => {
    const account = {
      profile: { full_name: "Awa Ngono Nkeng" },
      email: "awa@example.com",
      sponsor: null,
      entitlements: { state: "active", effectivePlan: "essential", trialDaysRemaining: null },
    } as unknown as Account;
    const text = contextBlock(account, "/app/documents", 12);
    expect(text).toBe(
      "<contexte>Prénom : Awa · Plan : Essentiel · Écran : /app/documents · Messages à l'assistant restants aujourd'hui : 12 · Langue de l'interface : français</contexte>",
    );
    expect(text).not.toContain("awa@example.com");
  });
});

describe("rendu et brouillons", () => {
  it("markdown : titres, listes, gras ; le HTML n'est jamais interprété", () => {
    const html = renderToStaticMarkup(
      <Markdown
        text={"## Étapes\n\n- **Importer** le fichier\n- Signer\n\n<script>alert(1)</script>"}
      />,
    );
    expect(html).toContain("<strong>Importer</strong>");
    expect(html).toContain("<li>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("brouillon rédigé → PDF A4 lisible, accents conservés", async () => {
    const bytes = await renderDraftPdf(
      "Attestation",
      "# Attestation de travail\n\nJe soussignée, Awa Ngono, atteste…\n\n- Poste : comptable\n- Début : 1er janvier 2024 ".repeat(
        30,
      ),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    const { lines } = await extractLayout(bytes);
    expect(lines[0]!.text).toBe("Attestation de travail");
    expect(lines.some((l) => l.text.includes("soussignée"))).toBe(true);
  });

  it("brouillon de demande : un signataire par rôle, zones rattachées au bon signataire", () => {
    const preset = draftToPreset({
      signers: [{ name: "Paul Ekotto", email: "paul@example.com", phone: "" }],
      zones: [
        { page: 0, x: 10, y: 80, w: 28, h: 7, type: "signature", signer: "Bailleur", reason: "" },
        { page: 0, x: 60, y: 80, w: 28, h: 7, type: "signature", signer: "Locataire", reason: "" },
        { page: 1, x: 80, y: 90, w: 8, h: 4, type: "initials", signer: "Locataire", reason: "" },
      ],
      mode: "parallel",
      message: "Merci de signer",
    });
    expect(preset.signers).toEqual([
      { name: "Paul Ekotto", email: "paul@example.com", phone: "", role: "Bailleur" },
      { name: "", email: "", phone: "", role: "Locataire" },
    ]);
    expect(preset.fields?.map((f) => f.signer)).toEqual([0, 1, 1]);
    expect(preset).toMatchObject({ mode: "parallel", message: "Merci de signer" });
  });
});
