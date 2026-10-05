import { LegalRoute, legalMetadata } from "@/components/marketing/legal-route";
import { noticeDoc } from "@/content/legal/notice";

export async function generateMetadata() {
  return legalMetadata(noticeDoc);
}

export default function Page() {
  return <LegalRoute doc={noticeDoc} />;
}
