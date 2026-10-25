/**
 * كتالوج المتجر — منتوجات، وصولات، ماركات (Q1، 08/10/2026).
 *
 * لماذا هذا الملف موجود أصلاً (دروس خطة أولى فاشلة): الخطة الأولى بُنيت على
 * «كل مسار API = شاشة»، فغطّت السباكة وتركت المنتوج. الخادم كان يعرض
 * `/api/public/products` من الأول — التطبيق ببساطة ما قراهوش.
 *
 * القاعدة هنا: **الحقول تُقرأ بتحفّظ**. حقل ناقص أو مغلوط ⇒ قيمة محايدة
 * (`''` / `0` / قائمة فارغة)، ولا استثناء يطيّح الشاشة كلها. والسعر المعروض
 * هو **سعر الخادم** (`finalPrice`) وحده: التطبيق ما يحسبش ديناراً واحداً.
 */
import { apiGet } from './client';
import type { RequestOptions } from './client';

/**
 * ورقة المنتوج الكبيرة — réponse **واحدة** من `GET /api/public/products/:id`
 * (24/10/2026): الصور، الاختيارات (مقاس/لون)، توفّر كل اختيار، والمخزون.
 *
 * الخادم هو اللي يحسب `available` و`purchasable`؛ التطبيق يقرا برك. والحقل
 * `stock` في المتغيّر ينجّم يكون `null` («ما نعرفوش») — و`null` **موش صفر**:
 * صفر معناها «وفى»، وهاكة إفادة ما عندناش دليل عليها.
 */
export type SheetStockStatus = 'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK' | 'UNKNOWN';

export interface SheetVariant {
  id: string;
  sku: string;
  size: string;
  color: string;
  /**
   * Photos de CETTE variante (couleur) dans le CRM. `undefined` = le serveur ne
   * les publie pas encore ; vide = aucune photo rattachée à cette couleur. Dans
   * les deux cas l'écran n'emprunte **jamais** la photo d'une autre couleur.
   */
  images?: string[];
  available: boolean;
  stock: number | null;
  reason: 'INACTIVE' | 'OUT_OF_STOCK' | null;
}

export interface SheetDimensionValue {
  value: string;
  available: boolean;
  stock: number | null;
}

export interface SheetDimension {
  key: 'size' | 'color';
  label: string;
  values: SheetDimensionValue[];
}

export interface ProductSheet {
  images: string[];
  /** Vidéos du produit (`catalogue_media` VIDEO). Absent/vide = aucune vidéo. */
  videos?: string[];
  dimensions: SheetDimension[];
  variants: SheetVariant[];
  stock: { tracked: boolean; quantity: number | null; status: SheetStockStatus };
  purchasable: boolean;
}

/** سطر منتوج كما يقدّمه الخادم (`GET /api/public/products`). */
export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  image: string;
  additionalImages: string[];
  brandId: string;
  brandName: string;
  category: string;
  sourceUrl: string;
  sourcePlatform: string;
  originalPrice: number;
  currency: string;
  convertedPrice: number;
  customsFee: number;
  shippingFee: number;
  serviceFee: number;
  /** السعر النهائي بالدينار — **الخادم** هو من يحسبو. */
  finalPrice: number;
  /**
   * Prix barré saisi par le propriétaire dans le CRM (`null` = pas de prix barré).
   * L'application ne calcule jamais de remise : elle affiche le barré **et** le
   * pourcentage uniquement si le serveur en fournit un, et seulement s'il est
   * strictement supérieur au prix affiché.
   */
  compareAtPrice: number | null;
  expressAvailable: boolean;
  stockStatus: string;
  arrivalIds: string[];
  /** تفاصيل الورقة الكبيرة — `null` في لائحة المنتوجات (الخادم ما يبعتهاش في اللائحة). */
  sheet: ProductSheet | null;
  /** جذر شجرة الأقسام (العائلة): « ملابس نساء »، « إلكترونيك »… `null` = بلا قسم. */
  family: CatalogFamily | null;
  /** الخصائص المعلنة في CRM — المرتّبة، وبلا قيم فارغة. */
  attributes: CatalogAttribute[];
  /**
   * أسماء الكتل كما كتبها مالك المتجر في CRM: « Taille » تولّي « Pointure »،
   * « Contenance »، « Volume »… ومقطع جديد ياخذ اسمه من هنا. اللي ما عندوش
   * اسم في CRM يرجع لاسم التطبيق — ما نختارعوش اسم.
   */
  ficheLabels: FicheLabels;
}

