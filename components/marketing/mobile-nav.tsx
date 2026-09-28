"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type MobileNavProps = {
  links: { href: string; label: string }[];
  signedIn: boolean;
  labels: { open: string; signIn: string; startTrial: string; goToApp: string };
};

export function MobileNav({ links, signedIn, labels }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label={labels.open}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="max-w-sm">
        <div className="border-b p-5">
          <SheetTitle asChild>
            <div>
              <Logo />
            </div>
          </SheetTitle>
        </div>
        <nav aria-label="Navigation mobile" className="flex flex-col gap-1 p-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              className="rounded-xl px-4 py-3.5 text-base font-medium transition-colors hover:bg-secondary"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {signedIn ? (
            <Button asChild size="lg" onClick={close}>
              <Link href="/app">{labels.goToApp}</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg" onClick={close}>
                <Link href="/inscription">{labels.startTrial}</Link>
              </Button>
              <Button asChild size="lg" variant="secondary" onClick={close}>
                <Link href="/connexion">{labels.signIn}</Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
