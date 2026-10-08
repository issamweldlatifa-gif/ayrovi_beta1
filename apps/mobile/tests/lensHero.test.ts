/**
 * قسم LENS التعريفي (Q4) — «ما بانش» قرار، موش فشل.
 *
 * ثلاث حقائق نقفلها:
 *  • **`null` ردّ صالح**: القسم ما تتضبطش ⇒ يختفى بلا رسالة خطأ.
 *  • **الإدارة تملك الترتيب** (`elementOrder`) ⇒ نحترمو ولا نثبّتوش.
 *  • **القسم زينة**: سقوط `/lens-hero` ما يمنعش تصفّح المتجر.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGetData = vi.fn();
vi.mock('../src/api/client', () => ({
  apiGetData: (...args: unknown[]) => apiGetData(...(args as [])),
}));

const { fetchLensHero, lensHeroRatio } = await import('../src/api/lens');

beforeEach(() => {
  apiGetData.mockClear();
  apiGetData.mockResolvedValue(null);
});

describe('نسبة العرض/الارتفاع', () => {
  it('`16/9` ⇒ 1.777…', () => {
    expect(lensHeroRatio('16/9')).toBeCloseTo(16 / 9, 5);
  });

  it('`1/1` ⇒ 1', () => {
    expect(lensHeroRatio('1/1')).toBe(1);
  });

  it('نسبة تالفة ⇒ `16/9` معروف، موش `NaN` يطيّح التخطيط', () => {
    expect(lensHeroRatio('')).toBeCloseTo(16 / 9, 5);
    expect(lensHeroRatio('abc')).toBeCloseTo(16 / 9, 5);
    expect(lensHeroRatio('16/0')).toBeCloseTo(16 / 9, 5);
    expect(lensHeroRatio(undefined)).toBeCloseTo(16 / 9, 5);
  });
});

describe('قراءة القسم', () => {
  it('`null` ⇒ `null` (القسم ما يبانش — موش خطأ)', async () => {
    await expect(fetchLensHero({})).resolves.toBeNull();
  });

  it('`enabled: false` ⇒ يُقرأ، والمكوّن هو اللي يخبيه', async () => {
    apiGetData.mockResolvedValue({ enabled: false, title: 'T' });
    const hero = await fetchLensHero({});
    expect(hero?.enabled).toBe(false);
    expect(hero?.title).toBe('T');
  });

  it('ترتيب الإدارة (`elementOrder`) يُقرأ كما هو', async () => {
    apiGetData.mockResolvedValue({ enabled: true, elementOrder: 'title,description,cta,proof,eyebrow' });
    const hero = await fetchLensHero({});
    expect(hero?.elementOrder).toBe('title,description,cta,proof,eyebrow');
  });

  it('حقل ناقص ⇒ قيمة محايدة، موش استثناء', async () => {
    apiGetData.mockResolvedValue({ enabled: true });
    const hero = await fetchLensHero({});
    expect(hero?.title).toBe('');
    /**
     * `accentColor` était autrefois `#FF6900` par défaut. C'était un SECOND
     * orange dans le produit (l'accent de marque est `#FF7900`) — et il vivait
     * dans `src/api/**`, une couche qui ne connaît pas la charte.
     *
     * La valeur de repli a donc été retirée de l'API : chaîne vide = « le
     * serveur n'a rien dit », et c'est l'INTERFACE qui retombe sur
     * `theme.colors.accent` (voir LensHero). On teste donc le CONTRAT
     * (neutralité de la couche API), pas une couleur.
     */
    expect(hero?.accentColor).toBe('');
    expect(hero?.media.type).toBe('VIDEO');
    expect(hero?.media.muted).toBe(true);
    expect(hero?.phoneEnabled).toBe(false);
  });

  it('`accentColor` vide ⇒ la charte décide, pas la couche API', async () => {
    /**
     * Le complément du test précédent : ce n'est pas parce que l'API ne met
     * rien que l'écran reste sans couleur. `LensHero` retombe sur l'accent de
     * marque. On lit le code source plutôt que de le monter : le fichier
     * importe React Native, que Vitest ne sait pas transformer.
     */
    const source = readFileSync(new URL('../src/features/lens/LensHero.tsx', import.meta.url), 'utf8');
    expect(source).toContain('content.accentColor || theme.colors.accent');
    expect(source).not.toContain("'#FF6900'");
  });

  it('`media.type` غير `IMAGE` ⇒ `VIDEO` (قائمة مغلقة)', async () => {
    apiGetData.mockResolvedValue({ media: { type: 'GIF' } });
    const hero = await fetchLensHero({});
    expect(hero?.media.type).toBe('VIDEO');
  });

  it('الخادم ساقط ⇒ `null`، **ما يطيّحش الشاشة**', async () => {
    apiGetData.mockImplementation(() => Promise.reject(new Error('réseau')));
    await expect(fetchLensHero({})).resolves.toBeNull();
  });

  it('محاكاة التلفون: الرقعات نصوص إدارية، والفارغة ما تبانش', async () => {
    apiGetData.mockResolvedValue({ enabled: true, phoneEnabled: true, phone: { priceChip: '190.76 TND' } });
    const hero = await fetchLensHero({});
    expect(hero?.phone.priceChip).toBe('190.76 TND');
    expect(hero?.phone.stockChip).toBe('');
  });
});
