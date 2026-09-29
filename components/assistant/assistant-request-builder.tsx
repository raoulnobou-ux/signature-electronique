"use client";

import { useLocale } from "next-intl";
import { useState } from "react";
import { RequestBuilder, type BuilderPreset } from "@/components/requests/request-builder";
import { useIsClient } from "@/lib/use-is-client";
import { draftToPreset, readAssistantDraft } from "./request-draft";

function Loaded({ document, pdfUrl }: { document: { id: string; title: string }; pdfUrl: string }) {
  const locale = useLocale();
  // Lu une seule fois : l'écran de préparation garde ensuite la main sur les modifications.
  const [preset] = useState<BuilderPreset | undefined>(() => {
    const draft = readAssistantDraft(document.id);
    return draft ? draftToPreset(draft, locale) : undefined;
  });
  return <RequestBuilder document={document} pdfUrl={pdfUrl} preset={preset} />;
}

/** Demande préremplie par l'assistant (brouillon transmis par le navigateur, jamais envoyé seul). */
export function AssistantRequestBuilder(props: {
  document: { id: string; title: string };
  pdfUrl: string;
}) {
  const isClient = useIsClient();
  if (!isClient) return null;
  return <Loaded {...props} />;
}
