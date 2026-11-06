/** Official editorial launch. Source photographs supplied by the product owner.
 * Called inside a one-shot transaction: never repopulates after an editor deletes a card.
 */
import type { QatafoDatabase } from '../db/database';

export const OFFICIAL_STORIES = [
  ['everyday', 'Les essentiels du quotidien', 'Des pièces de caractère, à votre façon.', 'أساسيات كل يوم', 'قطع مميزة بأسلوبك الخاص.'],
  ['wellbeing', 'Votre rituel bien-être', 'Prenez un moment pour vous.', 'لحظتك للعناية', 'خذ وقتًا لنفسك.'],
  ['trench', 'Le trench, intemporel', 'Une pièce, mille façons de la porter.', 'معطف لكل المواسم', 'قطعة واحدة وإطلالات متعددة.'],
  ['coffee', 'Une pause avec style', 'Les petits plaisirs du quotidien.', 'استراحة بأناقة', 'تفاصيل صغيرة تزيّن يومك.'],
  ['winter', 'Prêts pour les jours froids', 'Du caractère à chaque pas.', 'للأيام الباردة', 'تميّز في كل خطوة.'],
  ['skincare', 'Le soin au cœur des envies', 'Inspiration pour votre routine beauté.', 'العناية في قلب اهتماماتك', 'إلهام لروتين جمالك.'],
  ['beauty', 'La touche de couleur', 'Exprimez votre beauté, à votre manière.', 'لمسة لون', 'عبّر عن جمالك بطريقتك.'],
] as const;

export function seedOfficialStories(db: QatafoDatabase) {
  const now = new Date().toISOString();
  // Explicit product-owner replacement: only story content is retired, never reels/publications.
  db.run("DELETE FROM content_products WHERE content_kind='story'");
  db.run("DELETE FROM story_interactions WHERE target_kind='story'");
  db.run('DELETE FROM stories');
  db.run("UPDATE magazine_drafts SET status='archived' WHERE content_type='story'");
  for (const [index, [slug, title, description, titleAr, descriptionAr]] of OFFICIAL_STORIES.entries()) {
    db.run(`INSERT INTO stories (id,media_type,media_url,title,description,title_ar,description_ar,cta,target_url,
      publish_at,priority,status,created_at,updated_at,category,secondary_images)
      VALUES (?,'IMAGE',?,?,?,?,?,'','',?,?,'PUBLISHED',?,?,'STYLE','[]')`,
      `official_story_${slug}`, `/media/stories/${slug}.jpg`, title, description, titleAr, descriptionAr,
      now, 100 - index, now, now);
  }
  db.run(`UPDATE stories_showcase_settings SET title='Stories sur ZAYROVI',subtitle='Le meilleur de la semaine',
    title_ar='قصص ZAYROVI',subtitle_ar='مختارات الأسبوع',cta_label='Explorez toutes les stories',
    cta_label_ar='استكشف كل القصص',cta_url='',card_count=7,enabled=1,sort_order=0,updated_at=? WHERE id='global'`, now);
}
