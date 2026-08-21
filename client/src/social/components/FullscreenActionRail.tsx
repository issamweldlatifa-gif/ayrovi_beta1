import React from 'react';
import { Bookmark, Heart, HeartFilled, MessageSquare, Share2 } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

interface FullscreenActionRailProps {
  liked: boolean;
  saved: boolean;
  likes: number;
  comments: number;
  shares: number;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
}

const Action: React.FC<{ label: string; count?: number; active?: boolean; children: React.ReactNode; onClick: () => void }> = ({ label, count, active, children, onClick }) => (
  <button type="button" onClick={onClick} aria-label={label} className={`flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-full transition active:scale-90 ${active ? 'text-cta' : 'text-white'}`}>
    {children}
    {count != null && <span className="text-[11px] font-extrabold tabular-nums drop-shadow">{count}</span>}
  </button>
);

/** Shared vertical interaction pattern for both Stories and Reels. */
export const FullscreenActionRail: React.FC<FullscreenActionRailProps> = ({ liked, saved, likes, comments, shares, onLike, onComment, onShare, onSave }) => {
  const { tr } = useLocale();
  return (
    <div className="absolute bottom-24 end-2 z-30 flex flex-col items-center gap-3">
      <Action label={tr('J’aime', 'إعجاب')} count={likes} active={liked} onClick={onLike}>{liked ? <HeartFilled size={29} /> : <Heart size={29} />}</Action>
      <Action label={tr('Commenter', 'تعليق')} count={comments} onClick={onComment}><MessageSquare size={27} /></Action>
      <Action label={tr('Partager', 'مشاركة')} count={shares} onClick={onShare}><Share2 size={27} /></Action>
      <Action label={saved ? tr('Retirer des éléments enregistrés', 'إزالة من المحفوظات') : tr('Enregistrer', 'حفظ')} active={saved} onClick={onSave}><Bookmark size={27} className={saved ? 'fill-current' : ''} /></Action>
    </div>
  );
};
