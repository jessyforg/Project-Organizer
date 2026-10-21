import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface FocusModeValue {
  /** Writing without distractions: the app sidebar and a note's details are hidden (ADR-0015). */
  focused: boolean;
  setFocused: (focused: boolean) => void;
}

const FocusModeContext = createContext<FocusModeValue>({
  focused: false,
  setFocused: () => undefined,
});

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [focused, setFocused] = useState(false);
  const value = useMemo(() => ({ focused, setFocused }), [focused]);
  return <FocusModeContext.Provider value={value}>{children}</FocusModeContext.Provider>;
}

export function useFocusMode(): FocusModeValue {
  return useContext(FocusModeContext);
}
