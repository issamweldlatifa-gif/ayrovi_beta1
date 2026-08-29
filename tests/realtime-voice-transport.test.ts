import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealtimeVoiceTransport } from '../client/src/components/assistant/voice/RealtimeVoiceTransport';

afterEach(() => vi.unstubAllGlobals());

describe('RealtimeVoiceTransport interruption safety', () => {
  it('emits a single interruption even if a listener calls interrupt again', () => {
    const transport = new RealtimeVoiceTransport('conversation_interrupt_test');
    (transport as unknown as { state: string }).state = 'assistant_speaking';
    let interruptedEvents = 0;

    transport.addEventListener((event) => {
      if (event.type !== 'interrupted') return;
      interruptedEvents += 1;
      transport.interrupt();
    });

    transport.interrupt();
    expect(interruptedEvents).toBe(1);
    expect(transport.getState()).toBe('interrupted');
    transport.disconnect();
  });

  it('turns a detected barge-in directly into user speech without the interrupted state', () => {
    vi.stubGlobal('window', {
      speechSynthesis: { cancel: vi.fn(), paused: false },
    });
    const transport = new RealtimeVoiceTransport('conversation_barge_in_test');
    (transport as unknown as { state: string }).state = 'assistant_speaking';
    const events: string[] = [];
    transport.addEventListener((event) => {
      events.push(event.type === 'state.changed' ? `state:${event.state}` : event.type);
    });

    (transport as unknown as { beginBargeIn: () => void }).beginBargeIn();

    expect(events).toContain('interrupted');
    expect(events).toContain('speech.started');
    expect(events).toContain('state:user_speaking');
    expect(events).not.toContain('state:interrupted');
    expect(transport.getState()).toBe('user_speaking');
    transport.disconnect();
  });
});
