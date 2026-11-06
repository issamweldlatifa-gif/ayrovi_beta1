import { createHash } from 'node:crypto';
import { getAyroviAiCore } from '../../ai-core/core';
export interface LocalizedProduct {
  name: string;
  category: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
}
export interface ImagePoint {
  x: number;
  y: number;
}
/** Reject ungrounded, low-confidence, off-image and near-full-scene proposals; no fabricated fallback box. */
export function parseLocalizedProducts(
  value: unknown,
  point?: ImagePoint
): LocalizedProduct[] {
  const rows = (value as any)?.products;
  if (!Array.isArray(rows)) throw new Error('INVALID_LOCALIZATION');
  return rows
    .slice(0, 12)
    .flatMap((row: any) => {
      const b = row?.box;
      if (
        !Array.isArray(b) ||
        b.length !== 4 ||
        !b.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))
      )
        return [];
      const [x, y, w, h] = b;
      if (
        x < 0 ||
        y < 0 ||
        w < 0.02 ||
        h < 0.02 ||
        x + w > 1.001 ||
        y + h > 1.001 ||
        w * h > 0.94 ||
        typeof row.confidence !== 'number' ||
        !Number.isFinite(row.confidence) ||
        row.confidence < 0.65 ||
        row.confidence > 1 ||
        typeof row.name !== 'string' ||
        !row.name.trim()
      )
        return [];
      if (
        point &&
        !(point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h)
      )
        return [];
      if (
        ['person', 'human', 'scene', 'background', 'outfit'].includes(
          String(row.category).trim().toLowerCase()
        )
      )
        return [];
      return [
        {
          name: row.name.trim().slice(0, 120),
          category: String(row.category || 'product').slice(0, 80),
          confidence: row.confidence,
          box: { x, y, w, h },
        },
      ];
    })
    .sort((a, b) =>
      point
        ? a.box.w * a.box.h - b.box.w * b.box.h
        : b.confidence - a.confidence
    );
}
const cache = new Map<string, { at: number; products: LocalizedProduct[] }>();
let active = 0;
export async function localizeProducts(
  image: Buffer,
  mime: string,
  point?: ImagePoint,
  signal?: AbortSignal
): Promise<LocalizedProduct[]> {
  const key = createHash('sha256')
    .update(image)
    .update(JSON.stringify(point || null))
    .digest('hex');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 120000) return hit.products;
  const provider = getAyroviAiCore().responses();
  if (!provider.isConfigured() || active >= 4)
    throw new Error('LOCALIZATION_UNAVAILABLE');
  active++;
  try {
    const result = await provider.complete(
      {
        workload: 'vision',
        modelClass: 'default',
        temperature: 0,
        maxOutputTokens: 1800,
        instructions:
          'Ground individual shopping products in this image. Return normalized [x,y,width,height] boxes and honest confidence, not prices or merchant matches. Clothing worn on a person must be separate garments/accessories, not the whole person. Exclude scene background, people, screenshots chrome and uncertain objects. Empty products if no reliable object. A box must tightly enclose the complete visible item, not a fixed region around a point. Never invent a box.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  mediaType: mime,
                  data: image.toString('base64'),
                },
              },
              {
                type: 'text',
                text: point
                  ? `Locate ONLY the shopping item touched at normalized x=${point.x}, y=${point.y}. Do not include other garments or nearby items. If ambiguous or no item there, return empty products.`
                  : 'Locate up to 12 distinct visible shopping items.',
              },
            ],
          },
        ],
        outputSchema: {
          name: 'lens_product_localization',
          schema: {
            type: 'object',
            properties: {
              products: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    category: { type: 'string' },
                    confidence: { type: 'number' },
                    box: { type: 'array', items: { type: 'number' } },
                  },
                  required: ['name', 'category', 'confidence', 'box'],
                  additionalProperties: false,
                },
              },
            },
            required: ['products'],
            additionalProperties: false,
          },
        },
      },
      signal
        ? AbortSignal.any([signal, AbortSignal.timeout(18000)])
        : AbortSignal.timeout(18000)
    );
    const products = parseLocalizedProducts(
      JSON.parse(
        result.textBlocks
          .join('')
          .replace(/```(?:json)?/g, '')
          .trim()
      ),
      point
    );
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), products });
    return products;
  } finally {
    active--;
  }
}
