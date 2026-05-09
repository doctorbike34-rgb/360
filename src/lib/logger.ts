import * as Sentry from "@sentry/react";

let isSentryInitialized = false;

export const initLogger = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN || "https://e6f99b5d422b6d79e6cc0f958834ca6d@o4511353479430144.ingest.de.sentry.io/4511353489981520";
  
  if (dsn) {
    Sentry.init({
      dsn: dsn,
      integrations: [
        Sentry.browserTracingIntegration(),
      ],
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      environment: import.meta.env.MODE || 'development',
      sendDefaultPii: true
    });
    isSentryInitialized = true;
    console.log("✅ Sentry initialized");
  } else {
    console.info("ℹ️ Sentry DSN not found. Errors will be logged to console only. (Set VITE_SENTRY_DSN in .env)");
  }
};

export const logger = {
  error: (error: any, context?: Record<string, any>) => {
    console.error("🔴 [Error Logger]:", error, context);
    if (isSentryInitialized) {
      Sentry.captureException(error, { extra: context });
    }
  },
  
  info: (message: string, context?: Record<string, any>) => {
    console.info("🔵 [Info Logger]:", message, context);
    if (isSentryInitialized) {
      Sentry.captureMessage(message, { level: 'info', extra: context });
    }
  },

  setUser: (user: { id: string; email?: string } | null) => {
    if (isSentryInitialized) {
      Sentry.setUser(user ? { id: user.id, email: user.email } : null);
    }
  }
};
