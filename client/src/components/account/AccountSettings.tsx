import React, { useEffect, useState } from 'react';
import { CustomerPreferences, CustomerSecuritySummary, CustomerSession } from '../../types';
import { useLocale } from '../../i18n/LocaleContext';
import { Button } from '../../design/Button';
import { Field, Input } from '../../design/ui/Field';
import { customerApi } from '../../customer/api';
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Moon } from '../QatafoIcons';

export function AccountPreferences({preferences,busy,onSave}:{preferences:CustomerPreferences;busy:boolean;onSave:(next:CustomerPreferences)=>Promise<void>}) {
  const {tr}=useLocale();
  const [draft,setDraft]=useState(preferences);
  useEffect(()=>setDraft(preferences),[preferences]);
  const toggles:Array<{key:'order_updates'|'payment_updates'|'shipping_updates'|'invoice_updates';label:string}>=[
    {key:'order_updates',label:tr('Commandes','الطلبات')},{key:'payment_updates',label:tr('Paiements','المدفوعات')},{key:'shipping_updates',label:tr('Livraison','التوصيل')},{key:'invoice_updates',label:tr('Factures','الفواتير')},
  ];
  return <form onSubmit={e=>{e.preventDefault();void onSave(draft);}} aria-busy={busy} className="ac-form-stack">
    <fieldset disabled={busy} className="ac-form-stack"><legend className="sr-only">{tr('Préférences du compte','تفضيلات الحساب')}</legend>
      <section className="ac-panel"><h2><Moon className="h-5 w-5" aria-hidden/>{tr('Apparence','المظهر')}</h2><label className="ac-setting"><span>{tr('Mode sombre','الوضع الداكن')}</span><input type="checkbox" role="switch" checked={Boolean(draft.dark_mode)} onChange={e=>setDraft({...draft,dark_mode:e.target.checked?1:0})}/></label><p className="ac-note">{tr('Le thème est enregistré dans votre compte après validation.','يُحفظ المظهر في حسابك بعد تأكيد التفضيلات.')}</p></section>
      <section className="ac-panel"><h2>{tr('Notifications du compte','إشعارات الحساب')}</h2>{toggles.map(({key,label})=><label key={key} className="ac-setting"><span>{label}</span><input type="checkbox" checked={Boolean(draft[key])} onChange={e=>setDraft({...draft,[key]:e.target.checked?1:0})}/></label>)}</section>
      <Button type="submit" disabled={busy}>{busy&&<Loader2 className="h-5 w-5 animate-spin" aria-hidden/>}{tr('Enregistrer les préférences','حفظ التفضيلات')}</Button>
    </fieldset>
  </form>;
}
export function AccountSecurity({summary,session,onSession,onChanged}:{summary:CustomerSecuritySummary;session:CustomerSession;onSession:(next:CustomerSession)=>void;onChanged:()=>void}) {
  const {tr,isArabic,formatDate}=useLocale();
  const [current,setCurrent]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');
  const [visible,setVisible]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [done,setDone]=useState(false);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();if(busy)return;setError('');setDone(false);
    if(password!==confirm){setError(tr('Les mots de passe ne correspondent pas.','كلمتا المرور غير متطابقتين.'));return;}
    setBusy(true);
    try{
      const result=await customerApi<{data:CustomerSession}>('/api/customer/account/security/password',{method:'POST',body:JSON.stringify({currentPassword:current,newPassword:password,locale:isArabic?'ar':'fr'})},session.csrfToken);
      onSession(result.data);setCurrent('');setPassword('');setConfirm('');setVisible(false);setDone(true);onChanged();
    }catch(reason:any){setError(reason.message);}finally{setBusy(false);}
  };
  return <div className="ac-form-stack">
    <section className="ac-panel"><h2><Lock className="h-5 w-5" aria-hidden/>{tr('Méthodes de connexion','وسائل الدخول')}</h2>
      <div className="ac-security-tags">{summary.hasPassword&&<span>{tr('E-mail et mot de passe','البريد وكلمة المرور')}</span>}{summary.identities.map(identity=><span key={identity.provider}>{identity.provider==='PHONE'?tr('Téléphone','الهاتف'):identity.provider}</span>)}</div>
      <dl className="ac-facts"><div><dt>{tr('E-mail vérifié','البريد موثّق')}</dt><dd>{summary.emailVerified?tr('Oui','نعم'):tr('Non','لا')}</dd></div><div><dt>{tr('Téléphone vérifié','الهاتف موثّق')}</dt><dd>{summary.phoneVerified?tr('Oui','نعم'):tr('Non','لا')}</dd></div><div><dt>{tr('Sessions actives','الجلسات النشطة')}</dt><dd>{summary.activeSessions}</dd></div>{summary.lastLoginAt&&<div><dt>{tr('Dernière connexion','آخر دخول')}</dt><dd>{formatDate(summary.lastLoginAt,true)}</dd></div>}</dl>
    </section>
    {summary.hasPassword?<form onSubmit={submit} className="ac-panel ac-form-stack" aria-busy={busy}>
      <h2>{tr('Changer le mot de passe','تغيير كلمة المرور')}</h2>
      {error&&<p role="alert" className="ac-inline-error">{error}</p>}
      {done&&<p role="status" className="ac-success"><CheckCircle2 className="h-5 w-5" aria-hidden/>{tr('Mot de passe modifié. Les autres sessions ont été fermées.','تم تغيير كلمة المرور وإغلاق الجلسات الأخرى.')}</p>}
      <fieldset disabled={busy} className="ac-form-stack"><legend className="sr-only">{tr('Changer le mot de passe','تغيير كلمة المرور')}</legend>
        <Field label={tr('Mot de passe actuel','كلمة المرور الحالية')} htmlFor="account-current-password"><Input id="account-current-password" type={visible?'text':'password'} autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)} maxLength={100} required/></Field>
        <Field label={tr('Nouveau mot de passe','كلمة المرور الجديدة')} htmlFor="account-new-password"><Input id="account-new-password" type={visible?'text':'password'} autoComplete="new-password" minLength={8} maxLength={100} value={password} onChange={e=>setPassword(e.target.value)} required/></Field>
        <Field label={tr('Confirmer le mot de passe','تأكيد كلمة المرور')} htmlFor="account-confirm-password"><Input id="account-confirm-password" type={visible?'text':'password'} autoComplete="new-password" minLength={8} maxLength={100} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></Field>
        <button type="button" className="ac-text-button" aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff className="h-5 w-5" aria-hidden/>:<Eye className="h-5 w-5" aria-hidden/>}{visible?tr('Masquer les mots de passe','إخفاء كلمات المرور'):tr('Afficher les mots de passe','إظهار كلمات المرور')}</button>
        <p className="ac-note">{tr('8 à 100 caractères. Les anciennes sessions seront fermées, celle-ci sera renouvelée.','من 8 إلى 100 حرف. تُغلق الجلسات السابقة وتُجدّد جلستك الحالية.')}</p>
        <Button type="submit" disabled={busy||!current||!password||!confirm}>{busy&&<Loader2 className="h-5 w-5 animate-spin" aria-hidden/>}{tr('Modifier le mot de passe','تغيير كلمة المرور')}</Button>
      </fieldset>
    </form>:<section className="ac-panel"><h2>{tr('Votre connexion est gérée par votre fournisseur','دخولك مرتبط بمزوّد الحساب')}</h2><p className="ac-note">{tr('Ce compte n’a pas de mot de passe AYROVI. Pour modifier le mot de passe Google, Apple ou Facebook, utilisez les paramètres de ce fournisseur. Pour un compte téléphone, utilisez votre code SMS.','هذا الحساب لا يملك كلمة مرور AYROVI. تغيير كلمة مرور Google أو Apple أو Facebook يتم في إعدادات المزوّد. حساب الهاتف يستعمل رمز SMS.')}</p></section>}
  </div>;
}
