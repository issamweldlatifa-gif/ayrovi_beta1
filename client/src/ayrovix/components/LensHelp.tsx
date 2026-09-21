import React, { useRef, useState } from 'react';
import { Info, X } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import './lens-camera.css';

// A session-scoped self-declaration, not verified age or server-side authorization.
export const LENS_CONSENT_KEY = 'ayrovi.lens.consent.v1';
export function readLensConsent() {
  try { return sessionStorage.getItem(LENS_CONSENT_KEY) === 'adult-policy-2026-09'; } catch { return false; }
}
export function rememberLensConsent() {
  try { sessionStorage.setItem(LENS_CONSENT_KEY, 'adult-policy-2026-09'); } catch { /* In-memory React state still permits this visit. */ }
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
    <details><summary>{tr('Vos images et votre confidentialité', 'صورك وخصوصيتك')}</summary><p>{tr('Les images et liens soumis peuvent être traités par les services d’analyse et de recherche. En mode direct, des images de la caméra peuvent être envoyées pour rechercher des produits. Quittez ce mode pour arrêter le scan.', 'قد تعالج خدمات التحليل والبحث الصور والروابط المرسلة. في المسح المباشر قد تُرسل لقطات من الكاميرا للبحث عن المنتجات. غادر هذا الوضع لإيقاف المسح.')}</p><p>{tr('Ne transmettez pas de documents confidentiels. Consultez notre politique pour les informations relatives aux données et à vos droits.', 'لا ترسل مستندات سرية. راجع سياستنا للمعلومات المتعلقة بالبيانات وحقوقك.')}</p><a href="/privacy.html" target="_blank" rel="noopener noreferrer">{tr('Politique de confidentialité — nouvel onglet', 'سياسة الخصوصية — تبويب جديد')}</a></details>
  </div>;
}

export function LensAccess({ onAccept, onClose }: { onAccept: () => void; onClose: () => void }) {
  const { tr } = useLocale();
  const [adult, setAdult] = useState(false), [agreed, setAgreed] = useState(false);
  return <div className="lens-access ayrovix-theme-scope"><LensDialog title={tr('Avant d’utiliser Lens', 'قبل استخدام Lens')} onClose={onClose}>
    <div className="lens-access-intro"><Info size={24} /><p>{tr('La recherche de produits, pour les adultes. Prenez connaissance des règles avant de continuer.', 'البحث عن المنتجات للبالغين. اطّلع على القواعد قبل المتابعة.')}</p></div>
    <p>{tr("Photos de produits uniquement : pas de visages, de contenu pornographique ou de produits sexuels.", "صور منتجات فقط: دون وجوه أشخاص أو محتوى إباحي أو منتجات جنسية.")}</p><LensGuide compact />
    <div className="lens-consent"><label><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} />{tr('Je confirme avoir 18 ans ou plus.', 'أقر بأن عمري 18 عامًا أو أكثر.')}</label><label><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />{tr('J’ai lu et j’accepte les règles d’utilisation de Lens.', 'قرأت قواعد استخدام Lens وأوافق عليها.')}</label>
      <p>{tr('Déclaration personnelle, mémorisée pour cette session. Ce n’est pas une vérification d’identité.', 'إقرار ذاتي يُحفظ لهذه الجلسة، وليس تحققًا من الهوية.')}</p>
      <button type="button" className="lens-panel-primary" disabled={!adult || !agreed} onClick={onAccept}>{tr('Continuer vers Lens', 'المتابعة إلى Lens')}</button>
      <button type="button" className="lens-panel-secondary" onClick={onClose}>{tr('Quitter Lens', 'مغادرة Lens')}</button>
    </div>
  </LensDialog></div>;
}
