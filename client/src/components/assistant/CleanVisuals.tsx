import palette from '../../../../shared/cleanAppearance.json';
export const CLEAN = palette;
export function CleanWordmark() {
  return <span className="clean-wordmark" aria-label="clean">clea<span className="clean-wordmark-n">n<span aria-hidden="true" className="clean-star">✦</span></span></span>;
}
export function CleanActionGlyph({ state }: { state: 'wave' | 'send' | 'busy' | 'recording' }) {
  // Reviewed local brand-state geometry, not a replacement interface icon family.
  return <svg data-brand="clean-composer-state" width="44" height="44" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill={CLEAN.orange} d={CLEAN.actionShape} />
    {state === 'wave' ? <path d="M7 10V13M9.5 8V15M12 6V17M14.5 8V15M17 10V13" fill="none" stroke={CLEAN.paper} strokeWidth="1.3" strokeLinecap="round" /> : state === 'send' ? <path d="M12 17V7M8 11L12 7L16 11" stroke={CLEAN.paper} strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /> : state === 'busy' ? <circle cx="12" cy="11" r="2.7" fill={CLEAN.paper} /> : <rect x="8" y="7" width="8" height="8" fill={CLEAN.paper} />}
  </svg>;
}

export function CleanSpeakerIcon({ role }: { role: 'user' | 'assistant' }) {
  return <img src={`/media/clean/${role === 'user' ? 'customer' : 'assistant'}-speaker.png`} width={30} height={30} className="clean-speaker-icon" alt="" aria-hidden="true" />;
}
