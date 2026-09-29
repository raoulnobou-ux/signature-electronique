"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReloadButton() {
  return (
    <Button onClick={() => window.location.reload()}>
      <RotateCw /> Réessayer · Retry
    </Button>
  );
}
