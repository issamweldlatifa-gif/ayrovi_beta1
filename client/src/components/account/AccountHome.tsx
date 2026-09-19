import React, { useEffect, useState } from 'react';
import { CustomerAccount, CustomerAccountOverview } from '../../types';
import { useLocale } from '../../i18n/LocaleContext';
import { ArrowLeft, ChevronRight, Heart, Loader2, LogOut, Pencil, ShoppingBag } from '../QatafoIcons';
import { accountMenuGroups, accountSections, AccountSection } from './model';

export function AccountAvatar({account, large=false}: {account:CustomerAccount;large?:boolean}) {
  const [broken,setBroken]=useState(false);
  useEffect(()=>setBroken(false),[account.avatarUrl]);
  return <span className={`ac-avatar ${large?'ac-avatar--large':''}`} aria-hidden="true">
    {account.avatarUrl && !broken ? <img src={account.avatarUrl} alt="" onError={()=>setBroken(true)} referrerPolicy="no-referrer" /> : <span>{Array.from(account.displayName.trim() || 'A').slice(0,1).join('').toLocaleUpperCase()}</span>}
  </span>;
}
export function AccountHeader({section,onBack}: {section:AccountSection;onBack:()=>void}) {
  const {tr,isArabic}=useLocale();
  const item=accountSections.find(item=>item.id===section)!;
  return <header className="ac-header"><div className="ac-header__inner">
    <button type="button" onClick={onBack} className="ac-icon-button" aria-label={section==='home'?tr('Retour à la boutique','العودة للمتجر'):tr('Retour','رجوع')}><ArrowLeft className={`h-5 w-5 ${isArabic?'rotate-180':''}`} aria-hidden /></button>
    <div><span className="ac-header__brand" dir="ltr">AYROVI</span><h1 tabIndex={-1} id="account-heading">{isArabic?item.labelAr:item.label}</h1></div>
    <img src="/media/logo-ayrovi.png" alt="" width={32} height={32} />
  </div></header>;
}
export function AccountHome({account,overview,loading,error,onRetry,onOpen,onLogout,logoutBusy}: {
  account:CustomerAccount;overview:CustomerAccountOverview|null;loading:boolean;error:boolean;
  onRetry:()=>void;onOpen:(section:AccountSection)=>void;onLogout:()=>void;logoutBusy:boolean;
}) {
  const {tr,isArabic}=useLocale();
  const counts=overview?.counts;
  return <div className="ac-home">
    <button type="button" className="ac-profile-card" onClick={()=>onOpen('profile')} aria-label={tr('Modifier mon profil','تعديل ملفي الشخصي')}>
      <AccountAvatar account={account}/><span className="ac-profile-card__text"><strong>{account.displayName || tr('Mon compte','حسابي')}</strong><span dir="auto">{account.email || account.phone || tr('Compléter mon profil','إكمال ملفي الشخصي')}</span></span><Pencil className="h-5 w-5" aria-hidden />
    </button>
    <div className="ac-shortcuts">
      {[{id:'favorites' as const,icon:Heart,label:tr('Favoris','المفضلة'),count:counts?.favorites},{id:'cart' as const,icon:ShoppingBag,label:tr('Panier','السلة'),count:counts?.cartItems}].map(({id,icon:Icon,label,count})=><button key={id} type="button" onClick={()=>onOpen(id)}><Icon className="h-5 w-5" aria-hidden/><span>{label}</span>{count!==undefined&&count>0&&<span className="ac-badge">{count}</span>}</button>)}
    </div>
    {loading && <p role="status" className="ac-loading"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{tr('Actualisation du compte…','جارٍ تحديث الحساب…')}</p>}
    {error && <div className="ac-inline-error" role="alert"><p>{tr('Les compteurs n’ont pas pu être chargés. Vos rubriques restent accessibles.','تعذّر تحميل عدّادات الحساب. يمكنك فتح الأقسام.')} </p><button type="button" onClick={onRetry}>{tr('Réessayer','إعادة المحاولة')}</button></div>}
    {accountMenuGroups.map(group=><section key={group.id} className="ac-menu-group" aria-labelledby={`group-${group.id}`}><h2 id={`group-${group.id}`}>{isArabic?group.labelAr:group.label}</h2><nav className="ac-menu-card" aria-label={isArabic?group.labelAr:group.label}>
      {group.items.map(id=>{const item=accountSections.find(item=>item.id===id)!;const Icon=item.icon;const count=id==='notifications'?counts?.unreadNotifications:id==='orders'?counts?.orders:undefined;return <button key={id} type="button" className="ac-menu-row" data-account-section={id} onClick={()=>onOpen(id)}><Icon className="h-5 w-5" aria-hidden /><span>{isArabic?item.labelAr:item.label}</span>{count!==undefined&&count>0&&<span className="ac-badge" aria-label={id==='notifications'?tr(`${count} non lues`,`${count} غير مقروءة`):undefined}>{count>99?'99+':count}</span>}<ChevronRight className={`ac-chevron h-4 w-4 ${isArabic?'rotate-180':''}`} aria-hidden /></button>;})}
    </nav></section>)}
    <button type="button" className="ac-logout" onClick={onLogout} disabled={logoutBusy}>{logoutBusy?<Loader2 className="h-5 w-5 animate-spin" aria-hidden/>:<LogOut className="h-5 w-5" aria-hidden/>}{logoutBusy?tr('Déconnexion…','جارٍ تسجيل الخروج…'):tr('Se déconnecter','تسجيل الخروج')}</button>
  </div>;
}
export function AccountOrderNavigation({section,onOpen}:{section:AccountSection;onOpen:(section:AccountSection)=>void}) {
 const {tr,isArabic}=useLocale();
 return <nav className="ac-order-nav" aria-label={tr('Commandes, paiements et livraison','الطلبات والمدفوعات والتوصيل')}>
  {(['orders','tracking','payments','invoices'] as const).map(id=>{const item=accountSections.find(item=>item.id===id)!;return <button key={id} type="button" aria-current={id===section?'page':undefined} onClick={()=>onOpen(id)}>{isArabic?item.labelAr:item.label}</button>;})}
 </nav>;
}
