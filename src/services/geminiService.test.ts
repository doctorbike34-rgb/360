import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isBikeIssueDescription, askBikeDoctor, analyzeBikeIssue } from './geminiService';

const mockCallable = vi.fn();

vi.mock('../lib/firebase', () => ({
  functions: {},
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockCallable,
}));

describe('geminiService', () => {
  beforeEach(() => {
    mockCallable.mockReset();
  });

  describe('isBikeIssueDescription', () => {
    it('rejects short greetings', () => {
      expect(isBikeIssueDescription('ciao')).toBe(false);
    });

    it('accepts bike fault descriptions', () => {
      expect(isBikeIssueDescription('La catena salta in salita da ieri sera')).toBe(true);
    });
  });

  describe('askBikeDoctor', () => {
    it('calls cloud function and returns text', async () => {
      mockCallable.mockResolvedValue({ data: { text: 'Risposta AI' } });
      const text = await askBikeDoctor('foratura posteriore', 'CYCLIST');
      expect(text).toBe('Risposta AI');
    });

    it('returns fallback on error', async () => {
      mockCallable.mockRejectedValue(new Error('network'));
      const text = await askBikeDoctor('test', 'CYCLIST');
      expect(text).toContain('non riesco');
    });
  });

  describe('analyzeBikeIssue', () => {
    it('returns null for non-bike text without calling API', async () => {
      const result = await analyzeBikeIssue('ciao');
      expect(result).toBeNull();
      expect(mockCallable).not.toHaveBeenCalled();
    });

    it('returns diagnosis from cloud function', async () => {
      mockCallable.mockResolvedValue({ data: { diagnosis: '**Possibili cause:**\n- X' } });
      const result = await analyzeBikeIssue('I freni non frenano più in discesa');
      expect(result).toContain('Possibili cause');
    });
  });
});
