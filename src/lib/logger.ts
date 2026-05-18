import * as Sentry from "@sentry/react";

let isSentryInitialized = false;

export const initLogger = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  if (dsn) {
    Sentry.init({
      dsn: dsn,
      integrations: [
        Sentry.browserTracingIntegration(),
      ],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      environment: import.meta.env.MODE || 'development',
      sendDefaultPii: false
    });
    isSentryInitialized = true;
    console.log("Sentry initialized");
  } else {
    console.info("Sentry DSN not found. Set VITE_SENTRY_DSN in .env for error tracking.");
  }
};

export const logger = {
  error: (error: any, context?: Record<string, any>) => {
    console.error("[Error Logger]:", error, context);
    if (isSentryInitialized) {
      Sentry.captureException(error, { extra: context });
    }
  },
  
  info: (message: string, context?: Record<string, any>) => {
    console.info("[Info Logger]:", message, context);
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
