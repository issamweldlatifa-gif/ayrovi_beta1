import { describe, expect, it } from 'vitest';
import { RealtimeVoiceTransport } from '../client/src/components/assistant/voice/RealtimeVoiceTransport';

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
});
