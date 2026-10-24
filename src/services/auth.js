const SESSION_KEY = "orb_mock_session";
const USERS_KEY = "orb_mock_users";
const pause = (ms = 350) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));
const safeParse = (key, fallback) => {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "") || fallback;
  } catch {
    return fallback;
  }
};
const readUsers = () => {
  const users = safeParse(USERS_KEY, []);
  return Array.isArray(users) ? users : [];
};
const writeUsers = (users) =>
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
const makeUser = ({ email, name, role = "client" }) => ({
  id: `orb_${email
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16)}`,
  email: email.trim().toLowerCase(),
  name: name?.trim() || null,
  role,
  provider: "mock",
  createdAt: new Date().toISOString(),
});

export async function getSession() {
  await pause(180);
  return safeParse(SESSION_KEY, null);
}
export async function login({ email, password }) {
  await pause();
  if (!email?.includes("@") || password?.length < 6)
    throw new Error(
      "Enter a valid email and a password of at least 6 characters.",
    );
  const normalized = email.trim().toLowerCase();
  const users = readUsers();
  let user = users.find((item) => item.email === normalized);
  if (!user) {
    user = makeUser({
      email: normalized,
      role: users.length ? "client" : "admin",
    });
    users.push(user);
    writeUsers(users);
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}
export async function signup({ name, email, password }) {
  await pause(500);
  if (!name?.trim()) throw new Error("Please enter your name.");
  if (!email?.includes("@") || password?.length < 6)
    throw new Error(
      "Enter a valid email and a password of at least 6 characters.",
    );
  const users = readUsers();
  const normalized = email.trim().toLowerCase();
  const existing = users.find((item) => item.email === normalized);
  const user = existing
    ? { ...existing, name: name.trim() }
    : makeUser({
        name,
        email: normalized,
        role: users.length ? "client" : "admin",
      });
  writeUsers(
    existing
      ? users.map((item) => (item.email === normalized ? user : item))
      : [...users, user],
  );
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}
export async function logout() {
  await pause(180);
  window.localStorage.removeItem(SESSION_KEY);
}
export async function updateUserRole(id, role) {
  await pause();
  const users = readUsers().map((user) =>
    user.id === id ? { ...user, role } : user,
  );
  writeUsers(users);
  const updated = users.find((user) => user.id === id);
  const session = safeParse(SESSION_KEY, null);
  if (session?.id === id)
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  return updated;
}
export async function loginWithGoogle() {
  throw new Error(
    "Google sign-in is available when live Supabase Auth is enabled.",
  );
}
export async function resendConfirmation() {
  throw new Error("Email confirmation is not used in mock login.");
}
