// Génère, signe et compile l'application Android QuickSign (Trusted Web Activity) avec
// Bubblewrap (@bubblewrap/core), sans aucune question interactive.
//
//   node build-twa.mjs init    → crée le projet Android et la clé d'envoi (une seule fois)
//   node build-twa.mjs build   → compile le paquet .aab signé (et un .apk de test)
//
// La clé d'envoi (upload key) et ses mots de passe sont écrits dans C:\dev\quicksign-android\
// signing\ : à sauvegarder hors de ce PC. Ils ne vont jamais dans un dépôt Git.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AndroidSdkTools,
  Config,
  ConsoleLog,
  JarSigner,
  JdkHelper,
  KeyTool,
  TwaGenerator,
  TwaManifest,
} from "@bubblewrap/core";

const TOOLCHAIN = "C:\\dev\\android-toolchain";
const PROJECT = "C:\\dev\\quicksign-android";
const SIGNING = join(PROJECT, "signing");
const KEYSTORE = join(SIGNING, "quicksign-upload.keystore");
const SECRETS = join(SIGNING, "MOTS-DE-PASSE-A-SAUVEGARDER.json");
const HOST = "quicksign-six.vercel.app";
const PACKAGE_ID = "com.raoulnobou.quicksign";
const ALIAS = "quicksign";

const log = new ConsoleLog("quicksign-android");
const jdkPath = readFileSync(join(TOOLCHAIN, "jdk-path.txt"), "utf8").trim();
const config = new Config(jdkPath, join(TOOLCHAIN, "sdk"));
const jdkHelper = new JdkHelper(process, config);
const sdk = await AndroidSdkTools.create(process, config, jdkHelper, log);

async function init() {
  if (existsSync(join(PROJECT, "twa-manifest.json"))) {
    throw new Error(`Projet déjà créé dans ${PROJECT} : utiliser « build ».`);
  }
  mkdirSync(SIGNING, { recursive: true });

  // Manifeste de l'application, construit à partir du manifeste web en production.
  const base = await TwaManifest.fromWebManifest(`https://${HOST}/manifest.webmanifest`);
  const json = base.toJson();
  const twa = new TwaManifest({
    ...json,
    packageId: PACKAGE_ID,
    host: HOST,
    name: "QuickSign",
    launcherName: "QuickSign",
    // ?source=play : repère du « mode application » (aucun achat dans l'application).
    startUrl: "/app?source=play",
    display: "standalone",
    orientation: "portrait",
    themeColor: "#F7F7F4",
    themeColorDark: "#0F1013",
    navigationColor: "#F7F7F4",
    navigationColorDark: "#0F1013",
    navigationDividerColor: "#E2E2DC",
    navigationDividerColorDark: "#27282F",
    backgroundColor: "#F7F7F4",
    enableNotifications: false,
    fallbackType: "customtabs",
    appVersionCode: 1,
    appVersionName: "1.0.0",
    signingKey: { path: KEYSTORE, alias: ALIAS },
    generatorApp: "bubblewrap-core (QuickSign)",
    // Raccourcis : ouverts eux aussi en mode application.
    shortcuts: (json.shortcuts ?? []).map((s) => ({
      ...s,
      url: s.url.includes("?") ? `${s.url}&source=play` : `${s.url}?source=play`,
    })),
  });
  await new TwaGenerator().createTwaProject(PROJECT, twa, log);
  await twa.saveToFile(join(PROJECT, "twa-manifest.json"));
  await createKey();
  log.info(`Projet créé dans ${PROJECT}`);
}

/** Clé d'envoi (upload key) : mot de passe aléatoire, écrit à côté pour sauvegarde. */
async function createKey() {
  if (existsSync(KEYSTORE)) throw new Error(`Clé déjà présente : ${KEYSTORE}`);
  mkdirSync(SIGNING, { recursive: true });
  const password = randomBytes(24).toString("base64url");
  await new KeyTool(jdkHelper, log).createSigningKey({
    path: KEYSTORE,
    alias: ALIAS,
    password,
    keypassword: password,
    fullName: "Raoul Nobou",
    organizationalUnit: "QuickSign",
    organization: "QuickSign",
    country: "CM",
  });
  writeFileSync(
    SECRETS,
    JSON.stringify(
      {
        avertissement:
          "Clé d'envoi de l'application Android QuickSign. Sauvegardez ce fichier ET quicksign-upload.keystore hors de ce PC (clé USB, coffre de mots de passe). Sans eux, il faut demander une nouvelle clé d'envoi à Google.",
        keystore: KEYSTORE,
        alias: ALIAS,
        password,
      },
      null,
      2,
    ),
  );
  log.info(`Clé d'envoi créée : ${KEYSTORE}`);
}

