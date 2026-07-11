/**
 * App composition root: everything user-visible lives inside the AuthGate, so
 * signed-out users see exactly one thing — the sign-in screen. Inside the
 * gate, the route table from docs/architecture.md ("Frontend routing & URL
 * scheme"): `/` is the universal search (IMDB-5), `/search` is the reserved
 * mixed-results placeholder, and `/title/:tconst` / `/person/:nconst` are
 * placeholders until IMDB-7/IMDB-8 land. The BrowserRouter lives in main.jsx
 * so tests can mount App inside a MemoryRouter.
 */
import { Route, Routes } from 'react-router';

import AppShell from './AppShell.jsx';
import { AuthProvider } from './AuthContext.jsx';
import AuthGate from './AuthGate.jsx';
import NotFoundPage from './NotFoundPage.jsx';
import PersonPage from './people/PersonPage.jsx';
import HomePage from './search/HomePage.jsx';
import SearchPage from './search/SearchPage.jsx';
import TitlePage from './title/TitlePage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AppShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/title/:tconst" element={<TitlePage />} />
            <Route path="/person/:nconst" element={<PersonPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </AuthGate>
    </AuthProvider>
  );
}
