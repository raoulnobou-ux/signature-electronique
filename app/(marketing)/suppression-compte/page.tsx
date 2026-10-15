import { LegalRoute, legalMetadata } from "@/components/marketing/legal-route";
import { deletionDoc } from "@/content/legal/deletion";

export async function generateMetadata() {
  return legalMetadata(deletionDoc);
}

export default function Page() {
  return <LegalRoute doc={deletionDoc} />;
}
