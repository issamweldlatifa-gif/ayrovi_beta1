import React, { useEffect, useState } from 'react';
import { CustomerPreferences, CustomerSecuritySummary, CustomerSession } from '../../types';
import { useLocale } from '../../i18n/LocaleContext';
import { Button } from '../../design/Button';
import { Field, Input } from '../../design/ui/Field';
import { customerApi } from '../../customer/api';
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Moon } from '../QatafoIcons';

/** Appareil connecté tel que le serveur le décrit (poignée dérivée, IP masquée). */
interface DeviceSessionRow { handle:string; current:boolean; platform:string; client:string; ipMasked:string; lastSeenAt:string }

/**
 * Confirmation de l'adresse (12/11/2026) : code envoyé à l'adresse du compte,
 * saisi ICI, dans la session du compte — un lien cliquable confirmerait aussi un
 * compte créé par quelqu'un d'autre avec cette adresse.
 */
export function EmailConfirmPanel({session,onChanged}:{session:CustomerSession;onChanged:()=>void}) {
  const {tr,isArabic}=useLocale();
  const [challenge,setChallenge]=useState<{id:string;masked:string}|null>(null);
  const [code,setCode]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [done,setDone]=useState(false);
  const locale=isArabic?'ar':'fr';
  const send=async()=>{
    setBusy(true);setError('');
    try{
      const result=await customerApi<{data:{alreadyVerified?:boolean;challengeId?:string;maskedEmail?:string;developmentCode?:string}}>('/api/customer/account/email/verification/request',{method:'POST',body:JSON.stringify({locale})},session.csrfToken);
      if(result.data.alreadyVerified){setDone(true);onChanged();return;}
      setChallenge({id:String(result.data.challengeId||''),masked:String(result.data.maskedEmail||'')});setCode(String(result.data.developmentCode||''));
    }catch(reason:any){setError(reason.message);}finally{setBusy(false);}
  };
  const confirm=async(e:React.FormEvent)=>{
    e.preventDefault();if(!challenge||busy)return;setBusy(true);setError('');
    try{
      await customerApi('/api/customer/account/email/verification/confirm',{method:'POST',body:JSON.stringify({challengeId:challenge.id,code,locale})},session.csrfToken);
      setChallenge(null);setCode('');setDone(true);onChanged();
    }catch(reason:any){setError(reason.message);}finally{setBusy(false);}
  };
  return <section className="ac-panel ac-form-stack" data-testid="account-email-confirm">
    <h2>{tr('Confirmer votre adresse e-mail','تأكيد بريدك الإلكتروني')}</h2>
    <p className="ac-note">{tr('Un code à 6 chiffres est envoyé à votre adresse ; saisissez-le ici. Une adresse confirmée suffit pour passer commande.','نرسل رمزًا من 6 أرقام إلى بريدك؛ أدخله هنا. البريد المؤكَّد يكفي لتأكيد الطلب.')}</p>
    {error&&<p role="alert" className="ac-inline-error">{error}</p>}
    {done&&<p role="status" className="ac-success"><CheckCircle2 className="h-5 w-5" aria-hidden/>{tr('Adresse confirmée.','تم تأكيد البريد.')}</p>}
    {challenge?<form onSubmit={confirm} className="ac-form-stack">
      <p className="ac-note">{tr(`Code envoyé à ${challenge.masked}. Il est valable 15 minutes.`,`أرسلنا الرمز إلى ${challenge.masked}. صالح لمدة 15 دقيقة.`)}</p>
      <Field label={tr('Code de confirmation','رمز التأكيد')} htmlFor="account-email-code"><Input id="account-email-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} required/></Field>
      <Button type="submit" disabled={busy||code.length!==6}>{busy&&<Loader2 className="h-5 w-5 animate-spin" aria-hidden/>}{tr('Confirmer l’adresse','تأكيد البريد')}</Button>
      <button type="button" className="ac-text-button" onClick={()=>void send()} disabled={busy}>{tr('Renvoyer un code','إعادة إرسال الرمز')}</button>
    </form>:!done&&<Button type="button" onClick={()=>void send()} disabled={busy}>{busy&&<Loader2 className="h-5 w-5 animate-spin" aria-hidden/>}{tr('Recevoir le code','استلام الرمز')}</Button>}
  </section>;
}

