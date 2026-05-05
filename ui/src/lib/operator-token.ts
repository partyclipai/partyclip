import { useEffect, useState } from "react";

const STORAGE_KEY = "partyclip.operator.token";
const SCOPE_KEY = "partyclip.operator.tokenScope";

type Scope = "session" | "local";

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.localStorage.getItem(STORAGE_KEY) ??
    window.sessionStorage.getItem(STORAGE_KEY)
  );
}

function readScope(): Scope {
  if (typeof window === "undefined") return "session";
  return (window.localStorage.getItem(SCOPE_KEY) as Scope) ?? "session";
}

const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}

export function setOperatorToken(token: string, scope: Scope = "session") {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);
  if (scope === "local") window.localStorage.setItem(STORAGE_KEY, token);
  else window.sessionStorage.setItem(STORAGE_KEY, token);
  window.localStorage.setItem(SCOPE_KEY, scope);
  notify();
}

export function clearOperatorToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);
  notify();
}

export function getOperatorToken(): string | null {
  return readToken();
}

export function useOperatorToken(): {
  token: string | null;
  scope: Scope;
  setToken: (token: string, scope?: Scope) => void;
  clearToken: () => void;
} {
  const [token, setTokenState] = useState<string | null>(() => readToken());
  const [scope, setScopeState] = useState<Scope>(() => readScope());

  useEffect(() => {
    const onChange = () => {
      setTokenState(readToken());
      setScopeState(readScope());
    };
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return {
    token,
    scope,
    setToken: (t, s) => setOperatorToken(t, s),
    clearToken: () => clearOperatorToken(),
  };
}
