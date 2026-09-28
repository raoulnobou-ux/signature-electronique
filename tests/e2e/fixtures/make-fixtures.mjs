// Génère les fichiers de test : un document Word (.docx) et un PDF de 2 pages.
import { writeFileSync } from "node:fs";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("Contrat de prestation de services")],
        }),
        new Paragraph("Entre le Cabinet Nkeng & Associés, Douala, et la société Kadji SARL."),
        new Paragraph("Article 1 — Objet : conseil juridique pour une durée de 12 mois."),
        new Paragraph("Article 2 — Honoraires : 450 000 FCFA par mois."),
        new Paragraph(""),
        new Paragraph("Fait à Douala, le ……………… Lu et approuvé."),
        new Paragraph("Signature :"),
      ],
    },
  ],
});
writeFileSync("tests/e2e/fixtures/contrat.docx", await Packer.toBuffer(doc));

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (const title of ["Lettre d'annonce — page 1", "Lettre d'annonce — page 2"]) {
  const page = pdf.addPage([595.28, 841.89]);
  page.drawText(title, { x: 60, y: 770, size: 22, font });
  page.drawText("Fait à Douala. Signature :", { x: 60, y: 160, size: 12, font });
}
writeFileSync("tests/e2e/fixtures/annonce.pdf", await pdf.save());
console.log("Fichiers de test générés.");
