// Where to go after "Sign in with Google", which leaves the app (e.g. back to a team invite).
// An in-app path, kept in this tab only; the router takes it on return (router.js).
const KEY = 'paprcraft.afterSignIn';
export const rememberAfterSignIn = (path) => { try { sessionStorage.setItem(KEY, path); } catch { /* storage blocked */ } };
export const takeAfterSignIn = () => {
  try {
    const p = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : null;
  } catch {
    return null;
  }
};
