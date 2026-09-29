import { describe, expect, test } from 'vitest';
import { assertProductionConfiguration } from '../src/config/productionConfig';

const validProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  ADMIN_EMAIL: 'admin@ayrovi.tn',
  ADMIN_PASSWORD: 'a-unique-private-password-2026',
  CUSTOMER_AUTH_SECRET: '9f1d4db643c6aaf50e74fe2f9845b6a9a799c1bfc6ceafe228ae27e4015e13a4',
  DATABASE_PATH: '/var/lib/ayrovi/data/qatafo.sqlite',
  PUBLIC_BASE_URL: 'https://www.ayrovi.tn',
  TRUST_PROXY_HOPS: '1',
};

describe('production configuration is fail-closed', () => {
  test('accepts complete production secrets, HTTPS origin, persistent path and proxy setting', () => {
    expect(() => assertProductionConfiguration(validProductionEnv)).not.toThrow();
  });

  test('lists missing or unsafe production settings without echoing secret values', () => {
    expect(() => assertProductionConfiguration({ NODE_ENV: 'production', ADMIN_PASSWORD: 'tiny' }))
      .toThrow(/ADMIN_EMAIL.*ADMIN_PASSWORD.*CUSTOMER_AUTH_SECRET.*DATABASE_PATH.*PUBLIC_BASE_URL/);
    try {
      assertProductionConfiguration({ NODE_ENV: 'production', ADMIN_PASSWORD: 'tiny' });
    } catch (error) {
      expect(String(error)).not.toContain('tiny');
    }
  });

  test('rejects non-HTTPS base URLs, sample secrets, relative database paths and proxy-hop typos', () => {
    expect(() => assertProductionConfiguration({
      ...validProductionEnv,
      ADMIN_PASSWORD: 'replace-with-a-real-password',
      CUSTOMER_AUTH_SECRET: 'replace-with-a-real-customer-secret-long-enough',
      DATABASE_PATH: './data.sqlite',
      PUBLIC_BASE_URL: 'http://ayrovi.tn',
      TRUST_PROXY_HOPS: '999',
    })).toThrow(/ADMIN_PASSWORD.*CUSTOMER_AUTH_SECRET.*DATABASE_PATH.*PUBLIC_BASE_URL.*TRUST_PROXY_HOPS/);
  });

  test('refuses to boot on Render when NODE_ENV is not production', () => {
    expect(() => assertProductionConfiguration({ RENDER: 'true', NODE_ENV: 'development' })).toThrow(/NODE_ENV must be production/);
  });

  test('requires a long one-time recovery token when reset is enabled in production', () => {
    expect(() => assertProductionConfiguration({ ...validProductionEnv, ADMIN_BOOTSTRAP_RESET: 'yes' }))
      .toThrow(/ADMIN_BOOTSTRAP_RESET/);
  });
});
