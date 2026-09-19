import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { QatafoDatabase } from '../db/database';
import { customerFromRequest, requireCustomer, createCustomerSession, setCustomerCookie } from './auth';
import { customerAuthRateAllowed } from './passwordRecovery';
import { hashPassword, verifyPassword } from './passwords';
import { authMailTemplate, enqueueAuthMail } from './accountMail';

/** Account-owned mutations: sessions/CSRF required, no account IDs accepted from callers. */
export function createAccountSettingsRouter(db: QatafoDatabase, publicAccount: (row: any) => any) {
  const router=Router();
  router.use('/account',(_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:0}}).single('avatar');
  router.post('/account/avatar', requireCustomer(db), (req,res,next)=>{
    upload(req,res,error=>{
      if(error) {res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({success:false,code:'AVATAR_UPLOAD_INVALID',error:'Photo invalide. Utilisez une image JPG, PNG ou WebP de 2 Mo maximum.'});return;}
      next();
    });
  }, async (req,res)=>{
    const account=customerFromRequest(req);
    if(!req.file) return res.status(400).json({success:false,code:'AVATAR_REQUIRED',error:'Sélectionnez une photo.'});
    if(!customerAuthRateAllowed(db,'avatar-account',account.id,15)) return res.status(429).json({success:false,error:'Trop de modifications de photo. Réessayez plus tard.'});
    try {
      const image=sharp(req.file.buffer,{limitInputPixels:12_000_000,failOn:'error',animated:false});
      const metadata=await image.metadata();
      if(!['jpeg','png','webp'].includes(metadata.format||'') || (metadata.pages||1)>1) return res.status(400).json({success:false,code:'AVATAR_FORMAT_INVALID',error:'Utilisez une photo JPG, PNG ou WebP non animée.'});
      const bytes=await image.rotate().resize(256,256,{fit:'cover'}).jpeg({quality:82}).toBuffer();
      // Re-encoded, metadata-free, small avatar. Saved with the account; no public file URL.
      db.run("UPDATE customer_accounts SET avatar_url=?,avatar_source='custom',updated_at=? WHERE id=?",`data:image/jpeg;base64,${bytes.toString('base64')}`,new Date().toISOString(),account.id);
      return res.json({success:true,data:publicAccount(db.get('SELECT * FROM customer_accounts WHERE id=?',account.id))});
    } catch { return res.status(400).json({success:false,code:'AVATAR_INVALID',error:'Impossible de lire cette image. Choisissez une autre photo.'}); }
  });
  router.delete('/account/avatar',requireCustomer(db),(req,res)=>{
    const account=customerFromRequest(req);
    db.run("UPDATE customer_accounts SET avatar_url='',avatar_source='none',updated_at=? WHERE id=?",new Date().toISOString(),account.id);
    return res.json({success:true,data:publicAccount(db.get('SELECT * FROM customer_accounts WHERE id=?',account.id))});
  });
  router.post('/account/security/password',requireCustomer(db),(req,res)=>{
    const account=customerFromRequest(req);
    const ar=req.body?.locale==='ar';
    const fail=(status:number,code:string,fr:string,arabic:string)=>res.status(status).json({success:false,code,error:ar?arabic:fr});
    if(!customerAuthRateAllowed(db,'change-password',account.id,5)) return fail(429,'PASSWORD_RATE_LIMITED','Trop de tentatives. Réessayez dans 15 minutes.','محاولات كثيرة. أعد المحاولة بعد 15 دقيقة.');
    const current=typeof req.body?.currentPassword==='string'?req.body.currentPassword:'';
    const password=typeof req.body?.newPassword==='string'?req.body.newPassword:'';
    const row=db.get<any>('SELECT * FROM customer_accounts WHERE id=?',account.id);
    if(!row?.password_hash) return fail(409,'PASSWORD_NOT_SET','Ce compte utilise une autre méthode de connexion.','هذا الحساب يستعمل وسيلة دخول أخرى.');
    if(current.length>100 || !verifyPassword(current,row.password_hash)) return fail(400,'CURRENT_PASSWORD_INVALID','Le mot de passe actuel est incorrect.','كلمة المرور الحالية غير صحيحة.');
    if(password.length<8 || password.length>100) return fail(400,'PASSWORD_WEAK','Utilisez entre 8 et 100 caractères.','استخدم من 8 إلى 100 حرف.');
    if(current===password) return fail(400,'PASSWORD_UNCHANGED','Choisissez un mot de passe différent.','اختر كلمة مرور مختلفة.');
    const session=db.transaction(()=>{
      const now=new Date().toISOString();
      db.run('UPDATE customer_accounts SET password_hash=?,updated_at=? WHERE id=?',hashPassword(password),now,account.id);
      db.run('DELETE FROM customer_sessions WHERE account_id=?',account.id);
      db.run('UPDATE customer_password_resets SET consumed_at=? WHERE account_id=? AND consumed_at IS NULL',now,account.id);
      db.run("UPDATE customer_auth_mail_jobs SET status='CANCELLED',payload='' WHERE account_id=? AND kind='PASSWORD_RESET' AND status IN ('PENDING','SENDING')",account.id);
      if(row.email) {
        const title=ar?'تم تغيير كلمة مرورك':'Votre mot de passe a été modifié';
        enqueueAuthMail(db,account.id,'PASSWORD_CHANGED',{to:row.email,subject:title,html:authMailTemplate(ar,title,ar?'<p>تم تغيير كلمة مرور حسابك وإغلاق جلساته السابقة.</p>':'<p>Le mot de passe de votre compte a été modifié et les anciennes sessions ont été fermées.</p>')},{dedupKey:`password-changed:${randomUUID()}`});
      }
      return createCustomerSession(db,account.id,req);
    });
    setCustomerCookie(res,session.token);
    return res.json({success:true,data:{account:publicAccount(db.get('SELECT * FROM customer_accounts WHERE id=?',account.id)),csrfToken:session.csrfToken}});
  });
  return router;
}
