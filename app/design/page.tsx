import type { Metadata } from "next";
import { DesignSystemShowcase } from "./showcase";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  return <DesignSystemShowcase />;
}
