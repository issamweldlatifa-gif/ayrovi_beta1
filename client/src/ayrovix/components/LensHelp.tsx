import React, { useRef, useState } from 'react';
import { Info, X } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import './lens-camera.css';

// A session-scoped self-declaration, not verified age or server-side authorization.
export const LENS_CONSENT_KEY = 'ayrovi.lens.consent.v1';
const LENS_CONSENT_VERSION = 'adult-policy-privacy-2026-09-v2';
export function readLensConsent() {
  try { return sessionStorage.getItem(LENS_CONSENT_KEY) === LENS_CONSENT_VERSION; } catch { return false; }
}
export function rememberLensConsent() {
  try { sessionStorage.setItem(LENS_CONSENT_KEY, LENS_CONSENT_VERSION); } catch { /* In-memory React state still permits this visit. */ }
}

export function LensDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { tr, direction } = useLocale();
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, true);
  return <div className="lens-panel-backdrop" dir={direction} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <section ref={ref} tabIndex={-1} className="lens-panel" role="dialog" aria-modal="true" aria-labelledby="lens-panel-title">
      <header className="lens-panel-header"><h2 id="lens-panel-title">{title}</h2><button type="button" className="lens-panel-icon" onClick={onClose} aria-label={tr('Fermer cette fenêtre', 'إغلاق هذه النافذة')}><X size={22} /></button></header>
      <div className="lens-panel-body">{children}</div>
    </section>
  </div>;
}

export function LensGuide({ compact = false }: { compact?: boolean }) {
  const { tr } = useLocale();
  return <div className="lens-guide">
    <p className="lens-panel-lead">{tr('Un produit, plusieurs façons de le retrouver.', 'منتج واحد، وطرق متعددة للعثور عليه.')}</p>
    <details open={!compact}><summary>{tr('Comment utiliser Lens', 'كيف تستخدم Lens؟')}</summary><ul>
      <li>{tr('Photo : cadrez le produit et déclenchez, ou importez une image depuis votre appareil.', 'تصوير: ضع المنتج في الإطار والتقط صورة، أو استورد صورة من جهازك.')}</li>
      <li>{tr('Scan en direct : dirigez la caméra vers les produits. Ce mode recherche des produits, il ne sert pas à enregistrer une vidéo.', 'المسح المباشر: وجّه الكاميرا نحو المنتجات. هذا وضع للبحث عن المنتجات، وليس لتسجيل فيديو.')}</li>
      <li>{tr('Lien / code : scannez un code-barres ou un QR, ou collez le lien d’un produit.', 'رابط أو رمز: امسح باركود أو QR، أو ألصق رابط منتج.')}</li>
      <li>{tr('Utilisez un bon éclairage et évitez les reflets, les visages et les données personnelles.', 'استخدم إضاءة جيدة وتجنب الانعكاسات والوجوه والبيانات الشخصية.')}</li>
    </ul><p>{tr('Les résultats peuvent être inexacts. Prix et disponibilité restent à vérifier avant confirmation de la commande.', 'قد تخطئ النتائج. يبقى السعر والتوفر خاضعين للتحقق قبل تأكيد الطلب.')}</p></details>
    <details open={!compact}><summary>{tr('18 ans et plus · utilisation autorisée', '18 عامًا فأكثر · الاستخدام المسموح')}</summary><p>{tr('Lens est réservé aux adultes de 18 ans et plus, pour rechercher des produits autorisés. Il ne doit pas servir à identifier des personnes.', 'Lens مخصص لمن بلغوا 18 عامًا، للبحث عن المنتجات المسموح بها. لا يُستخدم للتعرف على الأشخاص.')}</p><ul>
      <li>{tr('Ne soumettez pas de contenu pornographique ni de produits à caractère sexuel.', 'يُمنع إرسال محتوى إباحي أو البحث عن منتجات وأدوات جنسية.')}</li>
      <li>{tr('Ne photographiez pas et ne soumettez pas les visages de personnes.', 'يُمنع تصوير أو إرسال وجوه الأشخاص.')}</li>
      <li>{tr('N’utilisez pas de liens vers des contenus ou produits interdits par ces règles ou par la loi.', 'لا تستخدم روابط إلى محتوى أو منتجات تحظرها هذه القواعد أو القوانين المعمول بها.')}</li>
      <li>{tr('Respectez la vie privée et les droits d’autrui.', 'احترم خصوصية الآخرين وحقوقهم.')}</li>
    </ul><p>{tr('Un usage non conforme peut entraîner le refus d’une demande ou une restriction du service. Les actes contraires à la loi peuvent engager la responsabilité de leur auteur.', 'قد يؤدي الاستخدام المخالف إلى رفض الطلب أو تقييد الخدمة. وقد تترتب مسؤولية قانونية على الأفعال المخالفة للقانون.')}</p></details>
    <details><summary>{tr('Vos images et votre confidentialité', 'صورك وخصوصيتك')}</summary><p>{tr('Les images Lens sont traitées sur le serveur AYROVI et, selon les services activés, peuvent être transmises au fournisseur IA configuré (par exemple Anthropic) et à SerpApi pour la recherche visuelle. Le texte et les codes sont lus par les outils OCR d’AYROVI sur son serveur. L’image brute n’est pas enregistrée dans les fichiers publics par le flux Lens. Les résultats dérivés sont conservés dans un cache local borné : jusqu’à 24 h pour la reconnaissance et 30 min pour les correspondances marchandes; ils peuvent être évincés plus tôt. La conservation chez un fournisseur externe relève de ses conditions et contrats.', 'تُعالج صور Lens على خادم AYROVI، وقد تُرسل، بحسب الخدمات المفعّلة، إلى مزوّد الذكاء الاصطناعي المهيأ (مثل Anthropic) وإلى SerpApi للبحث البصري. تُقرأ النصوص والرموز بأدوات OCR على خادم AYROVI. لا يحفظ مسار Lens الصورة الخام في الملفات العامة. تُحفظ النتائج المشتقة في ذاكرة تخزين محلية محدودة: حتى 24 ساعة للتعرّف و30 دقيقة لنتائج التجار، وقد تُحذف قبل ذلك. يخضع الاحتفاظ لدى المزوّدين الخارجيين لشروطهم وعقودهم.')}</p><p>{tr('En mode direct, des images de la caméra peuvent être envoyées pour rechercher des produits. Quittez ce mode pour arrêter les nouvelles captures. Ne transmettez pas de documents confidentiels ou de visages.', 'في وضع المسح المباشر قد تُرسل صور من الكاميرا للبحث عن المنتجات. غادر الوضع لإيقاف التقاط صور جديدة. لا ترسل مستندات سرية أو صور وجوه.')}</p><p>{tr('Consultez la politique de confidentialité avant de continuer.', 'راجع سياسة الخصوصية قبل المتابعة.')}</p><a href="/privacy.html" target="_blank" rel="noopener noreferrer">{tr('Politique de confidentialité — nouvel onglet', 'سياسة الخصوصية — تبويب جديد')}</a></details>
  </div>;
}

