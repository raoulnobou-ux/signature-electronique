"use client";

import { LayoutTemplate } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTemplateFromDocument } from "@/app/(app)/app/modeles/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** « Enregistrer comme modèle » depuis la fiche d'un document (Pro). */
export function SaveAsTemplateButton({ documentId, defaultName }: { documentId: string; defaultName: string }) {
  const t = useTranslations("templates");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      const result = await createTemplateFromDocument(documentId, { name, description });
      if (result.ok) router.push(`/app/modeles/${result.templateId}/editer`);
      else toast.error(t("errors.generic"));
    });

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <LayoutTemplate /> {t("saveAs")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saveAs")}</DialogTitle>
            <DialogDescription>{t("saveAsHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">{t("name")}</Label>
              <Input id="tpl-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-description">{t("descriptionLabel")}</Label>
              <Input id="tpl-description" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("cancel")}</Button>
            </DialogClose>
            <Button loading={pending} disabled={!name.trim()} onClick={create}>
              {t("continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
