import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, FileText, History, Info, MoreVertical, Moon, ShoppingBag, X,
} from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

export type LensHeaderMode = 'camera' | 'result' | 'product';
type MenuSection = 'menu' | 'help' | 'terms' | 'service' | 'legal';

interface LensContextHeaderProps {
  mode: LensHeaderMode;
  onExit?: () => void;
  onBack?: () => void;
  onMenu: () => void;
  onCart?: () => void;
  cartCount?: number;
  flashControl?: React.ReactNode;
  dark?: boolean;
}

/** Contextual navigation shared by Camera, Result and Product without sharing their back semantics. */
export const LensContextHeader: React.FC<LensContextHeaderProps> = ({
  mode,
  onExit,
  onBack,
  onMenu,
  onCart,
  cartCount = 0,
  flashControl,
  dark = false,
}) => {
  const { tr, direction } = useLocale();
  const camera = mode === 'camera';
  const tone = camera || dark ? 'text-white' : 'text-ink';
  const control = camera || dark ? 'bg-white/15 hover:bg-white/25' : 'bg-surface hover:bg-brand/10';
  const count = Math.max(0, Math.min(99, Math.trunc(cartCount)));
  return (
    <header className={`lens-context-header relative z-20 w-full border-b ${camera || dark ? 'border-white/10 bg-ink/45 backdrop-blur-md' : 'border-line bg-white'} ${tone}`} data-lens-header={mode}>
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[minmax(88px,1fr)_auto_minmax(88px,1fr)] items-center gap-2 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-1.5 justify-self-start">
          {camera ? (
            <button type="button" onClick={onExit} aria-label={tr('Quitter AYROVIX Lens', 'مغادرة عدسة AYROVIX')} className={`grid h-11 w-11 place-items-center rounded-full ${control}`}>
              <X className="h-5 w-5" />
            </button>
          ) : (
            <button type="button" onClick={onBack} aria-label={tr('Retour', 'رجوع')} className={`grid h-11 w-11 place-items-center rounded-full ${control}`}>
              <ArrowLeft className={`h-5 w-5 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
            </button>
          )}
          {camera && flashControl}
        </div>
        <strong className="max-w-[42vw] truncate text-center font-display text-sm font-black tracking-tight sm:max-w-none sm:text-base">AYROVIX Lens</strong>
        <div className="flex min-w-0 items-center gap-1.5 justify-self-end">
          {!camera && onCart && (
            <button type="button" onClick={onCart} aria-label={tr(`Panier, ${count} article(s)`, `السلة، ${count} منتج`)} className={`relative grid h-11 w-11 place-items-center rounded-full ${control}`}>
              <ShoppingBag className="h-5 w-5" />
              {count > 0 && <span className="absolute -end-0.5 -top-0.5 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-brand px-1 text-[9px] font-black leading-none text-white">{count}</span>}
            </button>
          )}
          <button type="button" onClick={onMenu} aria-label={tr('Menu AYROVIX Lens', 'قائمة عدسة AYROVIX')} className={`grid h-11 w-11 place-items-center rounded-full ${control}`}>
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

interface LensMoreMenuProps {
  open: boolean;
  dark: boolean;
  onToggleDark: () => void;
  onHistory: () => void;
  onClose: () => void;
}

const MenuButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; trailing?: React.ReactNode }> = ({ icon, label, onClick, trailing }) => (
  <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-sm font-extrabold transition hover:bg-brand/10">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">{icon}</span>
    <span className="min-w-0 flex-1">{label}</span>
    {trailing}
  </button>
);

/** Secondary Lens functions live in one non-destructive sheet on mobile and desktop. */
export const LensMoreMenu: React.FC<LensMoreMenuProps> = ({ open, dark, onToggleDark, onHistory, onClose }) => {
  const { tr, direction } = useLocale();
  const [section, setSection] = useState<MenuSection>('menu');
  useEffect(() => { if (!open) setSection('menu'); }, [open]);
  if (!open) return null;

  const title = {
    menu: 'AYROVIX Lens',
    help: tr('Comment utiliser Lens', 'كيفية استخدام Lens'),
    terms: tr("Conditions d’utilisation de Lens", 'شروط استخدام Lens'),
    service: tr('Service AYROVIX', 'خدمة AYROVIX'),
    legal: tr('Informations légales', 'المعلومات القانونية'),
  }[section];

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-5" dir={direction} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" onClick={onClose} className="absolute inset-0 bg-ink/65 backdrop-blur-sm" aria-label={tr('Fermer le menu', 'إغلاق القائمة')} />
      <section className={`ayrovix-theme-scope relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[26px] border border-line shadow-overlay sm:rounded-[26px] ${dark ? 'bg-ink text-white' : 'bg-white text-ink'}`}>
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 border-b border-line bg-inherit px-4">
          {section !== 'menu'
            ? <button type="button" onClick={() => setSection('menu')} className="grid h-11 w-11 place-items-center rounded-full hover:bg-brand/10" aria-label={tr('Retour au menu', 'العودة إلى القائمة')}><ArrowLeft className={`h-5 w-5 ${direction === 'rtl' ? 'rotate-180' : ''}`} /></button>
            : <span className="h-11 w-11" />}
          <strong className="min-w-0 flex-1 truncate text-center text-sm font-black">{title}</strong>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full hover:bg-brand/10" aria-label={tr('Fermer', 'إغلاق')}><X className="h-5 w-5" /></button>
        </header>

        <div className="p-4 sm:p-5">
          {section === 'menu' && <div className="space-y-1">
            <MenuButton icon={<History className="h-5 w-5" />} label={tr('Historique', 'السجل')} onClick={onHistory} />
            <MenuButton
              icon={<Moon className="h-5 w-5" />}
              label={tr('Mode sombre', 'الوضع الداكن')}
              onClick={onToggleDark}
              trailing={<span role="switch" aria-checked={dark} className={`relative h-7 w-12 rounded-full border transition ${dark ? 'border-brand bg-brand' : 'border-line bg-surface'}`}><i className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${dark ? 'start-[1.45rem]' : 'start-0.5'}`} /></span>}
            />
            <MenuButton icon={<Info className="h-5 w-5" />} label={tr('Comment utiliser Lens', 'كيفية استخدام Lens')} onClick={() => setSection('help')} />
            <MenuButton icon={<FileText className="h-5 w-5" />} label={tr("Conditions d’utilisation de Lens", 'شروط استخدام Lens')} onClick={() => setSection('terms')} />
            <MenuButton icon={<Info className="h-5 w-5" />} label={tr('Service AYROVIX', 'خدمة AYROVIX')} onClick={() => setSection('service')} />
            <MenuButton icon={<FileText className="h-5 w-5" />} label={tr('Informations légales', 'المعلومات القانونية')} onClick={() => setSection('legal')} />
          </div>}

          {section === 'help' && <ol className="space-y-3 text-sm leading-6 text-muted">
            {[
              tr('Photographiez le produit ou importez une image.', 'صوّر المنتج أو ارفع صورة.'),
              tr("AYROVIX Lens analyse l’image.", 'تحلل AYROVIX Lens الصورة.'),
              tr('Consultez les informations produit disponibles.', 'راجع معلومات المنتج المتاحة.'),
              tr('Consultez le prix ou son estimation AYROVI.', 'راجع السعر أو تقدير AYROVI.'),
              tr('Vérifiez le résultat et les variantes.', 'تحقق من النتيجة والخيارات.'),
              tr('Ajoutez le produit au panier.', 'أضف المنتج إلى السلة.'),
              tr('Utilisez « Calculer un autre produit » pour continuer vos achats.', 'استخدم «حساب منتج آخر» لمواصلة التسوق.'),
            ].map((item, index) => <li key={item} className="flex gap-3"><b className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs text-white">{index + 1}</b><span>{item}</span></li>)}
          </ol>}

          {section === 'terms' && <div className="space-y-4 text-sm leading-6 text-muted">
            <p className="rounded-xl border border-accent bg-accent/10 p-3 font-bold text-ink">{tr('Structure informative en attente de validation du texte juridique officiel.', 'هيكل معلوماتي في انتظار اعتماد النص القانوني الرسمي.')}</p>
            <ul className="list-disc space-y-2 ps-5">
              <li>{tr('Nature et limites de la recherche visuelle automatisée.', 'طبيعة وحدود البحث البصري الآلي.')}</li>
              <li>{tr("Possibilité d’erreur dans l’identification du produit.", 'إمكانية الخطأ في التعرف على المنتج.')}</li>
              <li>{tr('Caractère estimatif des prix non confirmés.', 'الطبيعة التقديرية للأسعار غير المؤكدة.')}</li>
              <li>{tr("Responsabilité relative aux images et données fournies par l’utilisateur.", 'المسؤولية المتعلقة بالصور والبيانات التي يقدمها المستخدم.')}</li>
              <li>{tr('Limites opérationnelles du service.', 'الحدود التشغيلية للخدمة.')}</li>
            </ul>
          </div>}

          {section === 'service' && <div className="space-y-3 text-sm leading-6 text-muted">
            <p>{tr('AYROVIX est le service de recherche visuelle d’AYROVI. Il aide à identifier un produit, retrouver une offre exploitable et préparer son prix en dinars.', 'AYROVIX هي خدمة البحث البصري من AYROVI، تساعد على التعرف على المنتج والعثور على عرض قابل للاستخدام وتحضير سعره بالدينار.')}</p>
            <p>{tr('Le produit choisi rejoint le panier partagé AYROVI, puis suit le parcours livraison, paiement, validation et suivi existant.', 'ينتقل المنتج المختار إلى سلة AYROVI المشتركة، ثم يتبع مسار التسليم والدفع والتحقق والتتبع الحالي.')}</p>
          </div>}

          {section === 'legal' && <div className="space-y-2 text-sm">
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-line p-3 font-bold hover:border-brand">{tr('Mentions légales et conditions générales', 'الإشعارات القانونية والشروط العامة')}</a>
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-line p-3 font-bold hover:border-brand">{tr('Politique de confidentialité', 'سياسة الخصوصية')}</a>
            <a href="/terms.html#retours" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-line p-3 font-bold hover:border-brand">{tr('Politique de retour', 'سياسة الإرجاع')}</a>
            <div className="rounded-xl border border-dashed border-line p-3 font-bold">{tr('Contact / informations société — coordonnées officielles à compléter.', 'الاتصال / معلومات الشركة — تُستكمل بيانات الاتصال الرسمية.')}</div>
            <p className="pt-2 text-xs leading-5 text-muted">{tr('Les mentions spécifiques manquantes restent réservées à la publication du texte officiel validé.', 'تظل البيانات الخاصة غير المتوفرة محجوزة إلى حين نشر النص الرسمي المعتمد.')}</p>
          </div>}

          <button type="button" onClick={onClose} className="ay-btn-secondary mt-6 w-full text-sm">{tr('Fermer', 'إغلاق')}</button>
        </div>
      </section>
    </div>
  );
};
