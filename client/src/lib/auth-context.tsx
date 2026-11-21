import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

export const AUTH_EXPIRED_EVENT = "auth:expired";

const SESSION_KEYS = [
  "authToken",
  "user",
  "userType",
  "userEmail",
  "userPreferences",
] as const;

type Session = { token: string; user: any };

function clearStoredSession() {
  SESSION_KEYS.forEach((k) => localStorage.removeItem(k));
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === "number" && exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

// Read synchronously so the very first render already knows who is logged in
// (this is what stops the "logged out when I click Home" flash).
function readSession(): Session | null {
  try {
    const token = localStorage.getItem("authToken");
    const raw = localStorage.getItem("user");
    if (!token || !raw) return null;
    if (isTokenExpired(token)) {
      clearStoredSession();
      return null;
    }
    return { token, user: JSON.parse(raw) };
  } catch {
    clearStoredSession();
    return null;
  }
}

export function dashboardFor(user: any): string {
  return user?.userType === "owner" ? "/dashboard/owner" : "/dashboard/user";
}

// Where to go after login: the page they were trying to reach, else their dashboard.
export function postLoginPath(user: any): string {
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  if (
    redirect &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//") &&
    !/^\/(login|login-otp|signup)(\/|\?|$)/.test(redirect)
  ) {
    return redirect;
  }
  return dashboardFor(user);
}

type AuthContextValue = {
  user: any | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (token: string, user: any) => void;
  logout: () => void;
  updateUser: (patch: Record<string, any>) => void;
  /** Save lifestyle preferences (quiz answers etc.) to the account, not just this browser. */
  savePreferences: (prefs: Record<string, any>) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession);
  const [, setLocation] = useLocation();

  const login = useCallback((token: string, user: any) => {
    localStorage.setItem("authToken", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("userType", user?.userType || "user");
    localStorage.setItem("userEmail", user?.email || "");
    queryClient.clear();
    setSession({ token, user });
  }, []);

  const logout = useCallback(() => {
    clearStoredSession();
    queryClient.clear();
    setSession(null);
  }, []);

  const updateUser = useCallback((patch: Record<string, any>) => {
    const current = readSession();
    if (!current) return;
    const user = { ...current.user, ...patch };
    localStorage.setItem("user", JSON.stringify(user));
    setSession({ token: current.token, user });
  }, []);

  // Load the saved profile from the server so settings/preferences follow the
  // account across devices and logins (localStorage alone is per-browser).
  const token = session?.token;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
          return;
        }
        if (!res.ok) return;
        const fresh = await res.json();
        if (cancelled) return;
        const current = readSession();
        if (!current || current.token !== token) return;
        const user = { ...current.user, ...fresh };
        localStorage.setItem("user", JSON.stringify(user));
        const prefs = user.preferences;
        if (prefs && typeof prefs === "object" && Object.keys(prefs).length > 0) {
          // The dashboards/quiz read the lifestyle answers from this key
          const { notifications: _n, ...lifestyle } = prefs;
          if (Object.keys(lifestyle).length > 0) {
            localStorage.setItem("userPreferences", JSON.stringify(lifestyle));
          }
        }
        setSession({ token, user });
      } catch {
        // offline: keep the cached profile
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const savePreferences = useCallback(async (prefs: Record<string, any>) => {
    const { notifications: _n, ...lifestyle } = prefs;
    if (Object.keys(lifestyle).length > 0) {
      localStorage.setItem("userPreferences", JSON.stringify(lifestyle));
    }
    const current = readSession();
    if (!current?.user?.id) return;
    const merged = { ...(current.user.preferences || {}), ...prefs };
    const res = await fetch(`/api/users/${current.user.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${current.token}`,
      },
      body: JSON.stringify({ preferences: merged }),
    });
    if (!res.ok) throw new Error("Could not save preferences to your account");
    const saved = await res.json();
    const user = { ...current.user, ...saved };
    localStorage.setItem("user", JSON.stringify(user));
    setSession({ token: current.token, user });
  }, []);

  // Keep other tabs in sync (login/logout in one tab updates the rest).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "authToken" || e.key === "user") {
        setSession(readSession());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // The API said our token is invalid/expired: end the session cleanly.
  useEffect(() => {
    const onExpired = () => {
      if (!readSession()) return;
      logout();
      toast({
        title: "Session expired",
        description: "Please log in again.",
        variant: "destructive",
      });
      setLocation("/login");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [logout, setLocation]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      isAuthenticated: !!session,
      loading: false,
      login,
      logout,
      updateUser,
      savePreferences,
    }),
    [session, login, logout, updateUser, savePreferences],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