/** تسميات الورقة (بيانات CRM، ماهياش كود). */
export interface FicheLabels {
  /** اسم بُعد المقاس (`catalog.size` افتراضيًا). */
  size?: string;
  /** اسم بُعد اللون (`catalog.color` افتراضيًا). */
  color?: string;
  /** اسم كل مقطع، بالمفتاح (`matiere`, `mesures`, أو مقطع جديد). */
  sections?: Record<string, string>;
}

export interface CatalogFamily {
  id: string;
  name: string;
  slug: string;
}

export interface CatalogAttribute {
  key: string;
  label: string;
  type: string;
  /** Section d'affichage décidée par le CRM (« matiere », « mesures »…). */
  section: string;
  value: string;
}

/**
 * حالة المخزون — **مُطبَّعة من المصدر**.
 *
 * لماذا هذا الملف: القاعدة تخزّن `AVAILABLE | LIMITED | OUT_OF_STOCK` (قيد
 * `CHECK` في المخطّط)، والخادم يبعثها **كما هي**. التطبيق كان يقارن بصيغة
 * أخرى (`in_stock`) ⇒ كل المنتوجات كانت تبان «التوفّر غير مؤكّد»، وهو جهل
 * مقنّع بالحياد. التطبيع في طبقة الـAPI: مصدر واحد، مختبَر، وكل شاشة تستعملو.
 */
export type StockStatus = 'AVAILABLE' | 'LIMITED' | 'OUT_OF_STOCK' | 'UNKNOWN';

export function normalizeStockStatus(value: unknown): StockStatus {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'AVAILABLE' || raw === 'IN_STOCK') return 'AVAILABLE';
  if (raw === 'LIMITED' || raw === 'LOW') return 'LIMITED';
  if (raw === 'OUT_OF_STOCK' || raw === 'SOLDOUT' || raw === 'SOLD_OUT') return 'OUT_OF_STOCK';
  return 'UNKNOWN';
}

/** وصولة (arrivage) كما يقدّمها `GET /api/public/arrivals`. */
export interface CatalogArrival {
  id: string;
  name: string;
  type: string;
  departureAt: string;
  expectedArrivalAt: string;
  endsAt: string | null;
  description: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const numOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function parseSheet(payload: unknown): ProductSheet | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = obj(payload);
  const stock = obj(row.stock);
  const status = text(stock.status).toUpperCase();
  const dimensions: SheetDimension[] = [];
  for (const entry of arr(row.dimensions)) {
    const dimension = obj(entry);
    const key = dimension.key === 'size' || dimension.key === 'color' ? dimension.key : null;
    if (!key) continue;
    const values: SheetDimensionValue[] = [];
    for (const candidate of arr(dimension.values)) {
      const value = obj(candidate);
      const label = text(value.value);
      if (!label) continue;
      values.push({ value: label, available: value.available === true, stock: numOrNull(value.stock) });
    }
    if (values.length > 0) dimensions.push({ key, label: text(dimension.label) || key, values });
  }
  const variants: SheetVariant[] = [];
  for (const entry of arr(row.variants)) {
    const variant = obj(entry);
    const id = text(variant.id);
    if (!id) continue;
    const reason = variant.reason === 'INACTIVE' || variant.reason === 'OUT_OF_STOCK' ? variant.reason : null;
    variants.push({
      id,
      sku: text(variant.sku),
      size: text(variant.size),
      color: text(variant.color),
      images: list(variant.images),
      available: variant.available === true,
      stock: numOrNull(variant.stock),
      reason,
    });
  }
  return {
    images: list(row.images),
    videos: list(row.videos),
    dimensions,
    variants,
    stock: {
      tracked: stock.tracked === true,
      quantity: numOrNull(stock.quantity),
      status: status === 'IN_STOCK' || status === 'LOW' || status === 'OUT_OF_STOCK' ? status : 'UNKNOWN',
    },
    purchasable: row.purchasable === true,
  };
}
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

function parseProduct(payload: unknown): CatalogProduct | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    name: text(row.name),
    description: text(row.description),
    image: text(row.image),
    additionalImages: list(row.additionalImages),
    brandId: text(row.brandId),
    brandName: text(row.brandName),
    category: text(row.category),
    sourceUrl: text(row.sourceUrl),
    sourcePlatform: text(row.sourcePlatform),
    originalPrice: num(row.originalPrice),
    currency: text(row.currency) || 'TND',
    convertedPrice: num(row.convertedPrice),
    customsFee: num(row.customsFee),
    shippingFee: num(row.shippingFee),
    serviceFee: num(row.serviceFee),
    finalPrice: num(row.finalPrice),
    compareAtPrice: row.compareAtPrice === null || row.compareAtPrice === undefined ? null : num(row.compareAtPrice),
    expressAvailable: row.expressAvailable === true,
    stockStatus: text(row.stockStatus),
    arrivalIds: list(row.arrivalIds),
    sheet: parseSheet(row.sheet),
    family: parseFamily(row.family),
    attributes: parseAttributes(row.attributes),
    ficheLabels: parseFicheLabels(row.ficheLabels),
  };
}