/** Empreinte SHA-256 de la clé d'envoi (valeur publique, pour assetlinks.json). */
async function fingerprint() {
  const { password } = JSON.parse(readFileSync(SECRETS, "utf8"));
  const { execFileSync } = await import("node:child_process");
  let out;
  try {
    out = execFileSync(
      join(jdkPath, "bin", "keytool.exe"),
      [
        "-J-Duser.language=en",
        "-list",
        "-v",
        "-keystore",
        KEYSTORE,
        "-alias",
        ALIAS,
        "-storepass",
        password,
      ],
      { encoding: "utf8" },
    );
  } catch (error) {
    // L'erreur contient la ligne de commande (donc le mot de passe) : jamais affichée.
    throw new Error(`keytool a échoué (code ${error?.status ?? "?"})`);
  }
  const sha = out.match(/SHA256:\s*([0-9A-F:]{95})/)?.[1];
  if (!sha) throw new Error("empreinte SHA-256 introuvable");
  writeFileSync(join(SIGNING, "upload-key-sha256.txt"), sha + "\n");
  console.log(sha);
}

async function build() {
  const { password } = JSON.parse(readFileSync(SECRETS, "utf8"));
  // Gradle lancé directement (GradleWrapper de Bubblewrap passe un environnement réduit
  // où Windows ne trouve pas gradlew.bat), depuis le dossier du projet.
  const { execFileSync } = await import("node:child_process");
  const gradle = (task) =>
    execFileSync("cmd.exe", ["/c", join(PROJECT, "gradlew.bat"), task, "--no-daemon"], {
      cwd: PROJECT,
      stdio: "inherit",
      env: {
        ...process.env,
        JAVA_HOME: jdkPath,
        ANDROID_HOME: join(TOOLCHAIN, "sdk"),
        ANDROID_SDK_ROOT: join(TOOLCHAIN, "sdk"),
      },
    });
  gradle("bundleRelease");
  const unsigned = join(PROJECT, "app", "build", "outputs", "bundle", "release", "app-release.aab");
  const signed = join(PROJECT, "app-release-signed.aab");
  await new JarSigner(jdkHelper).sign(
    { path: KEYSTORE, alias: ALIAS },
    password,
    password,
    unsigned,
    signed,
  );
  log.info(`Paquet Play Store : ${signed}`);

  // APK de test, installable directement sur un téléphone.
  gradle("assembleRelease");
  const apkUnsigned = join(
    PROJECT,
    "app",
    "build",
    "outputs",
    "apk",
    "release",
    "app-release-unsigned.apk",
  );
  const apkAligned = join(PROJECT, "app-release-unsigned-aligned.apk");
  const apk = join(PROJECT, "app-release-signed.apk");
  await sdk.zipalign(apkUnsigned, apkAligned);
  await sdk.apksigner(KEYSTORE, password, ALIAS, password, apkAligned, apk);
  log.info(`APK de test : ${apk}`);
}

// Outils Java (keytool, jarsigner) introuvables sinon : PATH et JAVA_HOME pointent vers le JDK.
process.env.JAVA_HOME = jdkPath;
process.env.PATH = `${join(jdkPath, "bin")};${process.env.PATH}`;

const command = process.argv[2];
try {
  if (command === "init") await init();
  else if (command === "key") await createKey();
  else if (command === "fingerprint") await fingerprint();
  else if (command === "build") await build();
  else throw new Error("Usage : node build-twa.mjs init | key | build");
} catch (error) {
  // Jamais de mot de passe dans un message d'erreur.
  const message = String(error?.stderr || error?.message || error).replace(
    /(-(?:key|store)pass|--(?:ks|key)-pass(?:\s+pass:)?)\s+"?[^"\s]+"?/gi,
    "$1 ***",
  );
  console.error(`Échec : ${message.slice(0, 1500)}`);
  process.exit(1);
}
