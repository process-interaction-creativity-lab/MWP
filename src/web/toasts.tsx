import { useSyncExternalStore } from 'react';
import { toasts } from './host.js';

export function Toasts() {
  const list = useSyncExternalStore(toasts.subscribe, toasts.get);
  return (
    <div className="mwps-toasts" role="status">
      {list.map((t) => (
        <div key={t.id} className="mwps-toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
