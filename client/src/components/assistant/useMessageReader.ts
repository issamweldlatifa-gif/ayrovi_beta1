import { useEffect, useRef, useState } from 'react';
import { cleanAssistantText } from './composerPolicy';
import type { AssistantMessage } from './types';
import { VoiceOutput } from './voice/VoiceOutput';

type Reading = { id: string; text: string; state: 'starting' | 'reading' | 'error' };

/** One owned reader per conversation view; switching messages never queues audio. */
export function useMessageReader(messages: AssistantMessage[], locale: string) {
  const output = useRef<VoiceOutput | null>(null);
  const operation = useRef(0);
  const active = useRef<Reading | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const update = (value: Reading | null) => { active.current = value; setReading(value); };
  const stop = () => { operation.current++; output.current?.stop(); update(null); };

  useEffect(() => () => {
    operation.current++;
    output.current?.dispose();
    output.current = null;
    active.current = null;
  }, []);

  useEffect(() => {
    const current = active.current;
    if (current && !messages.some(message => message.id === current.id && cleanAssistantText(message.text) === current.text)) stop();
  }, [messages]);

  const toggle = (message: AssistantMessage) => {
    if (active.current?.id === message.id && active.current.state !== 'error') { stop(); return; }
    const text = cleanAssistantText(message.text);
    if (!text) return;
    const token = ++operation.current;
    if (!output.current) {
      output.current = new VoiceOutput();
      output.current.setServerTtsAvailable(false);
      output.current.configure({ rate: 1 }); // Preserve the message reader's original device rate.
    }
    update({ id: message.id, text, state: 'starting' });
    void output.current.speak(text, locale, {
      onStart: () => { if (token === operation.current) update({ id: message.id, text, state: 'reading' }); },
    }, { preserveText: true }).then(result => {
      if (token !== operation.current) return;
      update(result === 'unavailable' ? { id: message.id, text, state: 'error' } : null);
    }).catch(() => {
      if (token === operation.current) update({ id: message.id, text, state: 'error' });
    });
  };

  return { reading, toggle, stop };
}
