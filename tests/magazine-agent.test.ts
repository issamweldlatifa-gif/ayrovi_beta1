import { afterAll, describe, expect, test, vi } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import {
  deleteMagazineDraft,
  findMagazineProductContext,
  generateMagazineContent,
  getMagazineDraft,
  listMagazineDrafts,
  parseMagazineBatchCount,
  prepareMagazineDraft,
  saveMagazineDraftBundle,
  type GenerateMagazineInput,
  type MagazineAgentOutput,
} from '../src/magazine/service';

const db = new QatafoDatabase(':memory:');

const output: MagazineAgentOutput = {
  topic: 'أناقة الكراميل في الخريف',
  angle: 'درجة الكراميل بدل البني العام',
  audience: 'جمهور عربي شاب يتابع الموضة الراقية',
  language: 'العربية',
  tone: 'تحريري راقٍ وقريب',
  summary: 'دليل تحريري قصير لاختيار درجة الكراميل وبنائها ضمن إطلالة خريفية متوازنة.',
  product_id: null,
  editorial: {
    title: 'الكراميل هو البني الجديد',
    hook: 'تعود الدرجات الدافئة هذا الموسم من زاوية أكثر دقة وهدوءًا.',
    sections: [
      { heading: 'لماذا الكراميل الآن؟', text: 'تقدم الدرجة الدافئة بديلًا غنيًا عن البني التقليدي، ويمكن تنسيقها مع خامات متعددة من دون أن تفقد حضورها التحريري. '.repeat(5) },
      { heading: 'توازن الخامات', text: 'تظهر قوة اللون حين يجتمع الصوف والجلد والقطن في طبقات محسوبة، مع ترك مساحة واضحة لكل خامة داخل الإطلالة. '.repeat(5) },
      { heading: 'تفاصيل الإطلالة', text: 'تمنح الإكسسوارات الصغيرة فرصة لتجربة الاتجاه قبل اعتماده كاملًا، من الحقيبة إلى الحذاء والحزام. '.repeat(5) },
    ],
    conclusion: 'الخلاصة أن الكراميل ليس لونًا موسميًا عابرًا، بل أداة تنسيق مرنة تحتاج إلى عين دقيقة ومراجعة شخصية.',
    shop_the_look: [],
  },
  publication: {
    caption: 'ليس كل بني متشابهًا. هذا الموسم نختار الكراميل لأنه أهدأ، أغنى، وأسهل في بناء الطبقات.',
    hashtags: ['#Ayrovi', '#مجلتي', '#موضة', '#Caramel', '#FallStyle'],
    media_suggestion: 'لقطة تحريرية عمودية لخامات كراميل متعددة تحت إضاءة دافئة.',
  },
  story: {
    hook: 'أي درجة تختار هذا الخريف؟',
    frames: [
      { order: 1, text: 'ابدأ بدرجة كراميل واحدة', visual: 'خلفية بنفسجية مع قطعة كراميل' },
      { order: 2, text: 'أضف خامة ثانية', visual: 'تفصيل صوف وجلد' },
      { order: 3, text: 'اختم بإكسسوار صغير', visual: 'حقيبة أو حزام' },
    ],
    interaction: 'استفتاء: كراميل أم شوكولاتة؟',
    cta: 'احفظ الفكرة للعودة إليها.',
  },
  reel: {
    hook: 'درجة واحدة تغيّر الإطلالة كلها',
    scenes: [
      { order: 1, seconds: '0-3', text: 'لقطة خامة دافئة', stock_query: 'caramel wool fabric warm light vertical' },
      { order: 2, seconds: '3-9', text: 'طبقات أزياء محايدة', stock_query: 'neutral autumn fashion layers street vertical' },
      { order: 3, seconds: '9-16', text: 'إكسسوار كراميل', stock_query: 'caramel leather bag close up vertical' },
    ],
    cta: 'اكتشف الفكرة كاملة في مجلتي.',
    duration_seconds: 20,
  },
  visual_query: 'caramel autumn fashion editorial 2026',
  source_notes: ['Trend reference checked by the editor.'],
};

