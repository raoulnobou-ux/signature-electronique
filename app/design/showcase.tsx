"use client";

import {
  Bell,
  FilePlus2,
  FileSignature,
  FileText,
  Inbox,
  Moon,
  PenLine,
  Send,
  Settings,
  Sparkles,
  Stamp,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AmbientBackground } from "@/components/brand/ambient-background";
import { Logo, LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";

const colors = [
  { name: "Fond", token: "bg-background", border: true },
  { name: "Élevé", token: "bg-background-elevated", border: true },
  { name: "Carte (verre)", token: "glass" },
  { name: "Indigo", token: "bg-brand-indigo" },
  { name: "Violet", token: "bg-brand-violet" },
  { name: "Cyan", token: "bg-brand-cyan" },
  { name: "Dégradé", token: "bg-brand-gradient" },
  { name: "Succès", token: "bg-success" },
  { name: "Alerte", token: "bg-warning" },
  { name: "Danger", token: "bg-destructive" },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function DesignSystemShowcase() {
  const [step, setStep] = useState(1);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative isolate min-h-dvh">
      <AmbientBackground grid intensity="subtle" />

      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:inline-flex"
            >
              Rechercher <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-16 px-4 py-12 sm:px-6">
        <div className="space-y-4">
          <Badge variant="brand">
            <Sparkles /> Design system
          </Badge>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-6xl">
            L&apos;identité de <span className="text-gradient">QuickSign</span>
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Sombre profond, dégradé électrique indigo → violet → cyan, verre dépoli et lueurs
            douces. Chaque composant existe en thème sombre et clair, au doigt comme à la souris.
          </p>
        </div>

        <Section
          title="Couleurs"
          description="Tokens définis dans app/globals.css, redéfinis pour le thème clair."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {colors.map((c) => (
              <div key={c.name} className="space-y-2">
                <div
                  className={`h-20 rounded-2xl ${c.token} ${c.border ? "border border-border" : ""}`}
                />
                <div className="text-sm font-medium">{c.name}</div>
                <code className="text-xs text-muted-foreground">{c.token}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Typographie"
          description="Space Grotesk pour les titres, Inter pour le texte."
        >
          <Card>
            <CardContent className="space-y-4">
              <p className="font-display text-5xl font-semibold tracking-tight">
                Signez en 30 secondes.
              </p>
              <p className="font-display text-3xl font-semibold">Titre de section</p>
              <p className="font-display text-xl font-semibold">Titre de carte</p>
              <p className="max-w-prose">
                Texte courant : QuickSign permet d&apos;ouvrir un document Word ou PDF, d&apos;y
                apposer sa signature et le cachet de sa structure, puis d&apos;obtenir un PDF signé
                et horodaté.
              </p>
              <p className="text-sm text-muted-foreground">Texte secondaire, légendes et aides.</p>
            </CardContent>
          </Card>
        </Section>

        <Section title="Logo">
          <div className="flex flex-wrap items-center gap-8">
            <Logo />
            <LogoMark className="size-14" />
            <LogoMark className="size-10" />
          </div>
        </Section>

        <Section title="Boutons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>
              <FileSignature /> Signer un document
            </Button>
            <Button variant="secondary">
              <Send /> Faire signer
            </Button>
            <Button variant="outline">
              <Upload /> Importer
            </Button>
            <Button variant="ghost">Annuler</Button>
            <Button variant="destructive">
              <Trash2 /> Supprimer
            </Button>
            <Button variant="link">En savoir plus</Button>
            <Button loading>Envoi</Button>
            <Button disabled>Désactivé</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg">Essayer gratuitement 6 jours</Button>
            <Button size="sm" variant="secondary">
              Petit
            </Button>
            <Tooltip label="Paramètres">
              <Button size="icon" variant="outline" aria-label="Paramètres">
                <Settings />
              </Button>
            </Tooltip>
          </div>
        </Section>

        <Section title="Badges de statut">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="draft" />
            <StatusBadge status="pending" />
            <StatusBadge status="sent" />
            <StatusBadge status="opened" />
            <StatusBadge status="signed" />
            <StatusBadge status="declined" />
            <StatusBadge status="expired" />
            <Badge variant="brand">Pro</Badge>
            <Badge variant="outline">Essentiel</Badge>
          </div>
        </Section>

        <Section title="Cartes">
          <div className="grid gap-4 md:grid-cols-3">
            <Card interactive>
              <CardHeader>
                <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-accent">
                  <PenLine className="size-5 text-accent-foreground" />
                </div>
                <CardTitle>Dessinez</CardTitle>
                <CardDescription>Au doigt ou à la souris, avec un trait fluide.</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
            <Card interactive>
              <CardHeader>
                <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-accent">
                  <Stamp className="size-5 text-accent-foreground" />
                </div>
                <CardTitle>Tamponnez</CardTitle>
                <CardDescription>Le cachet de votre structure, net et transparent.</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
            <Card className="gradient-border glow">
              <CardHeader>
                <CardTitle>Plan Pro</CardTitle>
                <CardDescription>Carte mise en avant (bordure dégradée + lueur).</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-display text-3xl font-semibold">
                  15 000 <span className="text-base text-muted-foreground">FCFA / mois</span>
                </p>
              </CardContent>
              <CardFooter>
                <Button className="w-full">Choisir Pro</Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        <Section title="Formulaires">
          <Card>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ds-name">Nom complet</Label>
                <Input id="ds-name" placeholder="Awa Nkeng" autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ds-email">Adresse e-mail</Label>
                <Input id="ds-email" type="email" placeholder="awa@cabinet.cm" aria-invalid />
                <p className="text-xs text-destructive">Cette adresse ne semble pas valide.</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ds-msg">Message</Label>
                <Textarea id="ds-msg" placeholder="Merci de signer ce contrat avant vendredi." />
              </div>
              <div className="flex items-center gap-3">
                <Checkbox id="ds-cgu" defaultChecked />
                <Label htmlFor="ds-cgu">J&apos;accepte les conditions</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="ds-notif" defaultChecked />
                <Label htmlFor="ds-notif">Notifications par e-mail</Label>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="Onglets, progression, étapes">
          <Card>
            <CardContent className="space-y-8">
              <Tabs defaultValue="draw">
                <TabsList>
                  <TabsTrigger value="draw">
                    <PenLine /> Dessiner
                  </TabsTrigger>
                  <TabsTrigger value="type">Taper</TabsTrigger>
                  <TabsTrigger value="upload">Importer</TabsTrigger>
                </TabsList>
                <TabsContent value="draw" className="text-sm text-muted-foreground">
                  Zone de dessin de la signature.
                </TabsContent>
                <TabsContent value="type" className="text-sm text-muted-foreground">
                  Aperçu dans six polices manuscrites.
                </TabsContent>
                <TabsContent value="upload" className="text-sm text-muted-foreground">
                  Import d&apos;une photo avec détourage automatique.
                </TabsContent>
              </Tabs>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Essai gratuit</span>
                  <span className="text-muted-foreground">4 jours restants</span>
                </div>
                <Progress value={(2 / 6) * 100} />
              </div>
              <div className="space-y-4">
                <Stepper steps={["Compte", "Profil", "C'est parti"]} current={step} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                  >
                    Précédent
                  </Button>
                  <Button size="sm" onClick={() => setStep((s) => Math.min(2, s + 1))}>
                    Suivant
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section
          title="Superpositions"
          description="Modale (feuille en bas sur mobile), tiroir, menu, toasts, palette."
        >
          <div className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Ouvrir une modale</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Finaliser et signer ?</DialogTitle>
                  <DialogDescription>
                    Une nouvelle version signée sera créée. L&apos;original reste intact.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">Annuler</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>Signer</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary">
                  <Sparkles /> Ouvrir l&apos;assistant
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>QuickSign Copilot</SheetTitle>
                  <SheetDescription>Votre assistant, disponible partout.</SheetDescription>
                </SheetHeader>
                <div className="p-5 text-sm text-muted-foreground">
                  Bonjour Awa, comment puis-je vous aider ?
                </div>
              </SheetContent>
            </Sheet>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">Menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Document</DropdownMenuLabel>
                <DropdownMenuItem>
                  <FileText /> Ouvrir
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Send /> Faire signer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive>
                  <Trash2 /> Mettre à la corbeille
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="secondary"
              onClick={() =>
                toast.success("Document signé", { description: "Contrat de prestation.pdf" })
              }
            >
              <Bell /> Toast
            </Button>
            <Button variant="secondary" onClick={() => setPaletteOpen(true)}>
              Palette de commandes
            </Button>
          </div>

          <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
            <CommandInput placeholder="Rechercher une action, un document…" />
            <CommandList>
              <CommandEmpty>Aucun résultat.</CommandEmpty>
              <CommandGroup heading="Actions">
                <CommandItem onSelect={() => setPaletteOpen(false)}>
                  <FileSignature /> Signer un document
                </CommandItem>
                <CommandItem onSelect={() => setPaletteOpen(false)}>
                  <FilePlus2 /> Importer un document
                </CommandItem>
                <CommandItem onSelect={() => setPaletteOpen(false)}>
                  <Sparkles /> Demander à l&apos;assistant
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Préférences">
                <CommandItem onSelect={() => setPaletteOpen(false)}>
                  <Moon /> Changer de thème
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </CommandDialog>
        </Section>

        <Section title="Avatars et chargement">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name="Awa Nkeng" size="lg" />
            <Avatar name="Jean-Paul Fotso" />
            <Avatar name="Cabinet Ndzi" size="sm" />
          </div>
          <Card>
            <CardContent className="flex items-center gap-4">
              <Skeleton className="size-14 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="État vide">
          <EmptyState
            icon={Inbox}
            title="Aucun document pour l'instant"
            description="Importez un PDF ou un Word pour le signer en quelques secondes."
            action={
              <Button>
                <Upload /> Importer un document
              </Button>
            }
          />
        </Section>
      </main>
    </div>
  );
}
