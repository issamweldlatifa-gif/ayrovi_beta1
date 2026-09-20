import { useLayoutEffect, useRef, useState } from 'react';
import type { AssistantAttachment } from '../types';
import { ImagePreparationError, prepareAssistantImage, type ImageErrorCode } from './prepareImage';

export function useAssistantAttachments(scope: string, onError: (code: ImageErrorCode) => void) {
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [pending, setPending] = useState(0);
  const ready = useRef<AssistantAttachment[]>([]);
  const jobs = useRef(new Map<string, AbortController>());
  const serial = useRef(0);
  const order = useRef<string[]>([]);
  const current = useRef(scope); current.current = scope;
  const mounted = useRef(true);
  const errorCallback = useRef(onError); errorCallback.current = onError;
  const cancelPending = () => {
    for (const controller of jobs.current.values()) controller.abort();
    jobs.current.clear();
    order.current = order.current.filter(id => ready.current.some(item => item.id === id));
    if (mounted.current) setPending(0);
  };
  const clear = () => { cancelPending(); ready.current = []; order.current = []; if (mounted.current) setAttachments([]); };
  useLayoutEffect(() => {
    mounted.current = true; clear();
    return () => { mounted.current = false; cancelPending(); ready.current = []; };
  }, [scope]);

  const add = async (file: File): Promise<boolean> => {
    if (!mounted.current) return false;
    // Reserve synchronously: two concurrent decodes must not both take the last slot.
    if (ready.current.length + jobs.current.size >= 2) { errorCallback.current('limit'); return false; }
    const id = `attachment_${Date.now()}_${++serial.current}`;
    const controller = new AbortController();
    const startedIn = current.current;
    order.current.push(id);
    jobs.current.set(id, controller); setPending(jobs.current.size);
    const valid = () => mounted.current && current.current === startedIn && !controller.signal.aborted && jobs.current.get(id) === controller;
    try {
      const prepared = await prepareAssistantImage(file, controller.signal);
      if (!valid()) return false;
      ready.current = [...ready.current, { id, name: file.name, ...prepared }].sort((a, b) => order.current.indexOf(a.id) - order.current.indexOf(b.id));
      setAttachments(ready.current);
      return true;
    } catch (error) {
      if (valid()) errorCallback.current(error instanceof ImagePreparationError ? error.code : 'unreadable');
      return false;
    } finally {
      if (jobs.current.get(id) === controller) {
        jobs.current.delete(id);
        if (!ready.current.some(item => item.id === id)) order.current = order.current.filter(value => value !== id);
        if (mounted.current && current.current === startedIn) setPending(jobs.current.size);
      }
    }
  };
  const remove = (id: string) => { ready.current = ready.current.filter(item => item.id !== id); order.current = order.current.filter(value => value !== id); setAttachments(ready.current); };
  return { attachments, pending, add, remove, clear, cancelPending, getReady: () => ready.current, isPending: () => jobs.current.size > 0 };
}
