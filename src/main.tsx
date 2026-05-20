import {StrictMode, Component, ErrorInfo, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import { initLogger, logger } from './lib/logger';
import { initAnalytics } from './lib/analytics';
import { useAuthStore } from './store/useAuthStore';
import { validateClientEnv } from './config/env';
import { initAppCheck } from './lib/appCheck';
import { isFirestoreQuotaError } from './lib/firestoreErrors';
import {
  cleanupStaleOAuthFlags,
  handleGoogleRedirectOnBoot,
  isFirebaseAuthReturnUrl,
  isGoogleRedirectPending,
  prepareAuthRedirectReturn,
} from './lib/googleAuth';
import { registerSW } from 'virtual:pwa-register';
import './i18n';
import App from './App';
import './index.css';
import {
  clearAppCaches,
  clearChunkReloadFlag,
  isStaleChunkLoadError,
  recoverFromStaleChunks,
} from './lib/appCache';

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const errorMsg = args.map((a) => (typeof a === 'string' ? a : (a as Error)?.message || '')).join(' ');
  if (isFirestoreQuotaError({ message: errorMsg } as Error)) {
    useAuthStore.getState().setQuotaError(true);
    return;
  }
  originalConsoleError(...args);
};

validateClientEnv();

window.addEventListener('unhandledrejection', (event) => {
  if (isStaleChunkLoadError(event.reason)) {
    event.preventDefault();
    void recoverFromStaleChunks();
  }
});

window.addEventListener('error', (event) => {
  if (isStaleChunkLoadError(event.error ?? event.message)) {
    event.preventDefault();
    void recoverFromStaleChunks();
    return;
  }
  logger.error(event.error, { message: event.message, filename: event.filename, lineno: event.lineno });
  const root = document.getElementById('root');
  if (root && root.innerHTML === '') {
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.padding = '20px';
    errorDiv.style.background = 'white';
    const h1 = document.createElement('h1');
    h1.textContent = 'Inizializzazione fallita';
    const preMessage = document.createElement('pre');
    preMessage.textContent = event.message;
    const preLocation = document.createElement('pre');
    preLocation.textContent = `${event.filename}:${event.lineno}`;
    errorDiv.appendChild(h1);
    errorDiv.appendChild(preMessage);
    errorDiv.appendChild(preLocation);
    document.body.appendChild(errorDiv);
  }
});

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error(error, { reactErrorInfo: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      const staleChunk = isStaleChunkLoadError(this.state.error);
      if (staleChunk) {
        void recoverFromStaleChunks();
        return (
          <div style={{ padding: 20, color: '#00847d', backgroundColor: 'white', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <p style={{ fontWeight: 700 }}>Aggiornamento app in corso…</p>
          </div>
        );
      }
      return (
        <div style={{ padding: 20, color: 'red', backgroundColor: 'white', height: '100vh', overflow: 'auto' }}>
          <h1 style={{fontSize: '20px', fontWeight: 'bold'}}>App crashed</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{this.state.error?.toString()}</pre>
          <button
            type="button"
            style={{ marginTop: 16, padding: '12px 20px', background: '#00847d', color: 'white', borderRadius: 12, fontWeight: 700 }}
            onClick={() => void clearAppCaches().then(() => window.location.reload())}
          >
            Ricarica app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

async function bootstrap(): Promise<void> {
  cleanupStaleOAuthFlags();
  const prep = await prepareAuthRedirectReturn();
  if (prep === 'reload') return;

  if (isFirebaseAuthReturnUrl() || isGoogleRedirectPending()) {
    await handleGoogleRedirectOnBoot();
  }

  void initAppCheck();

  if (!isFirebaseAuthReturnUrl()) {
    // When the new SW takes control (skipWaiting), reload the tab
    // so stale JS chunks in memory are replaced immediately.
    let swReloading = false;
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      if (swReloading) return;
      swReloading = true;
      window.location.reload();
    });

    registerSW({
      immediate: true,
      onNeedRefresh() {
        void clearAppCaches().then(() => window.location.reload());
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        // Poll for updates every 5 min so deploys propagate fast
        const checkForUpdate = () => registration.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
        window.addEventListener('focus', checkForUpdate);
        window.setInterval(checkForUpdate, 5 * 60 * 1000);
      },
    });
  }

  initLogger();
  initAnalytics();
  clearChunkReloadFlag();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
