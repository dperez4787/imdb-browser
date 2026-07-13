import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { signInAsGuest, signInWithGoogle, signOutUser, subscribeToAuth } from './auth.js';

// Holds the current Firebase user in React state and exposes sign-in/sign-out.
// The app's single source of auth truth: signing out (from anywhere) fires the
// auth.js subscription with null, which flows back through here and re-renders
// the AuthGate straight to the sign-in screen.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // True until Firebase resolves persisted auth state on page load. While true,
  // AuthGate shows the AuthCurtain (DES-1) so neither the sign-in screen nor
  // the shell can flash for the wrong audience.
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((nextUser) => {
      setUser(nextUser ?? null);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      signIn: signInWithGoogle,
      signInGuest: signInAsGuest,
      signOut: signOutUser,
    }),
    [user, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
