/**
 * Application Android (Play Store) : identifiant du paquet et empreintes SHA-256 des
 * certificats autorisés à ouvrir le site en plein écran (Trusted Web Activity). Valeurs
 * publiques par nature (publiées dans /.well-known/assetlinks.json), lues dans les
 * variables ANDROID_PACKAGE_NAME et ANDROID_CERT_FINGERPRINTS (séparées par des virgules).
 */
export const DEFAULT_ANDROID_PACKAGE = "com.raoulnobou.quicksign";

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function androidAssetLinks(env: {
  ANDROID_PACKAGE_NAME?: string;
  ANDROID_CERT_FINGERPRINTS?: string;
}) {
  const packageName = env.ANDROID_PACKAGE_NAME?.trim() || DEFAULT_ANDROID_PACKAGE;
  const fingerprints = (env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => FINGERPRINT.test(f));
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName) || fingerprints.length === 0) {
    return [];
  }
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
