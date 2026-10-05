import { LegalRoute, legalMetadata } from "@/components/marketing/legal-route";
import { cookiesDoc } from "@/content/legal/cookies";

export async function generateMetadata() {
  return legalMetadata(cookiesDoc);
}

export default function Page() {
  return <LegalRoute doc={cookiesDoc} />;
}
