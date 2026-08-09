import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AmbientLevel = "full" | "static" | "off";

type AmbientContextValue = {
  level: AmbientLevel;
  setLevel: (level: AmbientLevel) => void;
};

const AmbientContext = createContext<AmbientContextValue>({
  level: "full",
  setLevel: () => undefined,
});

export function AmbientProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState<AmbientLevel>("full");
  const value = useMemo(() => ({ level, setLevel }), [level]);
  return (
    <AmbientContext.Provider value={value}>{children}</AmbientContext.Provider>
  );
}

export function useAmbientLevel(): AmbientLevel {
  return useContext(AmbientContext).level;
}

/** Call from a page/component to override the ambient background while mounted; restores "full" on unmount. */
export function useAmbientIntensity(level: AmbientLevel) {
  const { setLevel } = useContext(AmbientContext);
  useEffect(() => {
    setLevel(level);
    return () => setLevel("full");
  }, [level, setLevel]);
}
