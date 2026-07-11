import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { createQueryClient } from './graphql/index.js';
import './styles.css';

// One QueryClient for the app's lifetime; its caching policy (staleTimes,
// refetchOnWindowFocus off) lives in src/graphql/ with the rest of the
// client layer (IMDB-4).
const queryClient = createQueryClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
