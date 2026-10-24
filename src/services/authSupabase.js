import { supabase } from "../lib/supabase";

function requireSupabase() {
  if (!supabase)
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  return supabase;
}

function fallbackName(user) {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    ""
  );
}

async function appUser(authUser) {
  if (!authUser) return null;
  const { data, error } = await requireSupabase()
    .schema("cx_copilot")
    .from("orb_profiles")
    .select("full_name, role")
    .eq("id", authUser.id)
    .maybeSingle();
  return {
    id: authUser.id,
    email: authUser.email || "",
    name: data?.full_name || fallbackName(authUser),
    role: data?.role || "client",
    provider: authUser.app_metadata?.provider || "email",
    profilePending: Boolean(error),
  };
}

export async function getSession() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return appUser(data.session?.user || null);
}

export async function login({ email, password }) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return appUser(data.user);
}

export async function signup({ name, email, password }) {
  const { data, error } = await requireSupabase().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: name.trim() } },
  });
  if (error) throw error;
  if (!data.session || !data.user)
    throw new Error(
      "Account creation completed, but no session was returned. Verify that Confirm email is disabled in Supabase Auth.",
    );
  return appUser(data.user);
}

export async function logout() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export async function loginWithGoogle() {
  const { error } = await requireSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/app` },
  });
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  const {
    data: { subscription },
  } = requireSupabase().auth.onAuthStateChange(async (_event, session) => {
    try {
      callback(await appUser(session?.user || null));
    } catch {
      callback(null);
    }
  });
  return () => subscription.unsubscribe();
}
