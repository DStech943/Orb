import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as authService from "../services/authSupabase";

const AuthContext = createContext(null);
export const STAFF_ROLES = new Set(["admin", "agent", "pod_lead"]);
export const isStaffRole = (role) => STAFF_ROLES.has(String(role || "").toLowerCase());

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    authService
      .getSession()
      .then((session) => {
        if (active) setUser(session);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = authService.onAuthStateChange((session) => {
      if (active) setUser(session);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const value = useMemo(
    () => ({
      user,
      loading,
      // Kept as `isAdmin` for existing component APIs. All Orb staff roles
      // currently share the operational workspace; only clients are limited.
      isAdmin: isStaffRole(user?.role),
      isStaff: isStaffRole(user?.role),
      authMode: "supabase",
      login: async (details) => {
        const next = await authService.login(details);
        setUser(next);
        return next;
      },
      signup: async (details) => {
        const next = await authService.signup(details);
        setUser(next);
        return next;
      },
      loginWithGoogle: authService.loginWithGoogle,
      logout: async () => {
        await authService.logout();
        setUser(null);
      },
    }),
    [user, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
