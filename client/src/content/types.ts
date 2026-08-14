export interface ArrivalItem {
  id: string;
  name: string;
  type: 'STANDARD' | 'EXPRESS';
  departureAt: string | null;
  expectedArrivalAt: string;
  endsAt: string | null;
  description: string;
  mainImage: string;
  secondaryImages: string[];
  badge: string;
  status: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  image: string;
  brandName: string;
  category: string;
  sourceUrl: string;
  sourcePlatform: string;
  originalPrice: number;
  currency: string;
  finalPrice: number;
  expressAvailable: boolean;
  stockStatus: string;
  arrivalIds: string[];
}

export interface PromotionItem {
  id: string;
  name: string;
  description: string;
  image: string;
  discount_type: 'PERCENTAGE' | 'FIXED';
  value: number;
  starts_at: string;
  ends_at: string;
  promo_code: string | null;
  usage_limit: number | null;
  usage_count: number;
  status: string;
  arrival_ids: string[];
  product_ids: string[];
}

export interface StoryItem {
  id: string;
  media_type: 'IMAGE' | 'VIDEO';
  media_url: string;
  category: 'NEW' | 'ARRIVAGE' | 'STYLE' | 'INFO' | 'PROMO' | string;
  title: string;
  description: string;
  cta: string;
  target_url: string;
  product_id: string | null;
  arrival_id: string | null;
  promotion_id: string | null;
  publish_at: string;
  priority: number;
}

export interface NewsItem {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  image: string;
  category: string;
  author: string;
  published_at: string;
}

export interface ContentHomeData {
  arrivals: ArrivalItem[];
  products: CatalogProduct[];
  promotions: PromotionItem[];
  stories: StoryItem[];
  news: NewsItem[];
}

export type CmsPageId = 'arrivals' | 'promotions' | 'stories' | 'news';

export interface ContentActions {
  /** Ouvre le tiroir de commande avec un produit du catalogue. */
  onOrderProduct: (product: CatalogProduct) => void;
  /** Bascule vers une autre page contenu (ex. promotion → arrivage lié). */
  onOpenPage: (page: CmsPageId, arrivalId?: string) => void;
  onClose: () => void;
}
