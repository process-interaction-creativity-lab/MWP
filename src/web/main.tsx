import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/kit.css';
import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-gapcursor/style/gapcursor.css';
import './defaults.css';
import './style.css';
import { App } from './app.js';
import { modulesLoaded } from './host.js';
import { startModuleStyles } from './module-styles.js';

// Modules load before the first pane, so remembered placements apply.
// index.html shows "Loading…" until then.
const listFailed = await modulesLoaded.then(
  () => null,
  (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
);
startModuleStyles();
// No pinch zoom from a trackpad: Chrome, Edge and Firefox send it as a wheel
// event with Ctrl held (so Ctrl and a mouse wheel go too), Safari as gesture
// events. The keyboard's zoom (Mod-+, Mod--) is untouched, and modules still
// get these events for zooming their own canvases.
window.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) window.addEventListener(type, (e) => e.preventDefault());

// The app can't go on: say why, with a way back, not a blank page.
function Stopped({ message }: { message: string }) {
  return (
    <div className="mwps-crashed" role="alert">
      <p>{message}</p>
      <button type="button" onClick={() => location.reload()}>
        Reload
      </button>
    </div>
  );
}

// A throw in the host's own UI (modules have their own boundaries) would
// otherwise unmount everything.
class HostBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <Stopped message={`The app hit an error and stopped drawing: ${error.message}`} />;
  }
}

createRoot(document.getElementById('root')!).render(
  listFailed ? (
    <Stopped message={`The app couldn't load its modules: ${listFailed.message}`} />
  ) : (
    <HostBoundary>
      <App />
    </HostBoundary>
  ),
);
