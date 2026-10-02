/**
 * Photos de profil : bucket privé `avatars`, servi par /api/avatars/<chemin> (session
 * requise, puis URL signée de courte durée). profiles.avatar_url contient cette adresse.
 */
export const AVATAR_ROUTE = "/api/avatars/";

/** Chemin attendu : <id utilisateur>/<uuid>.<png|jpg|webp>. */
export const AVATAR_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

export function avatarUrl(path: string): string {
  return `${AVATAR_ROUTE}${path}`;
}

/** Chemin dans le bucket d'une photo stockée chez nous (adresse actuelle ou ancienne publique). */
export function avatarPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const legacy = "/storage/v1/object/public/avatars/";
  const raw = url.startsWith(AVATAR_ROUTE)
    ? url.slice(AVATAR_ROUTE.length)
    : url.includes(legacy)
      ? url.split(legacy)[1]
      : null;
  return raw && AVATAR_PATH.test(raw) ? raw : null;
}
