// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fileToBase64 } from './fileUtils';

describe('fileToBase64', () => {
  it('should reject with appropriate error message when arrayBuffer throws an error', async () => {
    // Create a dummy file
    const file = new File(['dummy content'], 'test.txt', { type: 'text/plain' });

    // Mock the arrayBuffer method to throw an error
    const errorMessage = 'Mocked arrayBuffer error';
    file.arrayBuffer = vi.fn().mockRejectedValue(new Error(errorMessage));

    // Temporarily remove window.FileReader to ensure the fallback branch is executed
    const originalFileReader = window.FileReader;
    // @ts-ignore
    delete window.FileReader;

    try {
      await expect(fileToBase64(file)).rejects.toThrowError(`Impossibile convertire: ${errorMessage}`);
    } finally {
      // Restore window.FileReader
      window.FileReader = originalFileReader;
    }
  });

  it('should successfully convert file to base64 using arrayBuffer fallback', async () => {
    // Create a dummy file
    const content = 'dummy content';
    const file = new File([content], 'test.txt', { type: 'text/plain' });

    // Temporarily remove window.FileReader to ensure the fallback branch is executed
    const originalFileReader = window.FileReader;
    // @ts-ignore
    delete window.FileReader;

    try {
      const result = await fileToBase64(file);
      const expectedBase64 = btoa(content);
      expect(result).toBe(`data:text/plain;base64,${expectedBase64}`);
    } finally {
      // Restore window.FileReader
      window.FileReader = originalFileReader;
    }
  });
});
