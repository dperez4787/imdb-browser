import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import { createQueryClient } from './graphql/index.js';
import './styles.css';

// One QueryClient for the app's lifetime; its caching policy (staleTimes,
// refetchOnWindowFocus off) lives in src/graphql/ with the rest of the
// client layer (IMDB-4). BrowserRouter per docs/architecture.md ("Frontend
// routing & URL scheme"): library mode, URL query params as the single source
// of truth for search state. Deep links work because Hosting rewrites
// everything to index.html.
const queryClient = createQueryClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
