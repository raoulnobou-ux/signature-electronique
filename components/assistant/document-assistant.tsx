"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useOptionalAssistant } from "./assistant-context";

/**
 * Signale à l'assistant le document affiché (proposé en pièce jointe, jamais envoyé sans
 * clic) et, en Pro, propose de l'analyser directement.
 */
export function DocumentAssistant({ id, title }: { id: string; title: string }) {
  const t = useTranslations("assistant");
  const assistant = useOptionalAssistant();
  const setCurrentDocument = assistant?.setCurrentDocument;

  useEffect(() => {
    setCurrentDocument?.({ id, title });
    return () => setCurrentDocument?.(null);
  }, [id, title, setCurrentDocument]);

  if (!assistant?.pro) return null;
  return (
    <Button
      variant="secondary"
      data-testid="analyze-document"
      onClick={() => assistant.ask({ attach: { id, title }, quickAction: "summarize" })}
    >
      <Sparkles /> {t("analyze")}
    </Button>
  );
}
