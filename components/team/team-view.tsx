"use client";

import {
  Crown,
  LogOut,
  Mail,
  MoreHorizontal,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  changeRole,
  createTeam,
  deleteTeam,
  inviteMember,
  leaveTeam,
  removeMember,
  revokeInvitation,
} from "@/app/(app)/app/equipe/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

type Role = "owner" | "admin" | "member";
type TeamData = {
  id: string;
  name: string;
  role: Role;
  seatLimit: number;
  currentUserId: string;
  members: {
    userId: string;
    role: Role;
    name: string;
    email: string;
    avatarUrl: string | null;
    joinedAt: string;
  }[];
  invitations: { id: string; email: string; role: "admin" | "member"; expiresAt: string }[];
  activity: {
    id: number;
    at: string;
    type: string;
    actor: string | null;
    document: string | null;
  }[];
};

const ACTIVITY = [
  "document.imported",
  "document.signed",
  "request.created",
  "request.canceled",
  "template.created",
  "template.used",
  "template.shared",
  "team.member_joined",
  "team.member_removed",
  "asset.shared",
] as const;
type ActivityKey = {
  [K in (typeof ACTIVITY)[number]]: K extends `${infer A}.${infer B}` ? `${A}_${B}` : never;
}[(typeof ACTIVITY)[number]];

export function TeamView({ team }: { team: TeamData | null }) {
  const t = useTranslations("team");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);

  const done = (ok: boolean, message = t("done")) => {
    if (ok) toast.success(message);
    else toast.error(t("errors.generic"));
    router.refresh();
  };

  if (!team) {
    return (
      <Card className="gradient-border">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-gradient text-white">
              <Users className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold">{t("createTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("createHint")}</p>
            </div>
          </div>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const result = await createTeam(name);
                if (result.ok) done(true, t("created"));
                else
                  toast.error(
                    t(
                      `errors.${result.error === "already_in_team" ? "already_in_team" : "generic"}`,
                    ),
                  );
              });
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="team-name">{t("name")}</Label>
              <Input
                id="team-name"
                value={name}
                maxLength={80}
                placeholder={t("namePlaceholder")}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" loading={pending} disabled={name.trim().length < 2}>
              {t("create")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const manager = team.role === "owner" || team.role === "admin";
  const used = team.members.length + team.invitations.length;
  const roleIcon = { owner: Crown, admin: Shield, member: Users };

  return (
    <div className="space-y-8">
      <section aria-labelledby="members-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="members-title" className="font-display text-xl font-semibold">
            {t("members")}
          </h2>
          <div className="w-48 space-y-1">
            <Progress value={(used / team.seatLimit) * 100} />
            <p className="text-right text-xs text-muted-foreground tabular-nums">
              {t("seats", { used, limit: team.seatLimit })}
            </p>
          </div>
        </div>
        <ul
          className="divide-y divide-border rounded-2xl border border-border bg-card"
          data-testid="team-members"
        >
          {team.members.map((m) => {
            const Icon = roleIcon[m.role];
            const canManage =
              manager &&
              m.userId !== team.currentUserId &&
              m.role !== "owner" &&
              (team.role === "owner" || m.role === "member");
            return (
              <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {m.name}{" "}
                    {m.userId === team.currentUserId && (
                      <span className="font-normal text-muted-foreground">({t("you")})</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                <Badge variant={m.role === "owner" ? "brand" : "muted"}>
                  <Icon aria-hidden /> {t(`roles.${m.role}`)}
                </Badge>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("memberActions", { name: m.name })}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {team.role === "owner" && (
                        <DropdownMenuItem
                          onSelect={() =>
                            start(async () =>
                              done(
                                (
                                  await changeRole(
                                    m.userId,
                                    m.role === "admin" ? "member" : "admin",
                                  )
                                ).ok,
                              ),
                            )
                          }
                        >
                          <Shield /> {m.role === "admin" ? t("makeMember") : t("makeAdmin")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        destructive
                        onSelect={() =>
                          start(async () => done((await removeMember(m.userId)).ok, t("removed")))
                        }
                      >
                        <Trash2 /> {t("remove")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
          {team.invitations.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-3 px-4 py-3"
              data-testid="team-invitation"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                <Mail className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{i.email}</p>
                <p className="text-xs text-muted-foreground">
                  {t("invitedUntil", {
                    date: format.dateTime(new Date(i.expiresAt), { dateStyle: "medium" }),
                  })}
                </p>
              </div>
              <Badge variant="warning">{t("pendingInvite")}</Badge>
              {manager && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("revoke", { email: i.email })}
                  onClick={() => start(async () => done((await revokeInvitation(i.id)).ok))}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>

        {manager && (
          <form
            className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[1fr_160px_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const result = await inviteMember({ email, role });
                if (result.ok) {
                  setEmail("");
                  toast.success(result.emailed ? t("invited") : t("invitedLink"));
                  if (!result.emailed)
                    await navigator.clipboard?.writeText(result.link).catch(() => undefined);
                  router.refresh();
                } else toast.error(t(`errors.${result.error}`));
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">{t("inviteEmail")}</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">{t("role")}</Label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "member")}
                className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm"
              >
                <option value="member">{t("roles.member")}</option>
                {team.role === "owner" && <option value="admin">{t("roles.admin")}</option>}
              </select>
            </div>
            <Button type="submit" loading={pending} disabled={used >= team.seatLimit}>
              <UserPlus /> {t("invite")}
            </Button>
          </form>
        )}
        <p className="text-sm text-muted-foreground">{t("sharingHint")}</p>
      </section>

      <section aria-labelledby="activity-title" className="space-y-3">
        <h2 id="activity-title" className="font-display text-xl font-semibold">
          {t("activity")}
        </h2>
        {team.activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
        ) : (
          <ol className="space-y-2 border-l border-border pl-4" data-testid="team-activity">
            {team.activity.map((a) => (
              <li key={a.id} className="relative text-sm">
                <span
                  className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-brand-violet"
                  aria-hidden
                />
                <span className="font-medium">{a.actor ?? "—"}</span>{" "}
                {ACTIVITY.includes(a.type as (typeof ACTIVITY)[number])
                  ? t(`events.${a.type.replace(".", "_") as ActivityKey}`)
                  : a.type}
                {a.document && <span className="text-muted-foreground"> — {a.document}</span>}
                <span className="block text-xs text-muted-foreground">
                  {format.dateTime(new Date(a.at), { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-wrap gap-2 border-t border-border pt-6">
        {team.role === "owner" ? (
          <Button variant="ghost" className="text-destructive" onClick={() => setConfirm("delete")}>
            <Trash2 /> {t("deleteTeam")}
          </Button>
        ) : (
          <Button variant="ghost" className="text-destructive" onClick={() => setConfirm("leave")}>
            <LogOut /> {t("leave")}
          </Button>
        )}
      </section>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "delete" ? t("deleteTitle") : t("leaveTitle")}</DialogTitle>
            <DialogDescription>
              {confirm === "delete" ? t("deleteBody") : t("leaveBody")}
            </DialogDescription>
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
                  const result = confirm === "delete" ? await deleteTeam() : await leaveTeam();
                  setConfirm(null);
                  done(result.ok);
                })
              }
            >
              {confirm === "delete" ? t("deleteTeam") : t("leave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
