import { NextResponse } from "next/server";
import { describeDevice } from "@/lib/requests/device";
import { createClient } from "@/lib/supabase/server";

const csvCell = (value: unknown) => {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  // Neutralise les formules des tableurs (injection CSV) et échappe les guillemets.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Journal d'audit d'une demande (propriétaire uniquement, via la RLS), au format CSV. */
export async function GET(_request: Request, ctx: RouteContext<"/api/requests/[id]/audit">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: request } = await supabase.from("signature_requests").select("id, title").eq("id", id).maybeSingle();
  if (!request) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: events } = await supabase
    .from("audit_events")
    .select("created_at, event_type, actor_type, actor_label, ip, user_agent, metadata")
    .eq("request_id", id)
    .order("created_at");

  const header = ["date_utc", "evenement", "type_acteur", "acteur", "adresse_ip", "appareil", "details"];
  const rows = (events ?? []).map((e) =>
    [e.created_at, e.event_type, e.actor_type, e.actor_label, e.ip, e.user_agent ? describeDevice(e.user_agent) : "", e.metadata]
      .map(csvCell)
      .join(","),
  );
  const csv = "﻿" + [header.join(","), ...rows].join("\r\n");
  const name = `journal-${(request.title ?? "demande").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
