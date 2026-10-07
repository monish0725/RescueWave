import React, { createContext, useContext, useMemo, useState } from 'react';

// Lets the SOS screen tell the persistent bottom-nav tab bar to disable/hide
// its SOS button while a confirmation, send, or success state is on screen —
// so a person can't accidentally raise a second SOS by tapping the tab.
interface SosUiState {
  sosTabLocked: boolean;
  setSosTabLocked: (locked: boolean) => void;
}

const SosUiContext = createContext<SosUiState | null>(null);

export function SosUiProvider({ children }: { children: React.ReactNode }) {
  const [sosTabLocked, setSosTabLocked] = useState(false);
  const value = useMemo(() => ({ sosTabLocked, setSosTabLocked }), [sosTabLocked]);
  return <SosUiContext.Provider value={value}>{children}</SosUiContext.Provider>;
}

export function useSosUi() {
  const ctx = useContext(SosUiContext);
  if (!ctx) throw new Error('useSosUi must be used within SosUiProvider');
  return ctx;
}
