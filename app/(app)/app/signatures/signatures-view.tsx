"use client";

import { Copy, Lock, MoreHorizontal, PenLine, Pencil, Plus, Share2, Stamp, Star, Trash2, Type, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { SignatureCreator } from "@/components/signatures/signature-creator";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  deleteSignatureAsset,
  duplicateSignatureAsset,
  renameSignatureAsset,
  setAssetShared,
  setDefaultSignatureAsset,
  type AssetType,
  type SignatureAsset,
} from "./actions";

const SECTIONS: { type: AssetType; icon: typeof PenLine }[] = [
  { type: "signature", icon: PenLine },
  { type: "initials", icon: Type },
  { type: "stamp", icon: Stamp },
];

export function SignaturesView({
  assets,
  readOnly,
  stampsAllowed,
  limit,
  inTeam = false,
}: {
  assets: SignatureAsset[];
  readOnly: boolean;
  stampsAllowed: boolean;
  limit: number | null;
  inTeam?: boolean;
}) {
  const t = useTranslations("signatures");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("nouvelle") as AssetType | null;
  const [creator, setCreator] = useState<AssetType | null>(requested && ["signature", "initials", "stamp"].includes(requested) ? requested : null);
  const [renaming, setRenaming] = useState<SignatureAsset | null>(null);
  const [deleting, setDeleting] = useState<SignatureAsset | null>(null);
  const [pending, startTransition] = useTransition();

  const personal = assets.filter((a) => a.mine && a.type !== "stamp").length;

  const run = (action: () => Promise<{ ok: boolean }>, message: string, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(message);
        after?.();
        router.refresh();
      } else toast.error(t("toasts.error"));
    });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          !readOnly && (
            <Button data-tour="new-signature" onClick={() => setCreator("signature")}>
              <Plus /> {t("create")}
            </Button>
          )
        }
      />

      {limit !== null && (
        <div className="mb-8 max-w-sm space-y-1.5">
          <p className="text-sm text-muted-foreground">{t("limit", { used: personal, max: limit })}</p>
          <Progress value={(personal / limit) * 100} />
        </div>
      )}

      <div className="space-y-10">
        {SECTIONS.map(({ type, icon: Icon }) => {
          const list = assets.filter((a) => a.type === type);
          const locked = type === "stamp" && !stampsAllowed;
          return (
            <section key={type} aria-labelledby={`section-${type}`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id={`section-${type}`} className="flex items-center gap-2 font-display text-xl font-semibold">
                  <Icon className="size-5 text-accent-foreground" aria-hidden /> {t(`sections.${type}`)}
                  {type === "stamp" && <Badge variant="brand">Pro</Badge>}
                </h2>
                {!readOnly && !locked && (
                  <Button variant="ghost" size="sm" onClick={() => setCreator(type)}>
                    <Plus /> {t(`creator.kinds.${type}`)}
                  </Button>
                )}
              </div>
              {locked ? (
                <p className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                  <Lock className="size-4" aria-hidden /> {t("proOnly")}
                </p>
              ) : list.length === 0 ? (
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => setCreator(type)}
                  className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground disabled:cursor-default"
                >
                  <Plus className="size-4" aria-hidden /> {t(`emptySection.${type}`)}
                </button>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {list.map((asset) => (
                    <li key={asset.id} className="group glass relative overflow-hidden rounded-2xl transition-shadow hover:shadow-lift">
                      <div className="flex h-32 items-center justify-center bg-white p-4">
                        {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
                        <img src={asset.url} alt={asset.name} className="max-h-full max-w-full object-contain" />
                      </div>
                      {asset.shared && (
                        <Badge variant="default" className="absolute top-2 right-2">
                          <Users aria-hidden /> {t("teamShared")}
                        </Badge>
                      )}
                      {asset.mine && asset.isDefault && (
                        <Badge variant="brand" className="absolute top-2 left-2">
                          <Star aria-hidden /> {t("default")}
                        </Badge>
                      )}
                      <div className="flex items-center gap-1 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{asset.name}</p>
                          <p className="text-xs text-muted-foreground">{t(`methods.${asset.method}`)}</p>
                        </div>
                        {!readOnly && asset.mine && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Actions — ${asset.name}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!asset.isDefault && (
                                <DropdownMenuItem onSelect={() => run(() => setDefaultSignatureAsset(asset.id), t("toasts.defaultSet"))}>
                                  <Star /> {t("setDefault")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => setRenaming(asset)}>
                                <Pencil /> {t("rename")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => run(() => duplicateSignatureAsset(asset.id), t("toasts.duplicated"))}>
                                <Copy /> {t("duplicate")}
                              </DropdownMenuItem>
                              {inTeam && asset.type === "stamp" && (
                                <DropdownMenuItem
                                  onSelect={() => run(() => setAssetShared(asset.id, !asset.shared), asset.shared ? t("toasts.unshared") : t("toasts.shared"))}
                                >
                                  <Share2 /> {asset.shared ? t("unshare") : t("share")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem destructive onSelect={() => setDeleting(asset)}>
                                <Trash2 /> {t("delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <SignatureCreator
        open={creator !== null}
        type={creator ?? "signature"}
        stampsAllowed={stampsAllowed}
        onOpenChange={(open) => {
          if (!open) {
            setCreator(null);
            if (searchParams.get("nouvelle")) router.replace("/app/signatures", { scroll: false });
            router.refresh();
          }
        }}
      />

      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rename")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get("name") as string;
              if (renaming) run(() => renameSignatureAsset(renaming.id, name), t("toasts.renamed"), () => setRenaming(null));
            }}
          >
            <Input name="name" defaultValue={renaming?.name} maxLength={80} autoFocus aria-label={t("rename")} />
            <DialogFooter>
              <Button type="submit" loading={pending}>
                {t("rename")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete")}</DialogTitle>
            <DialogDescription>{deleting && t("deleteConfirm", { name: deleting.name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={pending}
              onClick={() => deleting && run(() => deleteSignatureAsset(deleting.id), t("toasts.deleted"), () => setDeleting(null))}
            >
              <Trash2 /> {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
