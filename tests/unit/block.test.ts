import { describe, expect, it } from "vitest";
import {
  defaultSignatureBlock,
  layoutSignatureBlock,
  readSignatureBlock,
  type SignatureBlock,
} from "@/lib/pdf/block";
import { fieldsSchema } from "@/lib/pdf/fields";
import {
  renderStatusStampSvg,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_STAMPS,
} from "@/lib/images/stamp";

const SIG = "11111111-1111-4111-8111-111111111111";
const STAMP = "22222222-2222-4222-8222-222222222222";

const full: SignatureBlock = {
  name: "Awa Nkeng",
  title: "Directrice",
  company: "Cabinet Nkeng",
  signature: true,
  date: true,
  stamp: true,
};

function layout(block: SignatureBlock, centerX = 50, centerY = 50) {
  let n = 0;
  return layoutSignatureBlock(block, {
    page: 0,
    centerX,
    centerY,
    pageAspect: 0.707,
    signature: { assetId: SIG, aspect: 3 },
    stamp: { assetId: STAMP, aspect: 1 },
    dateLabel: "5 octobre 2026, Douala",
    newId: () => `f${n++}`,
  });
}

describe("bloc professionnel", () => {
  it("pose signature, nom, fonction, structure, date et cachet en une fois", () => {
    const fields = layout(full);
    expect(fields.map((f) => f.type)).toEqual([
      "signature",
      "name",
      "text",
      "text",
      "date",
      "stamp",
    ]);
    expect(fields.map((f) => f.value)).toEqual([
      null,
      "Awa Nkeng",
      "Directrice",
      "Cabinet Nkeng",
      "5 octobre 2026, Douala",
      null,
    ]);
    expect(fields[0]!.assetId).toBe(SIG);
    expect(fields[5]!.assetId).toBe(STAMP);
    // Champs valides pour l'enregistrement et la signature (dans la page, images liées).
    expect(fieldsSchema.safeParse(fields).success).toBe(true);
    // Les lignes de texte s'empilent sous la signature, sans se chevaucher.
    const [sig, name, title] = fields;
    expect(name!.y).toBeGreaterThanOrEqual(sig!.y + sig!.h);
    expect(title!.y).toBeGreaterThanOrEqual(name!.y + name!.h);
  });

  it("reste dans la page même posé dans un coin", () => {
    for (const [x, y] of [
      [0, 0],
      [100, 100],
      [99, 2],
    ] as const) {
      const fields = layout(full, x, y);
      for (const f of fields) {
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.x + f.w).toBeLessThanOrEqual(100.001);
        expect(f.y + f.h).toBeLessThanOrEqual(100.001);
      }
      expect(fieldsSchema.safeParse(fields).success).toBe(true);
    }
  });

  it("n'inclut que les éléments choisis", () => {
    const fields = layout({ ...full, title: "", stamp: false, signature: false });
    expect(fields.map((f) => f.type)).toEqual(["name", "text", "date"]);
    expect(
      layout({
        ...full,
        name: "",
        title: "",
        company: "",
        signature: false,
        date: false,
        stamp: false,
      }),
    ).toEqual([]);
  });

  it("lit le bloc enregistré, ou le propose à partir du profil", () => {
    const profile = { full_name: "Awa Nkeng", org_name: "Cabinet Nkeng" };
    expect(readSignatureBlock(null, profile)).toEqual(defaultSignatureBlock(profile));
    expect(readSignatureBlock({ bad: true }, profile).name).toBe("Awa Nkeng");
    expect(readSignatureBlock(full, profile)).toEqual(full);
  });
});

describe("tampons de statut", () => {
  it("chaque statut a un libellé FR et EN et une encre", () => {
    for (const status of STATUS_STAMPS) {
      expect(STATUS_LABELS.fr[status]).toBeTruthy();
      expect(STATUS_LABELS.en[status]).toBeTruthy();
      expect(STATUS_COLORS[status]).toBeTruthy();
    }
  });

  it("produit un SVG avec le statut, la date et la structure échappés", () => {
    const svg = renderStatusStampSvg({
      label: STATUS_LABELS.fr.paid,
      color: "red",
      date: "05/10/2026",
      organization: "Ngono & <Fils>",
      ink: true,
    });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("PAYÉ");
    expect(svg).toContain("05/10/2026");
    expect(svg).toContain("NGONO &amp; &lt;FILS&gt;");
    expect(svg).not.toContain("<FILS>");
    expect(svg).toContain('filter="url(#ink)"');
  });

  it("un tampon sans date ni structure est moins haut", () => {
    const height = (svg: string) => Number(/height="(\d+)"/.exec(svg)![1]);
    const bare = renderStatusStampSvg({ label: "REÇU", color: "blue" });
    const rich = renderStatusStampSvg({
      label: "REÇU",
      color: "blue",
      date: "x",
      organization: "y",
    });
    expect(height(rich)).toBeGreaterThan(height(bare));
  });
});
