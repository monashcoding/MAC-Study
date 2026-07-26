"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

const AppHeaderDetailContext = createContext<
  ((scope: string, detail: string | null) => void) | null
>(null);

export function AppHeaderDetailProvider({
  children,
  onChange,
}: {
  children: ReactNode;
  onChange: (scope: string, detail: string | null) => void;
}) {
  return (
    <AppHeaderDetailContext.Provider value={onChange}>
      {children}
    </AppHeaderDetailContext.Provider>
  );
}

export function useAppHeaderDetail(scope: string, detail: string | null) {
  const onChange = useContext(AppHeaderDetailContext);

  useEffect(() => {
    onChange?.(scope, detail);

    return () => onChange?.(scope, null);
  }, [detail, onChange, scope]);
}
