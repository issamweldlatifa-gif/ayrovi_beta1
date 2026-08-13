interface PublicResponse<T> {
  success: boolean;
  data: T;
  serverTime?: string;
}

export interface PublicHomeData {
  hero: any[];
  brands: any[];
  arrivals: any[];
  products: any[];
  promotions: any[];
  stories: any[];
  news: any[];
}

let homeRequest: Promise<PublicResponse<PublicHomeData>> | null = null;
let commerceRequest: Promise<PublicResponse<any>> | null = null;

async function requestPublic<T>(path: string): Promise<PublicResponse<T>> {
  const response = await fetch(path, { credentials: 'same-origin' });
  let payload: any = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok || !payload?.success) {
    throw new Error(String(payload?.error || `Configuration publique indisponible (${response.status}).`));
  }
  return payload as PublicResponse<T>;
}

/** One bootstrap request supplies Hero, brands and all public CMS sections. */
export function getPublicHome(): Promise<PublicResponse<PublicHomeData>> {
  if (!homeRequest) {
    homeRequest = requestPublic<PublicHomeData>('/api/public/home').catch((error) => {
      homeRequest = null;
      throw error;
    });
  }
  return homeRequest;
}

/** Shared across App, footer, product drawer and checkout for this page load. */
export function getCommerceConfig(): Promise<PublicResponse<any>> {
  if (!commerceRequest) {
    commerceRequest = requestPublic<any>('/api/public/commerce-config').catch((error) => {
      commerceRequest = null;
      throw error;
    });
  }
  return commerceRequest;
}
