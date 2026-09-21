import { useEffect, useRef, useState } from 'react';
import { customerApi } from '../../customer/api';
import type { CustomerFavorite, CustomerSession } from '../../types';
import type { AyrovixCandidate } from '../types';

/** Uses the current account and CSRF token; never rotates auth/me or invents a saved state. */
export function useLensFavorites(session?: CustomerSession | null, onOpenAccount?: () => void) {
  const [items, setItems] = useState<CustomerFavorite[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<'auth' | 'load' | 'save' | null>(null);
  const owner = useRef<string | null>(null);
  const loaded = useRef<CustomerFavorite[] | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const request = useRef<AbortController | null>(null);
  const accountId = session?.account.id, csrfToken = session?.csrfToken;
  useEffect(() => {
    const epoch = ++generation.current;
    owner.current = accountId || null;
    request.current?.abort(); loaded.current = null; locked.current = false;
    setItems([]); setMessage(null); setBusy(false);
    if (!accountId) return;
    const controller = new AbortController(); request.current = controller;
    locked.current = true; setBusy(true);
    customerApi<{data:CustomerFavorite[]}>('/api/customer/account/favorites', {signal:controller.signal})
      .then(result => { if (epoch === generation.current) { loaded.current = result.data; setItems(result.data); } })
      .catch(() => { if (!controller.signal.aborted && epoch === generation.current) setMessage('load'); })
      .finally(() => { if (epoch === generation.current) { locked.current = false; setBusy(false); } });
    return () => { generation.current++; controller.abort(); request.current?.abort(); };
  }, [accountId, csrfToken]);
  const find = (list: CustomerFavorite[], candidate: AyrovixCandidate) => list.find(item => item.source_url === candidate.sourceUrl || (candidate.kind === 'catalog' && item.product_id === candidate.id));
  const toggle = async (candidate: AyrovixCandidate) => {
    if (!accountId || !csrfToken) { setMessage('auth'); onOpenAccount?.(); return; }
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage(null);
    const epoch = generation.current;
    const controller = new AbortController(); request.current = controller;
    try {
      const current = loaded.current ?? (await customerApi<{data:CustomerFavorite[]}>('/api/customer/account/favorites', {signal:controller.signal})).data;
      if (epoch !== generation.current) return;
      const existing = find(current, candidate);
      let next: CustomerFavorite[];
      if (existing) {
        await customerApi(`/api/customer/account/favorites/${encodeURIComponent(existing.id)}`, {method:'DELETE',signal:controller.signal}, csrfToken);
        next = current.filter(item => item.id !== existing.id);
      } else {
        const result = await customerApi<{data:CustomerFavorite}>('/api/customer/account/favorites', {
          method:'POST',signal:controller.signal,body:JSON.stringify({
            ...(candidate.kind === 'catalog' ? {productId:candidate.id} : {}),
            sourceUrl:candidate.sourceUrl,title:candidate.title,imageUrl:candidate.image,
            priceTND:typeof candidate.priceTnd === 'number' && Number.isFinite(candidate.priceTnd) && candidate.priceTnd > 0 ? candidate.priceTnd : null,
          }),
        }, csrfToken);
        next = [...current, result.data];
      }
      if (epoch === generation.current) { loaded.current = next; setItems(next); }
    } catch (error: any) {
      if (!controller.signal.aborted && epoch === generation.current) {
        if (error.status === 401) { loaded.current = null; setItems([]); setMessage('auth'); }
        else setMessage('save');
      }
    } finally {
      if (epoch === generation.current) { locked.current = false; setBusy(false); }
    }
  };
  return { isSaved:(candidate:AyrovixCandidate)=>Boolean(accountId && owner.current === accountId && find(items,candidate)), toggle, busy, message };
}
