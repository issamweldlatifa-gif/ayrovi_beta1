import { resolveHttpsShareLink } from '@/features/links/resolve';

// Resolve a share before Expo tries to mount /ar/r/... as a native screen.
// Keep OAuth, scheme links and every existing route on their original path.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return resolveHttpsShareLink(path) ?? path;
}
