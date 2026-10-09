import { useEffect, useState } from 'react';

/** Registers the offline service worker on the hosted site (not in the extension or the claude.ai frame). */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const ok = location.protocol === 'https:' || location.hostname === 'localhost';
  if (!ok) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* not supported here (e.g. sandboxed frame) — the app works without it */
  });
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = () =>
  typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches);

/** Exposes Chrome's "install app" prompt so the app can offer its own Install button. */
export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return {
    canInstall: !!event && !installed,
    installed,
    install: async () => {
      if (!event) return;
      await event.prompt();
      const choice = await event.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') setInstalled(true);
      setEvent(null);
    },
  };
}
