"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

const AppHeaderDetailContext = createContext<
  ((detail: string | null) => void) | null
>(null);

export function AppHeaderDetailProvider({
  children,
  onChange,
}: {
  children: ReactNode;
  onChange: (detail: string | null) => void;
}) {
  return (
    <AppHeaderDetailContext.Provider value={onChange}>
      {children}
    </AppHeaderDetailContext.Provider>
  );
}

export function useAppHeaderDetail(detail: string | null) {
  const onChange = useContext(AppHeaderDetailContext);

  useEffect(() => {
    onChange?.(detail);

    return () => onChange?.(null);
  }, [detail, onChange]);
}
