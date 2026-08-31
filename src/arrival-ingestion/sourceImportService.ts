import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { simpleParser } from 'mailparser';
import sharp from 'sharp';
import type {
  ArrivalSourceRecord,
  ArrivalSourceType,
  ExtractionSourcePlan,
  ExtractionUnit,
  SourceAsset,
} from './types';

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 80;
const MAX_EMAIL_IMAGES = 12;
const MAX_TEXT_CHARS = 240_000;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class SourceValidationError extends Error {
  readonly code = 'SOURCE_INVALID';
}

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function imageMime(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function cleanFilename(value: string, fallback: string): string {
  const base = path.basename(String(value || '')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (base || fallback).slice(0, 180);
}

function extensionForMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'message/rfc822') return 'eml';
  if (mime === 'text/html') return 'html';
  return 'txt';
}

function looksLikeEmail(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 16_000)).toString('utf8');
  return /^(?:from|to|subject|date|mime-version|content-type):/im.test(sample) || /<html[\s>]/i.test(sample) || /\S/.test(sample);
}

export function validateSourcePayload(input: {
  sourceType: ArrivalSourceType;
  buffer: Buffer;
  originalFilename?: string;
  claimedMime?: string;
}): { buffer: Buffer; originalFilename: string; mimeType: string; sourceHash: string; extension: string } {
  const { sourceType, buffer } = input;
  if (!buffer.length) throw new SourceValidationError('La source est vide.');
  if (buffer.length > MAX_SOURCE_BYTES) throw new SourceValidationError('La source dépasse la limite de 20 Mo.');
  const detectedImage = imageMime(buffer);
  const pdf = isPdf(buffer);
  let mimeType = '';
  if (sourceType === 'PDF') {
    if (!pdf) throw new SourceValidationError('Le contenu fourni n’est pas un PDF valide.');
    mimeType = 'application/pdf';
  } else if (sourceType === 'IMAGE') {
    if (!detectedImage) throw new SourceValidationError('Utilisez une image JPEG, PNG ou WEBP valide.');
    mimeType = detectedImage;
  } else if (sourceType === 'INVOICE') {
    if (pdf) mimeType = 'application/pdf';
    else if (detectedImage) mimeType = detectedImage;
    else throw new SourceValidationError('La facture doit être un PDF ou une image valide.');
  } else {
    if (!looksLikeEmail(buffer)) throw new SourceValidationError('Le contenu email est vide ou invalide.');
    const claimed = String(input.claimedMime || '').toLowerCase();
    mimeType = claimed.includes('html') ? 'text/html'
      : claimed.includes('message/rfc822') || /\.eml$/i.test(input.originalFilename || '') ? 'message/rfc822'
        : 'text/plain';
  }
  const extension = extensionForMime(mimeType);
  return {
    buffer,
    mimeType,
    extension,
    originalFilename: cleanFilename(input.originalFilename || '', `source.${extension}`),
    sourceHash: createHash('sha256').update(buffer).digest('hex'),
  };
}

