import { useAuth } from './AuthContext.jsx';
import AuthCurtain from './AuthCurtain.jsx';
import SignInScreen from './SignInScreen.jsx';

// The auth boundary (CLAUDE.md / DES-1). Wraps the whole app: while persisted
// auth state resolves it renders the AuthCurtain (so neither screen can flash),
// signed out it renders only the SignInScreen — children, and therefore every
// user-visible view and every data request, are simply never mounted — and
// signed in it renders children (the shell). Only this component tree and
// auth.js know Firebase exists.
export default function AuthGate({ children }) {
  const { user, initializing } = useAuth();

  if (initializing) {
    return <AuthCurtain />;
  }

  if (!user) {
    return <SignInScreen />;
  }

  return children;
}
