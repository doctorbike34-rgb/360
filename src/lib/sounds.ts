
export type SoundType = 
  | 'MESSAGE_CYCLIST'
  | 'MESSAGE_MECHANIC'
  | 'INTERVENTION_MECHANIC'
  | 'INTERVENTION_PEER'
  | 'SOS_ALERT' // Fallback for any other things
  | 'MESSAGE';  // Fallback for any other things

class SoundService {
  private audioCtx: AudioContext | null = null;
  private audioCache: Record<string, HTMLAudioElement> = {};

  private initCtx() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  play(type: SoundType) {
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      const now = ctx.currentTime;
      
      switch(type) {
        case 'MESSAGE':
        case 'MESSAGE_CYCLIST':
          // A bright, friendly double beep
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(800, now);
          oscillator.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
          gainNode.gain.setValueAtTime(0, now);
          gainNode.gain.linearRampToValueAtTime(0.5, now + 0.05);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          oscillator.start(now);
          oscillator.stop(now + 0.2);
          
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1200, now + 0.15);
          osc2.frequency.exponentialRampToValueAtTime(1600, now + 0.25);
          gain2.gain.setValueAtTime(0, now + 0.15);
          gain2.gain.linearRampToValueAtTime(0.5, now + 0.2);
          gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
          osc2.start(now + 0.15);
          osc2.stop(now + 0.35);
          break;
          
        case 'MESSAGE_MECHANIC':
          // A lower, more "working" pop
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(600, now);
          oscillator.frequency.exponentialRampToValueAtTime(400, now + 0.15);
          gainNode.gain.setValueAtTime(0, now);
          gainNode.gain.linearRampToValueAtTime(0.6, now + 0.02);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          oscillator.start(now);
          oscillator.stop(now + 0.15);
          break;
          
        case 'SOS_ALERT':
        case 'INTERVENTION_MECHANIC':
          // Urgent pulsing alert for professionals
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(800, now);
          oscillator.frequency.setValueAtTime(1200, now + 0.2);
          oscillator.frequency.setValueAtTime(800, now + 0.4);
          
          gainNode.gain.setValueAtTime(0, now);
          gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
          gainNode.gain.setValueAtTime(0.3, now + 0.15);
          gainNode.gain.linearRampToValueAtTime(0.01, now + 0.2);
          
          gainNode.gain.setValueAtTime(0, now + 0.2);
          gainNode.gain.linearRampToValueAtTime(0.3, now + 0.25);
          gainNode.gain.setValueAtTime(0.3, now + 0.35);
          gainNode.gain.linearRampToValueAtTime(0.01, now + 0.4);
          
          oscillator.start(now);
          oscillator.stop(now + 0.4);
          break;
          
        case 'INTERVENTION_PEER':
          // Slightly different, softer alert for peers
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(500, now);
          gainNode.gain.setValueAtTime(0, now);
          gainNode.gain.linearRampToValueAtTime(0.2, now + 0.1);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
          oscillator.start(now);
          oscillator.stop(now + 0.4);
          
          const pOsc2 = ctx.createOscillator();
          const pGain2 = ctx.createGain();
          pOsc2.connect(pGain2);
          pGain2.connect(ctx.destination);
          
          pOsc2.type = 'square';
          pOsc2.frequency.setValueAtTime(750, now + 0.2);
          pGain2.gain.setValueAtTime(0, now + 0.2);
          pGain2.gain.linearRampToValueAtTime(0.2, now + 0.3);
          pGain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
          pOsc2.start(now + 0.2);
          pOsc2.stop(now + 0.6);
          break;
      }
    } catch (e) {
      console.warn('Sound service error:', e);
    }
  }
}

export const soundService = new SoundService();
