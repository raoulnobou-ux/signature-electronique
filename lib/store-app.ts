/**
 * Application Android (Play Store) : le site s'y ouvre dans une Trusted Web Activity. Les
 * règles de Google Play interdisent d'y vendre l'abonnement hors Google Play Billing, ou d'y
 * inviter à payer ailleurs : prix, choix d'un plan et liens vers le paiement y sont masqués
 * (règles CSS sur [data-store="play"]). Le paiement reste sur le site web.
 *
 * Détection : l'application s'ouvre sur START_URL (?source=play) ou avec un référent
 * android-app://. Le repère est gardé dans sessionStorage, propre à l'onglet de
 * l'application : il ne s'étend jamais au navigateur Chrome du même téléphone.
 */
export const STORE_PARAM = "source=play";
export const STORE_KEY = "qs_store";

/** Script exécuté avant l'affichage (dans <head>), sans dépendance. */
export const STORE_MODE_SCRIPT = `try{var s=window.sessionStorage;if(document.referrer.indexOf("android-app://")===0||/[?&]${STORE_PARAM}(&|$)/.test(location.search))s.setItem("${STORE_KEY}","play");if(s.getItem("${STORE_KEY}")==="play")document.documentElement.dataset.store="play"}catch(e){}`;

/** Vrai dans l'application Play Store (côté navigateur uniquement). */
export function isStoreApp(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.store === "play";
}
