import sharePaths from './shareLinkPaths.json';

export const IOS_APP_LINK_APP_ID_ENV = 'IOS_APP_LINK_APP_ID';
export const IOS_APP_LINK_HOSTS_ENV = 'IOS_APP_LINK_HOSTS';
export const IOS_APP_LINK_BUNDLE_ID = 'app.zayrovi.mobile';

// Use the application-identifier from the signed app (App ID prefix + bundle ID).
// The prefix can differ from an account's Team ID for existing applications.
export function appleAppLinksForHost(env: Record<string, string | undefined>, host: string | undefined) {
  const appID = env[IOS_APP_LINK_APP_ID_ENV]?.trim() || '';
  const hosts = env[IOS_APP_LINK_HOSTS_ENV]?.split(',').map(value => value.trim().toLowerCase()).filter(Boolean) || [];
  if (!/^[A-Z0-9]{10}\.app\.zayrovi\.mobile$/.test(appID) || !host ||
    !hosts.length || hosts.some(value => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(value)) ||
    !hosts.includes(host.toLowerCase())) return null;
  return {
    applinks: { details: [{ appIDs: [appID], components: sharePaths.map(path => ({ '/': path })) }] },
  };
}
