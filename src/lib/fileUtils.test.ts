import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fileToBase64 } from './fileUtils';

describe('fileToBase64', () => {
  const originalFileReader = global.window ? global.window.FileReader : global.FileReader;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (global.window) {
      global.window.FileReader = originalFileReader as any;
    } else {
      global.FileReader = originalFileReader as any;
    }
  });

  it('should read file to base64 using FileReader (happy path)', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const result = await fileToBase64(file);
    expect(result).toBe('data:text/plain;base64,aGVsbG8=');
  });

  it('should reject when FileReader triggers onerror', async () => {
    // Mock FileReader to trigger onerror
    const mockFileReader = vi.fn().mockImplementation(function(this: any) {
      this.readAsDataURL = function() {
        setTimeout(() => {
          if (this.onerror) {
            this.onerror(new ProgressEvent('error'));
          }
        }, 0);
      };
      this.onloadend = null;
      this.onerror = null;
      this.result = null;
    });

    if (global.window) {
      global.window.FileReader = mockFileReader as any;
    } else {
      global.FileReader = mockFileReader as any;
    }

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await expect(fileToBase64(file)).rejects.toThrow('FileReader error');
  });

  it('should fallback to arrayBuffer when FileReader is not available', async () => {
    if (global.window) {
      // @ts-ignore
      delete global.window.FileReader;
    }
    // @ts-ignore
    delete global.FileReader;

    const file = new File(['hello fallback'], 'hello.txt', { type: 'text/plain' });
    const result = await fileToBase64(file);
    expect(result).toBe('data:text/plain;base64,aGVsbG8gZmFsbGJhY2s=');
  });

  it('should handle arrayBuffer fallback error', async () => {
    if (global.window) {
      // @ts-ignore
      delete global.window.FileReader;
    }
    // @ts-ignore
    delete global.FileReader;

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    file.arrayBuffer = vi.fn().mockRejectedValue(new Error('arrayBuffer failed'));

    await expect(fileToBase64(file)).rejects.toThrow('Impossibile convertire: arrayBuffer failed');
  });

  it('should fallback to arrayBuffer when FileReader throws synchronously', async () => {
    const mockFileReader = vi.fn().mockImplementation(function() {
      throw new Error('Sync error during instantiation');
    });

    if (global.window) {
      global.window.FileReader = mockFileReader as any;
    } else {
      global.FileReader = mockFileReader as any;
    }

    // Suppress console.warn for this test specifically
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const file = new File(['hello sync'], 'hello.txt', { type: 'text/plain' });
    const result = await fileToBase64(file);
    expect(result).toBe('data:text/plain;base64,aGVsbG8gc3luYw==');

    consoleSpy.mockRestore();
  });
});
