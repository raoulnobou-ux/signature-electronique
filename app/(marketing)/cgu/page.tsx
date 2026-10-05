import { LegalRoute, legalMetadata } from "@/components/marketing/legal-route";
import { termsDoc } from "@/content/legal/terms";

export async function generateMetadata() {
  return legalMetadata(termsDoc);
}

export default function Page() {
  return <LegalRoute doc={termsDoc} />;
}
