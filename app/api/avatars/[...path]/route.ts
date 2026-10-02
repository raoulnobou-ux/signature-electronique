import { NextResponse } from "next/server";
import { AVATAR_PATH } from "@/lib/storage/avatars";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Photo de profil (bucket privé) : visible par son propriétaire et les membres de la même
 * équipe uniquement, via une URL signée de 10 minutes. Jamais d'accès public au stockage.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/avatars/[...path]">) {
  const path = (await params).path.join("/");
  if (!AVATAR_PATH.test(path)) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const owner = path.split("/")[0]!;
  const admin = createAdminClient();
  if (owner !== user.id) {
    const { data: memberships } = await admin
      .from("team_members")
      .select("team_id, user_id")
      .in("user_id", [user.id, owner]);
    const mine = new Set(
      (memberships ?? []).filter((m) => m.user_id === user.id).map((m) => m.team_id),
    );
    const shared = (memberships ?? []).some((m) => m.user_id === owner && mine.has(m.team_id));
    if (!shared) return new NextResponse(null, { status: 404 });
  }

  const { data } = await admin.storage.from("avatars").createSignedUrl(path, 600);
  if (!data?.signedUrl) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
