import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as authService from "../services/authSupabase";

const AuthContext = createContext(null);
export const STAFF_ROLES = new Set(["admin", "agent", "pod_lead"]);
export const isStaffRole = (role) => STAFF_ROLES.has(String(role || "").toLowerCase());

// Staff can preview the client portal to see what a client sees. This changes only what the
// UI shows; the API still decides what any request may read or change from the user's REAL
// role. The preview is remembered per user, and only for staff, so it can never carry over to
// another account or lift a client into the staff interface.
const PREVIEW_KEY = "orb:role-override";

const writePreview = (value) => {
  try {
    if (value) localStorage.setItem(PREVIEW_KEY, JSON.stringify(value));
    else localStorage.removeItem(PREVIEW_KEY);
  } catch {
    // Private mode: the preview still works for this tab.
  }
};

const readPreview = () => {
  let stored = null;
  try {
    stored = localStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
  if (stored === null) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed && parsed.role === "client" && typeof parsed.userId === "string") return parsed;
  } catch {
    // Not JSON: an older build stored a bare "admin"/"client" string.
  }
  // Anything that is not a valid client-view preview is ignored and removed.
  writePreview(null);
  return null;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(readPreview);

  const canSwitchRole = Boolean(user) && isStaffRole(user.role);
  const previewingClient = canSwitchRole && preview?.userId === user.id;

  // What the rest of the app sees: the real user, or the same user presented as a client.
  const effectiveUser = useMemo(() => {
    if (!user) return null;
    return previewingClient ? { ...user, role: "client" } : user;
  }, [user, previewingClient]);

  const switchRole = useCallback(
    (nextRole) => {
      if (!canSwitchRole) return;
      const next = nextRole === "client" ? { userId: user.id, role: "client" } : null;
      writePreview(next);
      setPreview(next);
    },
    [canSwitchRole, user?.id],
  );

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

  // Drop a stored preview that does not belong to whoever is signed in now.
  useEffect(() => {
    if (!preview || loading) return;
    if (!user || !isStaffRole(user.role) || preview.userId !== user.id) {
      writePreview(null);
      setPreview(null);
    }
  }, [preview, user, loading]);

  const login = useCallback(async (details) => {
    const next = await authService.login(details);
    setUser(next);
    return next;
  }, []);
  const signup = useCallback(async (details) => {
    const next = await authService.signup(details);
    setUser(next);
    return next;
  }, []);
  const logout = useCallback(async () => {
    await authService.logout();
    writePreview(null);
    setPreview(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user: effectiveUser,
      loading,
      // The account's real role, whatever is being previewed.
      realRole: user?.role || null,
      canSwitchRole,
      isPreviewingClient: previewingClient,
      switchRole,
      // Kept as `isAdmin` for existing component APIs. All Orb staff roles
      // currently share the operational workspace; only clients are limited.
      isAdmin: isStaffRole(effectiveUser?.role),
      isStaff: isStaffRole(effectiveUser?.role),
      authMode: "supabase",
      login,
      signup,
      loginWithGoogle: authService.loginWithGoogle,
      logout,
    }),
    [effectiveUser, user?.role, loading, canSwitchRole, previewingClient, switchRole, login, signup, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
