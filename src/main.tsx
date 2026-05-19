import {StrictMode, Component, ErrorInfo, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import { initLogger, logger } from './lib/logger';
import { initAnalytics } from './lib/analytics';
import { useAuthStore } from './store/useAuthStore';
import { validateClientEnv } from './config/env';

// Suppress noisy Firebase quota errors
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const errorMsg = args.map(a => (typeof a === 'string' ? a : (a?.message || ''))).join(' ');
  if (errorMsg.includes('Quota') || errorMsg.includes('resource-exhausted') || errorMsg.includes('quota limit')) {
    useAuthStore.getState().setQuotaError(true);
    return; // Completely suppress from console
  }
  originalConsoleError(...args);
};

validateClientEnv();

// Initialize tracking and error monitoring
initLogger();
initAnalytics();


// Global error catcher for module loading
window.addEventListener('error', (event) => {
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

import './i18n';
import App from './App';
import './index.css';

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
      return (
        <div style={{ padding: 20, color: 'red', backgroundColor: 'white', height: '100vh', overflow: 'auto' }}>
          <h1 style={{fontSize: '20px', fontWeight: 'bold'}}>App crashed</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{this.state.error?.toString()}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', marginTop: '10px' }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