/**
 * تسميات الورقة من الخادم: نصّ قصير فقط، بلا html وبلا أرقام مخترعة.
 * التسمية الفارغة ما تتسجّلش — يعني التطبيق يرجع لاسمو.
 */
function parseFicheLabels(payload: unknown): FicheLabels {
  const out: FicheLabels = {};
  if (!payload || typeof payload !== 'object') return out;
  const row = obj(payload);
  const size = text(row.size).trim();
  const color = text(row.color).trim();
  if (size) out.size = size;
  if (color) out.color = color;
  const sections: Record<string, string> = {};
  const source = row.sections;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    for (const [slug, label] of Object.entries(source as Record<string, unknown>)) {
      const key = String(slug).trim();
      const value = text(label).trim();
      if (key && value) sections[key] = value;
    }
  }
  if (Object.keys(sections).length > 0) out.sections = sections;
  return out;
}

/** Famille = racine de l'arbre, décidée par la donnée du CRM (jamais en dur). */
function parseFamily(payload: unknown): CatalogFamily | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = obj(payload);
  const id = text(row.id);
  const name = text(row.name);
  if (!id || !name) return null;
  return { id, name, slug: text(row.slug) };
}

/**
 * Attributs déclarés : un attribut sans valeur **disparaît** (aucun « — »).
 * Le libellé vient du CRM ; s'il manque, la clé reste lisible.
 */
function parseAttributes(payload: unknown): CatalogAttribute[] {
  const out: CatalogAttribute[] = [];
  for (const entry of arr(payload)) {
    const row = obj(entry);
    const key = text(row.key);
    const value = text(row.value).trim();
    if (!key || !value) continue;
    out.push({ key, label: text(row.label) || key, type: text(row.type) || 'TEXT', section: text(row.section), value });
  }
  return out;
}

function parseArrival(payload: unknown): CatalogArrival | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    name: text(row.name),
    type: text(row.type),
    departureAt: text(row.departureAt),
    expectedArrivalAt: text(row.expectedArrivalAt),
    endsAt: typeof row.endsAt === 'string' ? row.endsAt : null,
    description: text(row.description),
  };
}

/** منتوجات المتجر. `arrivalId` يفلتر على وصولة بعينها. */
export async function fetchCatalogProducts(
  options: { limit?: number; arrivalId?: string } & RequestOptions = {},
): Promise<CatalogProduct[]> {
  const { limit, arrivalId, ...request } = options;
  const query = new URLSearchParams();
  if (limit) query.set('limit', String(limit));
  if (arrivalId) query.set('arrivalId', arrivalId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const { data } = await apiGet<unknown>(`/api/public/products${suffix}`, request);
  if (!Array.isArray(data)) return [];
  return data.map(parseProduct).filter((product): product is CatalogProduct => product !== null);
}

/** منتوج واحد بالمعرّف (صفحة المنتوج و«Découvrir»). `null` إذا ما عادش نشط أو ما كاينش. */
export async function fetchCatalogProduct(id: string, options: RequestOptions = {}): Promise<CatalogProduct | null> {
  const { data } = await apiGet<unknown>(`/api/public/products/${encodeURIComponent(id)}`, options);
  return parseProduct(data);
}

/** الوصولات (arrivage) — النشطة والمبرمجة. */
export async function fetchCatalogArrivals(options?: RequestOptions): Promise<CatalogArrival[]> {
  const { data } = await apiGet<unknown>('/api/public/arrivals', options);
  if (!Array.isArray(data)) return [];
  return data.map(parseArrival).filter((arrival): arrival is CatalogArrival => arrival !== null);
}

/** الماركات الشريكة. */
export async function fetchCatalogBrands(options?: RequestOptions): Promise<string[]> {
  const { data } = await apiGet<unknown>('/api/public/brands', options);
  if (!Array.isArray(data)) return [];
  return data.map((entry) => text((entry as Record<string, unknown>)?.name)).filter(Boolean);
}
