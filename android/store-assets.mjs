// Images de la fiche Play Store : bannière 1024×500 et captures téléphone 1080×1920 (9:16).
import { chromium } from "@playwright/test";

const OUT = "C:\\dev\\quicksign-android\\store";
const SITE = "https://quicksign-six.vercel.app";
const browser = await chromium.launch({ channel: "msedge" });

const banner = await (
  await browser.newContext({ viewport: { width: 1024, height: 500 } })
).newPage();
await banner.goto("file:///C:/dev/quicksign-android/store/feature-graphic.html");
await banner.screenshot({ path: `${OUT}\\feature-graphic-1024x500.png` });

const phone = await (
  await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    colorScheme: "light",
    locale: "fr-FR",
    isMobile: true,
    hasTouch: true,
  })
).newPage();
for (const [path, name] of [
  ["/", "01-accueil"],
  ["/securite", "02-securite"],
  ["/verify", "03-verification"],
  ["/connexion", "04-connexion"],
]) {
  await phone.goto(SITE + path, { waitUntil: "networkidle" });
  await phone.waitForTimeout(2500);
  await phone.screenshot({ path: `${OUT}\\capture-${name}-1080x1920.png` });
}
await browser.close();
console.log("ok");
