import {
  Bot,
  CreditCard,
  FileText,
  LayoutDashboard,
  LayoutTemplate,
  PenLine,
  Send,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavKey =
  | "dashboard"
  | "documents"
  | "signatures"
  | "requests"
  | "templates"
  | "team"
  | "assistant"
  | "billing"
  | "settings";

export type NavItem = { key: NavKey; href: string; icon: LucideIcon; pro?: boolean };

/** Navigation principale de l'application (libellés dans messages « app.nav »). */
export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/app", icon: LayoutDashboard },
  { key: "documents", href: "/app/documents", icon: FileText },
  { key: "signatures", href: "/app/signatures", icon: PenLine },
  { key: "requests", href: "/app/demandes", icon: Send, pro: true },
  { key: "templates", href: "/app/modeles", icon: LayoutTemplate, pro: true },
  { key: "team", href: "/app/equipe", icon: Users, pro: true },
  { key: "assistant", href: "/app/assistant", icon: Bot },
];

export const SECONDARY_NAV: NavItem[] = [
  { key: "billing", href: "/app/abonnement", icon: CreditCard },
  { key: "settings", href: "/app/parametres", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/app"
    ? pathname === "/app"
    : pathname === href || pathname.startsWith(`${href}/`);
}
