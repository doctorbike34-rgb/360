import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/react';

// Mock Sentry
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  browserTracingIntegration: vi.fn(),
  setUser: vi.fn(),
}));

describe('logger', () => {
  let loggerModule: typeof import('./logger');

  beforeEach(async () => {
    // Reset modules to clear isSentryInitialized state before each test
    vi.resetModules();

    // Setup process.env for environment variables
    vi.stubEnv('VITE_SENTRY_DSN', 'mock-dsn');
    vi.stubEnv('MODE', 'test');

    loggerModule = await import('./logger');

    // Spy on console methods
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('uninitialized Sentry', () => {
    it('logger.error should log to console but not call Sentry.captureException', () => {
      const mockError = new Error('Test error');
      const mockContext = { userId: '123' };

      loggerModule.logger.error(mockError, mockContext);

      expect(console.error).toHaveBeenCalledWith('🔴 [Error Logger]:', mockError, mockContext);
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('logger.info should log to console but not call Sentry.captureMessage', () => {
      const mockMessage = 'Test info message';
      const mockContext = { action: 'test' };

      loggerModule.logger.info(mockMessage, mockContext);

      expect(console.info).toHaveBeenCalledWith('🔵 [Info Logger]:', mockMessage, mockContext);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
  });

  describe('initialized Sentry', () => {
    beforeEach(() => {
      // Initialize logger to set isSentryInitialized = true
      loggerModule.initLogger();
    });

    it('logger.error should log to console and call Sentry.captureException', () => {
      const mockError = new Error('Test error');
      const mockContext = { userId: '123' };

      loggerModule.logger.error(mockError, mockContext);

      expect(console.error).toHaveBeenCalledWith('🔴 [Error Logger]:', mockError, mockContext);
      expect(Sentry.captureException).toHaveBeenCalledWith(mockError, { extra: mockContext });
    });

    it('logger.info should log to console and call Sentry.captureMessage', () => {
      const mockMessage = 'Test info message';
      const mockContext = { action: 'test' };

      loggerModule.logger.info(mockMessage, mockContext);

      expect(console.info).toHaveBeenCalledWith('🔵 [Info Logger]:', mockMessage, mockContext);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(mockMessage, { level: 'info', extra: mockContext });
    });
  });
});
