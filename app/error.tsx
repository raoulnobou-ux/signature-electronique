"use client";

import { ErrorView } from "@/components/errors/error-view";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorView digest={error.digest} retry={retry} />;
}
