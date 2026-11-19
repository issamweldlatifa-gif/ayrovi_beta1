import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DiscoveryPage } from '@/api/socialCommerce';
import { editorialSnapshot, readEditorialSnapshot } from '@/api/socialCommerceCache';
import type { SocialFilter } from './navigation';

export function useEditorialSnapshot(filter: SocialFilter, page: DiscoveryPage | undefined, updatedAt: number | undefined) {
  const key = `@zayrovi/social-editorial-v1/${filter}`;
  const [stored, setStored] = useState<{ key: string; raw: string | null }>();
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(key).then(raw => { if (active) setStored({ key, raw }); }).catch(() => {});
    return () => { active = false; };
  }, [key]);
  useEffect(() => {
    if (!page || !updatedAt) return;
    const raw = JSON.stringify({ savedAt: updatedAt, page: editorialSnapshot(page, updatedAt) });
    void AsyncStorage.setItem(key, raw).catch(() => {});
  }, [key, page, updatedAt]);
  return useMemo(() => stored?.key === key ? readEditorialSnapshot(stored.raw) : null, [key, stored]);
}
