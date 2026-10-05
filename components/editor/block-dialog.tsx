"use client";

import { BriefcaseBusiness, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import type { SignatureBlock } from "@/lib/pdf/block";

/**
 * Réglage du bloc professionnel avant de le poser : textes et éléments inclus.
 * Les choix sont enregistrés dans le profil et proposés au document suivant.
 */
export function BlockDialog({
  open,
  onOpenChange,
  initial,
  stampsAllowed,
  dateLabel,
  onPlace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SignatureBlock;
  stampsAllowed: boolean;
  dateLabel: string;
  onPlace: (block: SignatureBlock) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreenOnMobile className="sm:max-w-lg">
        {/* Nouvelle instance à chaque ouverture : le formulaire repart du bloc enregistré. */}
        {open && (
          <BlockForm
            initial={initial}
            stampsAllowed={stampsAllowed}
            dateLabel={dateLabel}
            onPlace={onPlace}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BlockForm({
  initial,
  stampsAllowed,
  dateLabel,
  onPlace,
}: {
  initial: SignatureBlock;
  stampsAllowed: boolean;
  dateLabel: string;
  onPlace: (block: SignatureBlock) => void;
}) {
  const t = useTranslations("editor.block");
  const [block, setBlock] = useState<SignatureBlock>({
    ...initial,
    stamp: initial.stamp && stampsAllowed,
  });
  const set = (patch: Partial<SignatureBlock>) => setBlock((b) => ({ ...b, ...patch }));
  const empty =
    !block.signature &&
    !block.stamp &&
    !block.date &&
    !block.name &&
    !block.title &&
    !block.company;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <BriefcaseBusiness className="size-5" aria-hidden /> {t("title")}
        </DialogTitle>
        <DialogDescription>{t("body")}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="block-name">{t("name")}</Label>
          <Input
            id="block-name"
            value={block.name}
            maxLength={80}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="block-title">{t("jobTitle")}</Label>
            <Input
              id="block-title"
              value={block.title}
              maxLength={80}
              placeholder={t("jobTitlePlaceholder")}
              onChange={(e) => set({ title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="block-company">{t("company")}</Label>
            <Input
              id="block-company"
              value={block.company}
              maxLength={120}
              onChange={(e) => set({ company: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <ToggleRow
            id="block-signature"
            label={t("includeSignature")}
            checked={block.signature}
            onChange={(signature) => set({ signature })}
          />
          <ToggleRow
            id="block-date"
            label={t("includeDate", { date: dateLabel })}
            checked={block.date}
            onChange={(date) => set({ date })}
          />
          <ToggleRow
            id="block-stamp"
            label={t("includeStamp")}
            checked={block.stamp}
            disabled={!stampsAllowed}
            hint={stampsAllowed ? undefined : t("stampPro")}
            onChange={(stamp) => set({ stamp })}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">{t("cancel")}</Button>
        </DialogClose>
        <Button disabled={empty} onClick={() => onPlace(block)}>
          <BriefcaseBusiness /> {t("place")}
        </Button>
      </DialogFooter>
    </>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  disabled,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" aria-hidden /> {hint}
          </p>
        )}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
