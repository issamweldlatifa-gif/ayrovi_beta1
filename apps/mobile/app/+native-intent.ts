import { resolveHttpsShareLink, resolvePublisherSystemLink } from '@/features/links/resolve';

// Resolve a share before Expo tries to mount /ar/r/... as a native screen.
// Also replace retired Boutique links before Expo tries to mount the removed screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return resolveHttpsShareLink(path) ?? resolvePublisherSystemLink(path) ?? path;
}
