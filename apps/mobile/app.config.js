const sharePaths = require('../../shared/shareLinkPaths.json');

function websiteHost(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(url.hostname)) {
    throw new Error('EXPO_PUBLIC_SHARE_WEB_ORIGIN must be an HTTPS website origin without credentials, port, path or query.');
  }
  return url.hostname;
}

// app.json remains the base config. With no release inputs, builds are unchanged.
module.exports = ({ config }) => {
  const origin = (process.env.EXPO_PUBLIC_SHARE_WEB_ORIGIN || '').trim();
  const iosEnabled = process.env.ZAYROVI_IOS_UNIVERSAL_LINKS === '1';
  if (!origin) {
    if (iosEnabled) throw new Error('iOS Universal Links require EXPO_PUBLIC_SHARE_WEB_ORIGIN.');
    return config;
  }
  const host = websiteHost(origin);
  const intentFilters = config.android?.intentFilters || [];
  const alreadyDeclared = intentFilters.some(filter => filter.action === 'VIEW' && filter.autoVerify &&
    filter.data?.some(data => data.scheme === 'https' && data.host === host && (!data.pathPrefix || data.pathPrefix === '/') && !data.path && !data.pathPattern));
  return {
    ...config,
    ...(!alreadyDeclared && { android: { ...config.android, intentFilters: [...intentFilters, {
      action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'],
      data: sharePaths.map(path => ({ scheme: 'https', host, pathPrefix: path.slice(0, -1) })),
    }] } }),
    ...(iosEnabled && { ios: { ...config.ios, associatedDomains: [...new Set([
      ...(config.ios?.associatedDomains || []), `applinks:${host}`,
    ])] } }),
  };
};
