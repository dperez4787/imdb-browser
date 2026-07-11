import TopBar from './TopBar.jsx';

// The chrome every signed-in view mounts inside (DES-1): sticky TopBar over
// the routed content area. The chat panel (DES-7) gets its mount point here
// with IMDB-11.
export default function AppShell({ children }) {
  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-shell__main">{children}</main>
    </div>
  );
}
