/** Compatibility entry only: legacy social Stories UI retired.
 * Existing deep links now show the same official editorial gallery.
 */
import React from 'react';
import { StoriesShowcase } from '../components/StoriesShowcase';
import type { StoryCta } from './types';
interface SocialProps { isAuthenticated: boolean; onRequireAuth: () => void; onCta: (cta: StoryCta) => void }
export const StoryTab: React.FC<SocialProps> = () => <StoriesShowcase />;
/** The old duplicate circle strip is no longer part of discovery. */
export const HomeStoryStrip: React.FC<SocialProps> = () => null;