const input: GenerateMagazineInput = {
  command: 'ولّد مقالة عن اتجاهات الخريف',
  conversationId: 'mag_test_conversation',
  batchId: 'mag_test_batch',
  batchIndex: 1,
  batchTotal: 1,
  adminId: '',
};

afterAll(() => db.close());

describe('Magazine Agent persistence and product policy', () => {
  test('parses Arabic and numeric batch commands with a hard maximum', () => {
    expect(parseMagazineBatchCount('اليوم ولّد عشرة مقالات شتوية')).toBe(10);
    expect(parseMagazineBatchCount('أنشئ 4 أفكار')).toBe(4);
    expect(parseMagazineBatchCount('generate 99 articles')).toBe(10);
    expect(parseMagazineBatchCount('مقال عن الخريف')).toBe(1);
  });

  test('only links explicit product requests to real read-only catalogue matches', () => {
    const real = findMagazineProductContext(db, 'ولّد ريلز لمنتج SHEIN Ensemble tendance AYROVI');
    expect(real.requested).toBe(true);
    expect(real.matched).toBe(true);
    expect(real.products[0]?.id).toBe('product_demo_01');

    const absent = findMagazineProductContext(db, 'ولّد ريلز لحذاء Nike الجديد');
    expect(absent.requested).toBe(true);
    expect(absent.matched).toBe(false);
    expect(absent.products.length).toBeGreaterThan(0);

    const generic = findMagazineProductContext(db, 'اكتب عشرة مقالات شتوية عن الألوان');
    expect(generic.requested).toBe(false);
  });

  test('auto-saves all four content formats as database drafts', () => {
    const drafts = saveMagazineDraftBundle(db, output, [{
      title: 'مرجع بصري', url: 'https://example.com/editorial', thumbnailUrl: 'https://example.com/thumb.jpg', source: 'example.com', license: 'reference',
    }], [], input, 'claude-test', 'mag_test_batch');
    expect(drafts).toHaveLength(4);
    expect(new Set(drafts.map((draft) => draft.content_type))).toEqual(new Set(['editorial','publication','story','reel']));
    expect(drafts.every((draft) => draft.status === 'draft')).toBe(true);
    expect(listMagazineDrafts(db, { limit: 20 })).toHaveLength(4);
  });

  test('human confirmation materializes an editorial draft without publishing a reference-only image', () => {
    const editorial = listMagazineDrafts(db, { type: 'editorial' })[0];
    const prepared = prepareMagazineDraft(db, editorial.id, { status: 'draft', category: 'AYROVI' });
    expect(prepared.target_resource).toBe('news');
    expect(prepared.target_id).toMatch(/^news_agent_/);
    const news = db.get<any>('SELECT * FROM news_items WHERE id=?', prepared.target_id);
    expect(news.status).toBe('DRAFT');
    expect(news.image).toBe('');
    expect(news.content).toContain('لماذا الكراميل الآن؟');
    expect(getMagazineDraft(db, editorial.id)?.referenceMedia[0].license).toBe('reference');
  });

  test('materializes social cards only as non-public CMS drafts', () => {
    const publication = prepareMagazineDraft(db, listMagazineDrafts(db, { type: 'publication' })[0].id, { status: 'draft', category: 'STYLE' });
    const reel = prepareMagazineDraft(db, listMagazineDrafts(db, { type: 'reel' })[0].id, { status: 'draft', category: 'STYLE' });
    const story = prepareMagazineDraft(db, listMagazineDrafts(db, { type: 'story' })[0].id, { status: 'draft', category: 'STYLE' });
    expect(db.get<any>('SELECT status,image_url FROM publications WHERE id=?', publication.target_id)).toMatchObject({ status: 'brouillon', image_url: '' });
    expect(db.get<any>('SELECT status,video_url FROM reels WHERE id=?', reel.target_id)).toMatchObject({ status: 'brouillon', video_url: '' });
    expect(db.get<any>('SELECT status,media_url FROM stories WHERE id=?', story.target_id)).toMatchObject({ status: 'DRAFT', media_url: '' });
    expect(deleteMagazineDraft(db, story.id)?.id).toBe(story.id);
    expect(getMagazineDraft(db, story.id)).toBeNull();
    expect(db.get<any>('SELECT status FROM stories WHERE id=?', story.target_id)?.status).toBe('EXPIRED');
  });

  test('creates a real future publication schedule while blocking unlicensed social media', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const editorial = listMagazineDrafts(db, { type: 'editorial' })[0];
    const scheduled = prepareMagazineDraft(db, editorial.id, { status: 'scheduled', category: 'AYROVI', scheduledAt: future });
    const news = db.get<any>('SELECT status,published_at FROM news_items WHERE id=?', scheduled.target_id);
    expect(news.status).toBe('PUBLISHED');
    expect(news.published_at).toBe(future);
    prepareMagazineDraft(db, editorial.id, { status: 'draft', category: 'AYROVI' });
    expect(db.get<any>('SELECT status FROM news_items WHERE id=?', scheduled.target_id)?.status).toBe('DRAFT');
    const publication = listMagazineDrafts(db, { type: 'publication' })[0];
    expect(() => prepareMagazineDraft(db, publication.id, { status: 'scheduled', scheduledAt: future })).toThrow('MAGAZINE_MEDIA_REQUIRED');
  });

  test('rejects invalid past scheduling dates', () => {
    const reel = listMagazineDrafts(db, { type: 'reel' })[0];
    expect(() => prepareMagazineDraft(db, reel.id, { status: 'scheduled', scheduledAt: '2020-01-01T00:00:00.000Z' })).toThrow('MAGAZINE_SCHEDULE_INVALID');
  });

  test('uses the official Anthropic messages endpoint with Web Search and auto-saves the response', async () => {
    const providerDb = new QatafoDatabase(':memory:');
    const oldKey = process.env.ANTHROPIC_API_KEY;
    const oldSerp = process.env.SERPAPI_KEY;
    const oldPexels = process.env.PEXELS_API_KEY;
    const oldPixabay = process.env.PIXABAY_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    delete process.env.SERPAPI_KEY;
    delete process.env.PEXELS_API_KEY;
    delete process.env.PIXABAY_API_KEY;
    const fetchMock = vi.fn(async (url: string, options: any) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      const body = JSON.parse(String(options.body));
      if (body.max_tokens === 5200) {
        expect(body.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]);
        expect(body.system).toContain('مجلتي');
        return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(output) }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      expect(body.tools[0].max_uses).toBe(2);
      return new Response(JSON.stringify({ content: [{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: 'Fashion fabric stock video', url: 'https://www.pexels.com/video/fashion-fabric-12345/' }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await generateMagazineContent(providerDb, { ...input, batchId: 'provider_batch' });
      expect(result.needsClarification).toBe(false);
      expect(result.drafts).toHaveLength(4);
      expect(result.drafts.find((draft) => draft.content_type === 'reel')?.stockMedia).toHaveLength(1);
      expect(result.drafts.find((draft) => draft.content_type === 'reel')?.stockMedia[0]).toMatchObject({ provider: 'Pexels', publicationReady: false });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      providerDb.close();
      vi.unstubAllGlobals();
      if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
      if (oldSerp === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = oldSerp;
      if (oldPexels === undefined) delete process.env.PEXELS_API_KEY; else process.env.PEXELS_API_KEY = oldPexels;
      if (oldPixabay === undefined) delete process.env.PIXABAY_API_KEY; else process.env.PIXABAY_API_KEY = oldPixabay;
    }
  });
});
