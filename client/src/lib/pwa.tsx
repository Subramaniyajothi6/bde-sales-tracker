import { useEffect, useState } from 'react';

/**
 * "Install as an app" support. The browser offers installation through the beforeinstallprompt event;
 * it is caught at start-up (see main.tsx) so the Install button can use it later.
 * Installing needs HTTPS on a real domain (or localhost). On iPhone, Safari has no prompt:
 * people use Share > Add to Home Screen, so the card explains that instead.
 */
interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

export function registerPwa() {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPrompt; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }
}

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function InstallCard() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  if (isStandalone()) return null;
  if (!deferred && !isIos()) return null;
  return (
    <section className="install" aria-label="Install the app">
      <div><b>Put this app on your phone</b>
        <span className="small muted">{deferred ? 'Opens from your home screen like any other app.' : 'In Safari tap Share, then "Add to Home Screen".'}</span>
      </div>
      {deferred && <button type="button" className="btn" onClick={async () => { await deferred?.prompt(); deferred = null; notify(); }}>Install</button>}
    </section>
  );
}
