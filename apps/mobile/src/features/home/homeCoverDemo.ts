import type { HomeCover } from '@/api/public';

/** The demo uses the same bundled Social Shopping cover as the mobile slot. */
export function demoHomeCover(): HomeCover {
  return { enabled: true, title: '', ctaLabel: '', destination: 'social', autoplayIntervalMs: 5000, slides: [] };
}
