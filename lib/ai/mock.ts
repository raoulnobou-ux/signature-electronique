import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { TurnResult } from "./agent";
import type { AssistantAction, AssistantEvent, ProposedZone } from "./events";
import type { LayoutLine } from "./layout";

/**
 * Assistant SIMULÉ (AI_MOCK=true, jamais en production) : réponses scriptées qui
 * empruntent exactement le même chemin (flux, actions, historique, quotas) que le vrai
 * modèle. Sert au développement sans clé et aux tests de bout en bout.
 */
export async function runMockTurn(input: {
  userText: string;
  attached: { id: string; title: string; lines: LayoutLine[] } | null;
  pro: boolean;
  send: (event: AssistantEvent) => void;
  emit: (action: AssistantAction) => void;
}): Promise<TurnResult> {
  const q = input.userText.toLowerCase();
  let reply: string;
  let action: AssistantAction | null = null;

  if (input.attached && /zone|signer|signature/.test(q)) {
    const zones: ProposedZone[] = input.attached.lines
      .filter((l) => /signature|lu et approuv|bon pour accord/i.test(l.text))
      .map((l) => ({
        page: l.page - 1,
        x: Math.min(l.x, 70),
        y: Math.min(l.y + 2.5, 92),
        w: 28,
        h: 7,
        type: "signature" as const,
        signer: "Signataire",
        reason: `Ligne « ${l.text.slice(0, 60)} »`,
      }));
    action = {
      kind: "zones",
      documentId: input.attached.id,
      zones,
      summary: `${zones.length} zone(s) de signature repérée(s).`,
    };
    reply = `J'ai repéré **${zones.length} zone(s) de signature** dans « ${input.attached.title} ». Vérifiez la proposition puis appliquez-la à une demande de signature.`;
  } else if (input.attached && /résum/.test(q)) {
    reply = `Voici un résumé de « ${input.attached.title} » (simulation) :\n\n- ${input.attached.lines.length} lignes de texte analysées\n- Première ligne : « ${input.attached.lines[0]?.text ?? "—"} »`;
  } else if (/importer|import|word/.test(q)) {
    action = {
      kind: "highlight",
      target: "import",
      label: "Cliquez ici pour importer un document",
    };
    reply =
      "Pour importer un document :\n\n1. Ouvrez « Documents ».\n2. Cliquez sur « Importer ».\n3. Glissez votre fichier PDF ou Word : il est converti automatiquement.";
  } else if (/rédige|redige|attestation|contrat/.test(q) && input.pro) {
    action = {
      kind: "draft_document",
      title: "Attestation de travail",
      body: "# Attestation de travail\n\nJe soussigné, Awa Ngono, gérante de la société Exemple SARL, atteste que M. Paul Ekotto est employé depuis le 1er janvier 2024.\n\nFait à Douala, pour servir et valoir ce que de droit.",
    };
    reply = "Voici un brouillon d'attestation. Relisez-le, puis créez le PDF en un clic.";
  } else if (/pro|essentiel|prix|plan/.test(q)) {
    reply =
      "**Essentiel** (5 000 FCFA/mois) : signer vos propres documents, 50 par mois.\n\n**Pro** (15 000 FCFA/mois) : documents illimités, cachets, demandes de signature à plusieurs, certificat, modèles, équipe.";
  } else {
    reply =
      "Je suis QuickSign Copilot (mode démonstration). Je peux vous guider dans l'application, expliquer les plans et, avec le plan Pro, analyser vos documents.";
  }

  if (action) input.emit(action);
  // Flux par petits morceaux, comme le vrai modèle.
  for (const chunk of reply.match(/.{1,12}/gs) ?? []) {
    input.send({ type: "text", delta: chunk });
    await new Promise((r) => setTimeout(r, 5));
  }
  const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: reply }];
  return {
    appended: [{ role: "assistant", content }],
    text: reply,
    usedTools: Boolean(action),
    tokensIn: 0,
    tokensOut: 0,
  };
}
