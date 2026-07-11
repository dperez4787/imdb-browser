import ChatPanel from './chat/ChatPanel.jsx';
import { ChatProvider } from './chat/ChatProvider.jsx';
import TopBar from './TopBar.jsx';

// The chrome every signed-in view mounts inside (DES-1): sticky TopBar over
// the routed content area. The concierge (DES-7 / IMDB-11) lives here too:
// ChatProvider holds the one session + open state, the panel docks to the
// right of the content — which REFLOWS around it, never gets covered — and
// both persist across in-app navigation because this shell never remounts.
export default function AppShell({ children }) {
  return (
    <ChatProvider>
      <div className="app-shell">
        <TopBar />
        <div className="app-shell__body">
          <main className="app-shell__main">{children}</main>
          <ChatPanel />
        </div>
      </div>
    </ChatProvider>
  );
}
