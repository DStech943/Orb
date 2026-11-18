// Remembers the page someone was trying to open before they were asked to sign in,
// so a link shared in Slack still lands on the right page afterwards.
//
// Only Orb's own /app/... pages are ever accepted, so a crafted value can never send
// somebody to another site.
const KEY = "orb:return-to";

export const safeAppPath = (value) =>
  typeof value === "string" && /^\/app\/[A-Za-z0-9/_-]*$/.test(value) ? value : "";

// Needed for Google sign-in, which leaves the app and comes back to /app.
export const rememberReturnPath = (pathname) => {
  const path = safeAppPath(pathname);
  if (!path) return;
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    // Private mode or blocked storage: the person simply lands on /app.
  }
};

export const takeReturnPath = () => {
  try {
    const path = safeAppPath(window.sessionStorage.getItem(KEY));
    window.sessionStorage.removeItem(KEY);
    return path;
  } catch {
    return "";
  }
};