export function LensAccess({ onAccept, onClose }: { onAccept: () => void; onClose: () => void }) {
  const { tr } = useLocale();
  const [adult, setAdult] = useState(false), [agreed, setAgreed] = useState(false), [privacyAccepted, setPrivacyAccepted] = useState(false);
  return <div className="lens-access ayrovix-theme-scope"><LensDialog title={tr('Avant d’utiliser Lens', 'قبل استخدام Lens')} onClose={onClose}>
    <div className="lens-access-intro"><Info size={24} /><p>{tr('La recherche de produits, pour les adultes. Prenez connaissance des règles avant de continuer.', 'البحث عن المنتجات للبالغين. اطّلع على القواعد قبل المتابعة.')}</p></div>
    <p>{tr("Photos de produits uniquement : pas de visages, de contenu pornographique ou de produits sexuels.", "صور منتجات فقط: دون وجوه أشخاص أو محتوى إباحي أو منتجات جنسية.")}</p>
    <div className="lens-consent" role="note"><strong>{tr('Traitement des images', 'معالجة الصور')}</strong><p>{tr('Votre image est envoyée au serveur AYROVI et peut être transmise au fournisseur IA configuré et à SerpApi pour la recherche visuelle. Elle n’est pas publiée; des résultats dérivés sont temporairement mis en cache. Consultez les durées et les prestataires dans la politique de confidentialité.', 'تُرسل صورتك إلى خادم AYROVI وقد تُنقل إلى مزوّد الذكاء الاصطناعي المهيأ وإلى SerpApi للبحث البصري. لا تُنشر الصورة، وتُخزّن نتائج مشتقة مؤقتًا. راجع مدد الاحتفاظ والمزوّدين في سياسة الخصوصية.')}</p><a href="/privacy.html" target="_blank" rel="noopener noreferrer">{tr('Lire la politique de confidentialité', 'قراءة سياسة الخصوصية')}</a></div>
    <LensGuide compact />
    <div className="lens-consent"><label><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} />{tr('Je confirme avoir 18 ans ou plus.', 'أقر بأن عمري 18 عامًا أو أكثر.')}</label><label><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />{tr('J’ai lu et j’accepte les règles d’utilisation de Lens.', 'قرأت قواعد استخدام Lens وأوافق عليها.')}</label><label><input type="checkbox" checked={privacyAccepted} onChange={e => setPrivacyAccepted(e.target.checked)} />{tr('Je comprends que l’image peut être transmise au fournisseur IA et à SerpApi, selon les services activés.', 'أفهم أن الصورة قد تُرسل إلى مزوّد الذكاء الاصطناعي وSerpApi بحسب الخدمات المفعّلة.')}</label>
      <p>{tr('Déclaration personnelle, mémorisée pour cette session. Ce n’est pas une vérification d’identité. Vous pouvez quitter Lens avant l’envoi.', 'إقرار ذاتي يُحفظ لهذه الجلسة، وليس تحققًا من الهوية. يمكنك مغادرة Lens قبل الإرسال.')}</p>
      <button type="button" className="lens-panel-primary" disabled={!adult || !agreed || !privacyAccepted} onClick={onAccept}>{tr('Continuer vers Lens', 'المتابعة إلى Lens')}</button>
      <button type="button" className="lens-panel-secondary" onClick={onClose}>{tr('Quitter Lens', 'مغادرة Lens')}</button>
    </div>
  </LensDialog></div>;
}
