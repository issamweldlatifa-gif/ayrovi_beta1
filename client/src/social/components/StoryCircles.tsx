import React from 'react';
import type { Story, StoryPublisher } from '../types';
import { useLocale } from '../../i18n/LocaleContext';

export interface StoryGroup {
  publisher: StoryPublisher;
  stories: Story[];
  hasUnseen: boolean;
}

export function groupByPublisher(stories: Story[]): StoryGroup[] {
  const order: StoryGroup[] = [];
  const byId = new Map<string, StoryGroup>();
  for (const story of stories) {
    let group = byId.get(story.publisher.id);
    if (!group) {
      group = { publisher: story.publisher, stories: [], hasUnseen: false };
      byId.set(story.publisher.id, group);
      order.push(group);
    }
    group.stories.push(story);
    if (!story.seen) group.hasUnseen = true;
  }
  order.sort((a, b) => Number(Boolean(b.publisher.official)) - Number(Boolean(a.publisher.official)));
  return order;
}

const Avatar: React.FC<{ publisher: StoryPublisher; size: number }> = ({ publisher, size }) => (
  publisher.official
    ? <img src="/media/logo-ayrovi-final.png" alt="" loading="lazy" className="h-full w-full bg-white p-1 object-contain" style={{ borderRadius: '50%' }} />
    : publisher.avatar
      ? <img src={publisher.avatar} alt="" loading="lazy" className="h-full w-full object-cover" style={{ borderRadius: '50%' }} />
      : <span className="grid h-full w-full place-items-center bg-surface-alt text-sm font-black text-ink" style={{ width: size, height: size, borderRadius: '50%' }}>{publisher.name.slice(0, 2).toUpperCase()}</span>
);

export const StoryCircle: React.FC<{ group: StoryGroup; onOpen: () => void }> = ({ group, onOpen }) => {
  const { tr } = useLocale();
  return <button type="button" onClick={onOpen} className="flex w-16 shrink-0 flex-col items-center gap-1.5" aria-label={tr(`Stories de ${group.publisher.name}`, `قصص ${group.publisher.name}`)}>
    <span className={`rounded-full p-[2.5px] ${group.hasUnseen ? 'bg-gradient-to-tr from-brand via-brand-light to-accent' : 'bg-line'}`}>
      <span className="block rounded-full bg-white p-[2px]">
        <Avatar publisher={group.publisher} size={54} />
      </span>
    </span>
    <span className="w-full truncate text-center text-[10px] font-bold text-ink">{group.publisher.name}</span>
  </button>;
};

export const StoryCircles: React.FC<{ groups: StoryGroup[]; onOpen: (index: number) => void }> = ({ groups, onOpen }) => {
  const { tr } = useLocale();
  return <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-4 pb-1 sm:px-6" role="list" aria-label={tr('Stories', 'القصص')}>
    {groups.map((group, index) => (
      <div role="listitem" key={group.publisher.id} className="shrink-0">
        <StoryCircle group={group} onOpen={() => onOpen(index)} />
      </div>
    ))}
  </div>;
};
