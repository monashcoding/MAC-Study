import type { ReactNode } from "react";

export function EmptyStateCta({ action }: { action: ReactNode }) {
  return <>{action}</>;
}