/** Appareils connectés : fermer un appareil, ou tous les autres (audit M5, 12/11/2026). */
export function DevicesPanel({session,onChanged}:{session:CustomerSession;onChanged:()=>void}) {
  const {tr,formatDate}=useLocale();
  const [rows,setRows]=useState<DeviceSessionRow[]|null>(null);const [busy,setBusy]=useState('');const [message,setMessage]=useState('');
  const load=async()=>{try{const result=await customerApi<{data:DeviceSessionRow[]}>('/api/customer/account/sessions');setRows(Array.isArray(result.data)?result.data:[]);}catch(reason:any){setMessage(reason.message);setRows([]);}};
  useEffect(()=>{void load();},[]);
  const revoke=async(handle:string)=>{setBusy(handle);setMessage('');try{await customerApi(`/api/customer/account/sessions/${encodeURIComponent(handle)}`,{method:'DELETE'},session.csrfToken);await load();onChanged();}catch(reason:any){setMessage(reason.message);}finally{setBusy('');}};
  const revokeOthers=async()=>{setBusy('all');setMessage('');try{const result=await customerApi<{data:{revoked:number}}>('/api/customer/auth/logout-all',{method:'POST',body:JSON.stringify({includeCurrent:false})},session.csrfToken);setMessage(tr(`${result.data.revoked} appareil(s) déconnecté(s).`,`تم تسجيل الخروج من ${result.data.revoked} جهاز.`));await load();onChanged();}catch(reason:any){setMessage(reason.message);}finally{setBusy('');}};
  const others=(rows||[]).filter(row=>!row.current);
  return <section className="ac-panel ac-form-stack" data-testid="account-devices">
    <h2>{tr('Appareils connectés','الأجهزة المتصلة')}</h2>
    <p className="ac-note">{tr('Chaque appareil où votre compte est ouvert. Fermez ceux que vous ne reconnaissez pas.','كل جهاز مفتوح فيه حسابك. أغلق أي جهاز لا تعرفه.')}</p>
    {rows===null?<Loader2 className="h-5 w-5 animate-spin" aria-hidden/>:<ul className="ac-form-stack">{rows.map(row=><li key={row.handle} className="ac-setting">
      <span><strong>{[row.platform,row.client].filter(Boolean).join(' · ')}</strong>{row.current&&<> — {tr('cet appareil','هذا الجهاز')}</>}<br/><small>{[row.lastSeenAt?formatDate(row.lastSeenAt,true):'',row.ipMasked].filter(Boolean).join(' · ')}</small></span>
      {!row.current&&<button type="button" className="ac-text-button" onClick={()=>void revoke(row.handle)} disabled={Boolean(busy)}>{busy===row.handle&&<Loader2 className="h-5 w-5 animate-spin" aria-hidden/>}{tr('Déconnecter','تسجيل الخروج')}</button>}
    </li>)}</ul>}
    {others.length>0&&<Button type="button" onClick={()=>void revokeOthers()} disabled={Boolean(busy)}>{busy==='all'&&<Loader2 className="h-5 w-5 animate-spin" aria-hidden/>}{tr('Déconnecter tous les autres appareils','تسجيل الخروج من كل الأجهزة الأخرى')}</Button>}
    {message&&<p role="status" className="ac-note">{message}</p>}
  </section>;
}

export function AccountPreferences({preferences,busy,onSave}:{preferences:CustomerPreferences;busy:boolean;onSave:(next:CustomerPreferences)=>Promise<void>}) {
  const {tr}=useLocale();
  const [draft,setDraft]=useState(preferences);
  useEffect(()=>setDraft(preferences),[preferences]);
  const toggles:Array<{key:'order_updates'|'payment_updates'|'shipping_updates'|'invoice_updates';label:string}>=[
    {key:'order_updates',label:tr('Commandes','الطلبات')},{key:'payment_updates',label:tr('Paiements','المدفوعات')},{key:'shipping_updates',label:tr('Livraison','التوصيل')},{key:'invoice_updates',label:tr('Factures','الفواتير')},
  ];
  return <form onSubmit={e=>{e.preventDefault();void onSave(draft);}} aria-busy={busy} className="ac-form-stack">
    <fieldset disabled={busy} className="ac-form-stack"><legend className="sr-only">{tr('Préférences du compte','تفضيلات الحساب')}</legend>
      <section className="ac-panel"><h2><Moon className="h-5 w-5" aria-hidden/>{tr('Apparence','المظهر')}</h2><label className="ac-setting"><span>{tr('Mode sombre','الوضع الداكن')}</span><input type="checkbox" role="switch" checked={Boolean(draft.dark_mode)} onChange={e=>setDraft({...draft,dark_mode:e.target.checked?1:0})}/></label><p className="ac-note">{tr('Enregistré dans votre compte. Le mode sombre couvre l’expérience AYROVIX Lens ; le reste du site garde son thème clair.','يُحفظ في حسابك. الوضع الداكن يغطّي تجربة عدسة AYROVIX، ويبقى باقي الموقع بمظهره الفاتح.')}</p></section>
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
    {!summary.emailVerified&&session.account?.email&&<EmailConfirmPanel session={session} onChanged={onChanged}/>}
    <DevicesPanel session={session} onChanged={onChanged}/>
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
    </form>:<section className="ac-panel"><h2>{tr('Votre connexion est gérée par votre fournisseur','دخولك مرتبط بمزوّد الحساب')}</h2><p className="ac-note">{tr('Ce compte n’a pas de mot de passe ZAYROVI. Pour modifier le mot de passe Google, Apple ou Facebook, utilisez les paramètres de ce fournisseur. Pour un compte téléphone, utilisez votre code SMS.','هذا الحساب لا يملك كلمة مرور ZAYROVI. تغيير كلمة مرور Google أو Apple أو Facebook يتم في إعدادات المزوّد. حساب الهاتف يستعمل رمز SMS.')}</p></section>}
  </div>;
}
