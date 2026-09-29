"use client";

import { LayoutTemplate, MoreHorizontal, Pencil, Play, Share2, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createDocumentFromTemplate,
  deleteTemplate,
  setTemplateShared,
} from "@/app/(app)/app/modeles/actions";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TemplateCard = {
  id: string;
  name: string;
  description: string | null;
  pageCount: number;
  roles: string[];
  variables: { id: string; label: string; required: boolean }[];
  zones: number;
  useCount: number;
  mine: boolean;
  shared: boolean;
  updatedAt: string;
};

export function TemplatesView({
  templates,
  inTeam,
}: {
  templates: TemplateCard[];
  inTeam: boolean;
}) {
  const t = useTranslations("templates");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [using, setUsing] = useState<TemplateCard | null>(null);
  const [deleting, setDeleting] = useState<TemplateCard | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const launch = (tpl: TemplateCard, vars: Record<string, string>) =>
    start(async () => {
      const result = await createDocumentFromTemplate(tpl.id, vars);
      if (!result.ok)
        return void toast.error(
          t(result.error === "missing_variable" ? "errors.missingVariable" : "errors.generic"),
        );
      setUsing(null);
      toast.success(t("created"));
      router.push(`/app/documents/${result.documentId}/demande?modele=${tpl.id}`);
    });

  const use = (tpl: TemplateCard) => {
    if (tpl.zones === 0) return void toast.error(t("errors.empty"));
    if (tpl.variables.length) {
      setValues({});
      setUsing(tpl);
    } else launch(tpl, {});
  };

  if (!templates.length) {
    return <EmptyState icon={LayoutTemplate} title={t("empty")} description={t("emptyHint")} />;
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2" data-testid="template-list">
        {templates.map((tpl) => (
          <li
            key={tpl.id}
            className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <LayoutTemplate className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{tpl.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("meta", { pages: tpl.pageCount, roles: tpl.roles.length, uses: tpl.useCount })}
                </p>
              </div>
              {tpl.mine && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("actions", { name: tpl.name })}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/app/modeles/${tpl.id}/editer`}>
                        <Pencil /> {t("edit")}
                      </Link>
                    </DropdownMenuItem>
                    {inTeam && (
                      <DropdownMenuItem
                        onSelect={() =>
                          start(async () => {
                            const result = await setTemplateShared(tpl.id, !tpl.shared);
                            if (result.ok) toast.success(tpl.shared ? t("unshared") : t("shared"));
                            router.refresh();
                          })
                        }
                      >
                        <Share2 /> {tpl.shared ? t("unshare") : t("share")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem destructive onSelect={() => setDeleting(tpl)}>
                      <Trash2 /> {t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {tpl.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">{tpl.description}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {tpl.roles.map((role) => (
                <Badge key={role} variant="muted">
                  {role}
                </Badge>
              ))}
              {tpl.shared && (
                <Badge variant="default">
                  <Users aria-hidden /> {t("teamBadge")}
                </Badge>
              )}
            </div>
            <Button className="mt-auto" disabled={pending} onClick={() => use(tpl)}>
              <Play /> {t("use")}
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={using !== null} onOpenChange={(open) => !open && setUsing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{using?.name}</DialogTitle>
            <DialogDescription>{t("variablesHint")}</DialogDescription>
          </DialogHeader>
          <form
            id="template-variables"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (using) launch(using, values);
            }}
          >
            {using?.variables.map((v) => (
              <div key={v.id} className="space-y-1.5">
                <Label htmlFor={`var-${v.id}`}>
                  {v.label}
                  {v.required && " *"}
                </Label>
                <Input
                  id={`var-${v.id}`}
                  maxLength={200}
                  required={v.required}
                  value={values[v.id] ?? ""}
                  onChange={(e) => setValues((x) => ({ ...x, [v.id]: e.target.value }))}
                />
              </div>
            ))}
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("cancel")}</Button>
            </DialogClose>
            <Button type="submit" form="template-variables" loading={pending}>
              <Play /> {t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name: deleting?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("deleteBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("cancel")}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={pending}
              onClick={() =>
                start(async () => {
                  if (deleting) await deleteTemplate(deleting.id);
                  setDeleting(null);
                  router.refresh();
                })
              }
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
