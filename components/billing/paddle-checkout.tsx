"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type PaddleEvent = { name?: string };
type PaddleGlobal = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: { token: string; eventCallback: (event: PaddleEvent) => void }) => void;
  Checkout: {
    open: (options: {
      transactionId: string;
      customer?: { email: string };
      settings?: { displayMode?: "overlay"; locale?: string };
    }) => void;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

/** Ouvre le formulaire Paddle (overlay) pour la transaction créée par le serveur. */
export function PaddleCheckout({
  token,
  sandbox,
  transactionId,
  reference,
  email,
  locale,
  nonce,
  labels,
}: {
  token: string;
  sandbox: boolean;
  transactionId: string;
  reference: string;
  email: string;
  locale: "fr" | "en";
  nonce?: string;
  labels: { opening: string; retry: string; back: string };
}) {
  const initialized = useRef(false);
  const completed = useRef(false);
  const [ready, setReady] = useState(false);

  const open = useCallback(() => {
    window.Paddle?.Checkout.open({
      transactionId,
      customer: { email },
      settings: { displayMode: "overlay", locale },
    });
  }, [transactionId, email, locale]);

  const start = useCallback(() => {
    const paddle = window.Paddle;
    if (!paddle || initialized.current) return;
    initialized.current = true;
    // Sans « _ptxn » dans l'adresse, Paddle.js n'ouvre pas une seconde fois le formulaire.
    window.history.replaceState(null, "", window.location.pathname);
    if (sandbox) paddle.Environment.set("sandbox");
    paddle.Initialize({
      token,
      eventCallback: (event) => {
        if (event.name === "checkout.completed") {
          completed.current = true;
          // Le serveur revérifie la transaction auprès de Paddle avant d'activer le plan.
          window.setTimeout(() => {
            window.location.assign(`/api/billing/return?ref=${encodeURIComponent(reference)}`);
          }, 1500);
        }
      },
    });
    setReady(true);
    open();
  }, [sandbox, token, reference, open]);

  // Script déjà chargé (navigation côté client) : onLoad n'est pas rappelé.
  useEffect(() => {
    if (window.Paddle) start();
  }, [start]);

  return (
    <>
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
        nonce={nonce}
        onLoad={start}
      />
      <Card>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground" role="status">
            {labels.opening}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={open} disabled={!ready}>
              {labels.retry}
            </Button>
            <Button asChild variant="secondary">
              <Link href="/app/abonnement">{labels.back}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