function htmlToVisibleText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function analysisImage(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: 'image/jpeg' }> {
  const normalized = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({ width: 2_200, height: 2_200, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  if (!normalized.length || normalized.length > 5 * 1024 * 1024) throw new SourceValidationError('Une page/image ne peut pas être préparée pour l’analyse.');
  return { buffer: normalized, mimeType: 'image/jpeg' };
}

export class SourceImportService {
  readonly root: string;

  constructor(root = process.env.ARRIVAL_SOURCE_DIR || path.resolve(process.cwd(), 'data', 'private', 'arrival-sources')) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }

  private resolveStorageKey(storageKey: string): string {
    const normalized = String(storageKey || '').replace(/\\/g, '/');
    const resolved = path.resolve(this.root, normalized);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) throw new Error('INVALID_STORAGE_KEY');
    return resolved;
  }

  storeOriginal(sourceId: string, buffer: Buffer, extension: string): string {
    const directory = this.resolveStorageKey(sourceId);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const storageKey = `${sourceId}/original.${extension}`;
    fs.writeFileSync(this.resolveStorageKey(storageKey), buffer, { flag: 'wx', mode: 0o600 });
    return storageKey;
  }

  removeSourceDirectory(sourceId: string): void {
    fs.rmSync(this.resolveStorageKey(sourceId), { recursive: true, force: true });
  }

  removeJobDerived(sourceId: string, jobId: string): void {
    fs.rmSync(this.resolveStorageKey(`${sourceId}/derived/${jobId}`), { recursive: true, force: true });
  }

  remove(storageKey: string): void {
    fs.rmSync(this.resolveStorageKey(storageKey), { force: true });
  }

  read(storageKey: string): Buffer {
    return fs.readFileSync(this.resolveStorageKey(storageKey));
  }

  async plan(source: ArrivalSourceRecord): Promise<ExtractionSourcePlan> {
    const input = this.read(source.storageKey);
    if (source.mimeType === 'application/pdf') return this.pdfPlan(source, input);
    if (source.sourceType === 'EMAIL') return this.emailPlan(source, input);
    if (IMAGE_MIMES.has(source.mimeType)) return this.imagePlan(source, input);
    throw new SourceValidationError('Cette source ne possède aucune stratégie de lecture compatible.');
  }

  private async pdfPlan(source: ArrivalSourceRecord, input: Buffer): Promise<ExtractionSourcePlan> {
    const { pdf } = await import('pdf-to-img');
    let document: Awaited<ReturnType<typeof pdf>>;
    try {
      document = await pdf(input, {
        scale: 1.65,
        docInitParams: {
          isEvalSupported: false,
          useSystemFonts: true,
          maxImageSize: 20_000_000,
          canvasMaxAreaInBytes: 32_000_000,
        },
      });
    } catch {
      throw new SourceValidationError('Le PDF est illisible, chiffré ou endommagé.');
    }
    if (!document.length) throw new SourceValidationError('Le PDF ne contient aucune page.');
    if (document.length > MAX_PDF_PAGES) throw new SourceValidationError(`Le PDF dépasse la limite de ${MAX_PDF_PAGES} pages.`);
    return {
      totalUnits: document.length,
      warningCodes: [],
      units: async function* () {
        for (let index = 1; index <= document.length; index += 1) {
          const reference = `${source.id}#page=${index}`;
          try {
            const rendered = await document.getPage(index);
            const normalized = await analysisImage(rendered);
            const assetId = `pdf-page-${index}`;
            yield {
              reference,
              ordinal: index,
              text: '',
              assets: [{
                id: assetId,
                buffer: normalized.buffer,
                mimeType: normalized.mimeType,
                label: `PDF page ${index} of ${document.length}`,
                wholeImageAllowed: false,
              }],
            } satisfies ExtractionUnit;
          } catch {
            yield {
              reference,
              ordinal: index,
              text: '',
              assets: [],
              preparationError: 'Cette page PDF est illisible ou ne peut pas être préparée pour l’analyse.',
            } satisfies ExtractionUnit;
          }
        }
      },
    };
  }

  private async imagePlan(source: ArrivalSourceRecord, input: Buffer): Promise<ExtractionSourcePlan> {
    const normalized = await analysisImage(input);
    return {
      totalUnits: 1,
      warningCodes: [],
      units: async function* () {
        yield {
          reference: `${source.id}#image=1`,
          ordinal: 1,
          text: '',
          assets: [{
            id: 'source-image-1',
            buffer: normalized.buffer,
            mimeType: normalized.mimeType,
            label: source.sourceType === 'INVOICE' ? 'Invoice image' : 'Uploaded screenshot or image',
            wholeImageAllowed: source.sourceType === 'IMAGE',
          }],
        };
      },
    };
  }

  private async emailPlan(source: ArrivalSourceRecord, input: Buffer): Promise<ExtractionSourcePlan> {
    let text = input.toString('utf8');
    const assets: SourceAsset[] = [];
    const warningCodes: string[] = [];
    try {
      const parsed = await simpleParser(input, { skipImageLinks: true });
      const addressText = (value: typeof parsed.to): string => Array.isArray(value)
        ? value.map((item) => item.text).filter(Boolean).join(', ')
        : value?.text || '';
      const headers = [
        parsed.subject ? `Subject: ${parsed.subject}` : '',
        parsed.from?.text ? `From: ${parsed.from.text}` : '',
        addressText(parsed.to) ? `To: ${addressText(parsed.to)}` : '',
        parsed.date ? `Date: ${parsed.date.toISOString()}` : '',
      ].filter(Boolean).join('\n');
      const body = parsed.text?.trim() || (typeof parsed.html === 'string' ? htmlToVisibleText(parsed.html) : '');
      if (headers || body) text = `${headers}\n\n${body}`.trim();
      const images = parsed.attachments.filter((attachment) => IMAGE_MIMES.has(String(attachment.contentType).toLowerCase()));
      if (images.length > MAX_EMAIL_IMAGES) warningCodes.push('EMAIL_IMAGE_ATTACHMENTS_TRUNCATED');
      for (const [index, attachment] of images.slice(0, MAX_EMAIL_IMAGES).entries()) {
        try {
          const normalized = await analysisImage(attachment.content);
          assets.push({
            id: `email-image-${index + 1}`,
            buffer: normalized.buffer,
            mimeType: normalized.mimeType,
            label: cleanFilename(attachment.filename || '', `Email image ${index + 1}`),
            wholeImageAllowed: true,
          });
        } catch {
          warningCodes.push('EMAIL_IMAGE_ATTACHMENT_UNREADABLE');
        }
      }
    } catch {
      // Pasted email/plain text remains a valid source even when it is not RFC822.
      text = source.mimeType === 'text/html' ? htmlToVisibleText(text) : text;
    }
    const boundedText = text.replace(/\u0000/g, '').trim().slice(0, MAX_TEXT_CHARS);
    if (!boundedText && !assets.length) throw new SourceValidationError('Aucun contenu exploitable dans cet email.');
    if (text.length > MAX_TEXT_CHARS) warningCodes.push('EMAIL_TEXT_TRUNCATED');
    return {
      totalUnits: 1,
      warningCodes,
      units: async function* () {
        yield {
          reference: `${source.id}#email=1`,
          ordinal: 1,
          text: boundedText,
          assets,
        };
      },
    };
  }

  async persistProductImage(input: {
    sourceId: string;
    jobId: string;
    productId: string;
    asset: SourceAsset;
    region: [number, number, number, number] | null;
  }): Promise<string | null> {
    if (!input.region && !input.asset.wholeImageAllowed) return null;
    let pipeline = sharp(input.asset.buffer, { failOn: 'error' }).rotate();
    if (input.region) {
      const metadata = await pipeline.metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      if (!width || !height) return null;
      const [x, y, regionWidth, regionHeight] = input.region;
      const left = Math.max(0, Math.min(width - 1, Math.floor(x * width)));
      const top = Math.max(0, Math.min(height - 1, Math.floor(y * height)));
      const cropWidth = Math.max(1, Math.min(width - left, Math.ceil(regionWidth * width)));
      const cropHeight = Math.max(1, Math.min(height - top, Math.ceil(regionHeight * height)));
      pipeline = pipeline.extract({ left, top, width: cropWidth, height: cropHeight });
    }
    const output = await pipeline
      .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer();
    const storageKey = `${input.sourceId}/derived/${input.jobId}/${input.productId}.webp`;
    const target = this.resolveStorageKey(storageKey);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, output, { flag: 'wx', mode: 0o600 });
    return storageKey;
  }
}
