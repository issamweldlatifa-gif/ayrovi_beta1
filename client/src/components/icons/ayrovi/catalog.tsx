import * as React from 'react';
import { AYROVI_ICON_SIGNATURE, AyroviSignature, AyroviSvg, createAyroviIcon, type AyroviIconProps } from './AyroviIcon';
import { AyroviAI } from './AyroviAI';
import { AyroviBack } from './AyroviBack';
import { AyroviMenu } from './AyroviMenu';
import { AyroviProfile } from './AyroviProfile';
import { AyroviSearch } from './AyroviSearch';

export { AyroviAI, AyroviBack, AyroviMenu, AyroviProfile, AyroviSearch };

const S = AyroviSignature;
const A = AYROVI_ICON_SIGNATURE;

export const AyroviClose = createAyroviIcon('Close', <path d="M6 6l12 12M18 6 6 18" />);
export const AyroviOptions = createAyroviIcon('Options', (
  <>
    <circle cx="12" cy="6" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18" r="1.35" fill="currentColor" stroke="none" />
    <S cx={12} cy={12} />
  </>
));
export const AyroviHome = createAyroviIcon('Home', (
  <>
    <path d="M4.7 19.5V10.9L12 4.5l7.3 6.4v8.6H4.7Z" />
    <path d="M9.7 19.5v-3.7a2.3 2.3 0 0 1 4.6 0v3.7" />
    <S cx={14.5} cy={16.7} />
  </>
));
export const AyroviChevron = createAyroviIcon('Chevron', (
  <>
    <path d="M9 5.5 16 12 9 18.5" />
    <S cx={9} cy={18.5} />
  </>
));
export const AyroviPlus = createAyroviIcon('Plus', <path d="M12 5.5v13M5.5 12h13" />);
export const AyroviMinus = createAyroviIcon('Minus', <path d="M6 12h12" />);
export const AyroviEdit = createAyroviIcon('Edit', (
  <>
    <path d="M6.5 6.5h8.2L17.5 9.3v8.2H6.5z" />
    <path d="M10.2 14.8 16.4 8.6l1.5 1.5-6.2 6.2H10.2z" />
  </>
));
export const AyroviPencil = createAyroviIcon('Pencil', (
  <>
    <path d="M13.2 5.8 18.2 10.8 9.4 19.6H4.4v-5z" />
    <path d="m12.1 6.9 5 5" />
    <S cx={17.6} cy={8.2} />
  </>
));
export const AyroviTrash = createAyroviIcon('Trash', (
  <>
    <path d="M5 8h14" />
    <path d="M9.2 8V6.2h5.6V8" />
    <path d="M7.2 8v11.2h9.6V8" />
    <path d="M10.2 11v5.2M13.8 11v5.2" />
  </>
));
export const AyroviShare = createAyroviIcon('Share', (
  <>
    <circle cx="6.4" cy="12" r="2.15" />
    <circle cx="16.8" cy="6.4" r="2.15" />
    <circle cx="16.8" cy="17.6" r="2.15" />
    <path d="m8.3 10.9 4.8-3.2M8.3 13.1l4.8 3.2" />
    <S cx={16.8} cy={17.6} />
  </>
));
export const AyroviLock = createAyroviIcon('Lock', (
  <>
    <rect x="6" y="10.4" width="12" height="9.1" rx="2.2" />
    <path d="M8.4 10.4V8.1a3.6 3.6 0 0 1 7.2 0v2.3" />
    <circle cx="12" cy="14.7" r="1.05" />
  </>
));
export const AyroviLogout = createAyroviIcon('Logout', (
  <>
    <path d="M14.5 6.2H7.6A2.1 2.1 0 0 0 5.5 8.3v7.4a2.1 2.1 0 0 0 2.1 2.1h6.9" />
    <path d="M10.5 12H20" stroke={A} data-ayrovi-accent="true" />
    <path d="m16.6 8.6 3.4 3.4-3.4 3.4" stroke={A} data-ayrovi-accent="true" />
  </>
));
export const AyroviInfo = createAyroviIcon('Info', (
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 10.6v5.4M12 7.7h.01" />
    <S cx={17.4} cy={17.4} />
  </>
));
export const AyroviHeart = createAyroviIcon('Heart', (
  <>
    <path d="M12 19.4S4.6 14.2 4.6 9.6A3.85 3.85 0 0 1 12 8.1a3.85 3.85 0 0 1 7.4 1.5c0 4.6-7.4 9.8-7.4 9.8Z" />
    <S cx={16.6} cy={16.5} />
  </>
));
export const AyroviHeartFilled = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviHeartFilled(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="HeartFilled" {...props}>
      <path d="M12 19.4S4.6 14.2 4.6 9.6A3.85 3.85 0 0 1 12 8.1a3.85 3.85 0 0 1 7.4 1.5c0 4.6-7.4 9.8-7.4 9.8Z" fill="currentColor" />
      <S cx={16.6} cy={16.5} />
    </AyroviSvg>
  );
});
export const AyroviBag = createAyroviIcon('Bag', (
  <>
    <path d="M6.6 8.8h10.8a2.3 2.3 0 0 1 2.3 2.2l.45 8.1a2.35 2.35 0 0 1-2.35 2.45H6.2a2.35 2.35 0 0 1-2.35-2.45l.45-8.1a2.3 2.3 0 0 1 2.3-2.2Z" />
    <path d="M8.7 8.8V6.7a3.3 3.3 0 0 1 6.6 0v2.1" />
    <S cx={16.7} cy={17.6} />
  </>
));
export const AyroviBagPlus = createAyroviIcon('BagPlus', (
  <>
    <path d="M6.6 8.8h10.8a2.3 2.3 0 0 1 2.3 2.2l.45 8.1a2.35 2.35 0 0 1-2.35 2.45H6.2a2.35 2.35 0 0 1-2.35-2.45l.45-8.1a2.3 2.3 0 0 1 2.3-2.2Z" />
    <path d="M8.7 8.8V6.7a3.3 3.3 0 0 1 6.6 0v2.1" />
    <path d="M12 13.1v4.2M9.9 15.2h4.2" />
    <S cx={16.7} cy={17.6} />
  </>
));
export const AyroviCube = createAyroviIcon('Cube', (
  <>
    <path d="M12 4.6 19.2 8.4v7.2L12 19.4 4.8 15.6V8.4Z" />
    <path d="M12 19.4v-7.6M4.8 8.4 12 11.8 19.2 8.4" />
    <S cx={16.8} cy={16.6} />
  </>
));
export const AyroviEye = createAyroviIcon('Eye', (
  <>
    <path d="M3.3 12c2.1-4.1 5.1-6.1 8.7-6.1S18.6 7.9 20.7 12c-2.1 4.1-5.1 6.1-8.7 6.1S5.4 16.1 3.3 12Z" />
    <circle cx="12" cy="12" r="3.15" />
    <S cx={12} cy={12} />
  </>
));
export const AyroviLens = createAyroviIcon('Lens', (
  <>
    <path d="M8.4 3.7H5.5A1.8 1.8 0 0 0 3.7 5.5v2.9" />
    <path d="M15.6 3.7h2.9a1.8 1.8 0 0 1 1.8 1.8v2.9" />
    <path d="M8.4 20.3H5.5a1.8 1.8 0 0 1-1.8-1.8v-2.9" />
    <path d="M15.6 20.3h2.9a1.8 1.8 0 0 0 1.8-1.8v-2.9" />
    <circle cx="12" cy="12" r="4.05" />
    <S cx={16.35} cy={7.35} />
    <S cx={17.85} cy={9.05} />
  </>
));
export const AyroviChat = createAyroviIcon('Chat', (
  <>
    <path d="M19.6 11.2a7.6 7.6 0 0 1-7.7 7.5 8.8 8.8 0 0 1-3.3-.62L4.4 20.2l1.55-4.2A7.1 7.1 0 0 1 4.5 11.7 7.6 7.6 0 0 1 12.2 4.2a7.6 7.6 0 0 1 7.4 7Z" />
    <path d="M8.6 11.4h.01M12 11.4h.01M15.4 11.4h.01" />
  </>
));
export const AyroviMessage = createAyroviIcon('Message', (
  <>
    <path d="M6.2 4.6h11.6A2.6 2.6 0 0 1 20.4 7.2v7.2a2.6 2.6 0 0 1-2.6 2.6H9.4L4.8 20.4v-3.6A2.6 2.6 0 0 1 4.4 14.4V7.2A2.6 2.6 0 0 1 6.2 4.6Z" />
    <path d="M8.4 9.2h7.2M8.4 13h4.6" />
    <S cx={17.4} cy={7.2} />
  </>
));
export const AyroviPhone = createAyroviIcon('Phone', (
  <>
    <path d="M7.2 4.8h3.1l1.3 3.3-1.7 1.1a11.2 11.2 0 0 0 4.8 4.8l1.1-1.7 3.3 1.3v3.1a1.8 1.8 0 0 1-1.9 1.8A14.4 14.4 0 0 1 5.4 6.7 1.8 1.8 0 0 1 7.2 4.8Z" />
    <S cx={16.6} cy={17.4} />
  </>
));
export const AyroviMail = createAyroviIcon('Mail', (
  <>
    <rect x="3.6" y="6.2" width="16.8" height="11.6" rx="2.1" />
    <path d="m4.4 8.2 7.6 5.3 7.6-5.3" />
    <S cx={18} cy={16.6} />
  </>
));
export const AyroviShield = createAyroviIcon('Shield', (
  <>
    <path d="M12 3.4 19.2 6.4v5.1c0 4.4-3 7.6-7.2 9.2-4.2-1.6-7.2-4.8-7.2-9.2V6.4Z" />
    <path d="m8.6 12 2.2 2.2 4.6-4.7" />
    <S cx={16.6} cy={16.6} />
  </>
));
export const AyroviFile = createAyroviIcon('File', (
  <>
    <path d="M7 3.8h6.4L18.6 9v11.2H7A1.8 1.8 0 0 1 5.2 18.4V5.6A1.8 1.8 0 0 1 7 3.8Z" />
    <path d="M13.4 3.8V9h5.2M8.4 12.6h5.4M8.4 16.2h7.2" />
    <S cx={16.6} cy={18.4} />
  </>
));
export const AyroviGlobe = createAyroviIcon('Globe', (
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M3.8 12h16.4M12 3.8c2.2 2.4 3.4 5.2 3.4 8.2S14.2 18.8 12 20.2C9.8 18.8 8.6 16 8.6 12S9.8 6.2 12 3.8Z" />
    <S cx={17.4} cy={17.4} />
  </>
));
export const AyroviPercent = createAyroviIcon('Percent', (
  <>
    <circle cx="8" cy="8" r="2.15" />
    <circle cx="16" cy="16" r="2.15" />
    <path d="m17.6 5.6-11.2 12.8" />
    <S cx={17.8} cy={8.2} />
  </>
));
export const AyroviCamera = createAyroviIcon('Camera', (
  <>
    <path d="M5.4 8.2h2.1l1.3-2.1h6.4l1.3 2.1h2.1A1.9 1.9 0 0 1 20.5 10v7.3a1.9 1.9 0 0 1-1.9 1.9H5.4A1.9 1.9 0 0 1 3.5 17.3V10a1.9 1.9 0 0 1 1.9-1.8Z" />
    <circle cx="12" cy="13.4" r="3.05" />
    <S cx={17.6} cy={8.4} />
  </>
));
export const AyroviImage = createAyroviIcon('Image', (
  <>
    <rect x="3.8" y="5.2" width="16.4" height="13.6" rx="2.1" />
    <circle cx="9" cy="10" r="1.55" />
    <path d="m4.6 16.6 4.6-4.4 3.2 3.1 2.6-2.5 4.4 3.8" />
    <S cx={17.8} cy={8.2} />
  </>
));
export const AyroviLink = createAyroviIcon('Link', (
  <>
    <path d="M9.4 14.6 7.6 16.4a3.1 3.1 0 0 1-4.4-4.4L8 8.2a3.1 3.1 0 0 1 4.4 0" />
    <path d="M14.6 9.4 16.4 7.6a3.1 3.1 0 1 1 4.4 4.4L16 15.8a3.1 3.1 0 0 1-4.4 0" />
    <S cx={17.6} cy={17.4} />
  </>
));
export const AyroviZap = createAyroviIcon('Zap', <path d="M13.4 3.6 6.6 13.2h5.2L10.6 20.4 17.4 10.8h-5.2Z" />);
export const AyroviPlug = createAyroviIcon('Plug', (
  <>
    <path d="M9.2 6.2v3.4M14.8 6.2v3.4M7.6 9.6h8.8v3.2A4.4 4.4 0 0 1 12 17.2h0A4.4 4.4 0 0 1 7.6 12.8Z" />
    <path d="M12 17.2v3.2" />
    <S cx={12} cy={20.4} />
  </>
));
export const AyroviBell = createAyroviIcon('Bell', (
  <>
    <path d="M7.2 9.2a4.8 4.8 0 0 1 9.6 0c0 5.2 1.6 6.6 1.6 6.6H5.6s1.6-1.4 1.6-6.6Z" />
    <path d="M10.4 18.6a1.6 1.6 0 0 0 3.2 0" />
    <S cx={16.4} cy={7.4} />
  </>
));
export const AyroviPin = createAyroviIcon('Pin', (
  <>
    <path d="M18.8 9.6c0 4.9-6.8 10.6-6.8 10.6S5.2 14.5 5.2 9.6a6.8 6.8 0 0 1 13.6 0Z" />
    <circle cx="12" cy="9.6" r="2.2" />
    <S cx={16.2} cy={18.6} />
  </>
));
export const AyroviTruck = createAyroviIcon('Truck', (
  <>
    <path d="M3.6 6.4h10.6v9.2H3.6z" />
    <path d="M14.2 9.4h2.8l3.4 3.4v2.8h-6.2z" />
    <circle cx="7.2" cy="17.4" r="1.55" />
    <circle cx="17.2" cy="17.4" r="1.55" />
    <S cx={19.6} cy={9.6} />
  </>
));
export const AyroviCard = createAyroviIcon('Card', (
  <>
    <rect x="3.6" y="6.2" width="16.8" height="11.6" rx="2.1" />
    <path d="M3.6 10.4h16.8" />
    <S cx={17.8} cy={15.8} />
  </>
));
export const AyroviCopy = createAyroviIcon('Copy', (
  <>
    <rect x="8.2" y="8.2" width="11.2" height="11.2" rx="2" />
    <path d="M15.8 8.2V6.4A1.8 1.8 0 0 0 14 4.6H6.4A1.8 1.8 0 0 0 4.6 6.4V14a1.8 1.8 0 0 0 1.8 1.8h1.8" />
    <S cx={18} cy={8.6} />
  </>
));
export const AyroviChevronRight = createAyroviIcon('ChevronRight', <path d="M9 6.2 15.4 12 9 17.8" />);
export const AyroviChevronLeft = createAyroviIcon('ChevronLeft', <path d="M15 6.2 8.6 12 15 17.8" />);
export const AyroviChevronDown = createAyroviIcon('ChevronDown', <path d="M6.2 9 12 15.4 17.8 9" />);
export const AyroviChevronUp = createAyroviIcon('ChevronUp', <path d="M6.2 15 12 8.6 17.8 15" />);
export const AyroviCheck = createAyroviIcon('Check', <path d="m5.4 12.2 4.4 4.4 9-9.2" />);
export const AyroviSuccess = createAyroviIcon('Success', (
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="m8.2 12.2 2.4 2.4 5.2-5.4" />
    <S cx={17.4} cy={17.4} />
  </>
));
export const AyroviError = createAyroviIcon('Error', (
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
    <S cx={17.4} cy={17.4} />
  </>
));
export const AyroviAlert = createAyroviIcon('Alert', (
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 8v5.2M12 16.4h.01" />
    <S cx={17.4} cy={17.4} />
  </>
));
export const AyroviWarning = createAyroviIcon('Warning', (
  <>
    <path d="M12 4.6 20.6 19.4H3.4Z" />
    <path d="M12 10v4.2M12 16.8h.01" />
  </>
));
export const AyroviFilter = createAyroviIcon('Filter', (
  <>
    <path d="M5.2 5.6h13.6l-4.8 6.2v5.4L10.4 19v-7.2Z" />
    <S cx={12} cy={18.6} />
  </>
));
export const AyroviMoon = createAyroviIcon('Moon', (
  <>
    <path d="M15.4 4.8A7.8 7.8 0 1 0 19.2 14.6 6.2 6.2 0 0 1 15.4 4.8Z" />
    <S cx={16.6} cy={8.2} />
  </>
));
export const AyroviSun = createAyroviIcon('Sun', (
  <>
    <circle cx="12" cy="12" r="3.4" />
    <path d="M12 3.6v2.2M12 18.2v2.2M4.7 4.7l1.6 1.6M17.7 17.7l1.6 1.6M3.6 12h2.2M18.2 12h2.2M4.7 19.3l1.6-1.6M17.7 6.3l1.6-1.6" />
  </>
));
export const AyroviSettings = createAyroviIcon('Settings', (
  <>
    <circle cx="12" cy="12" r="3.05" />
    <path d="M12 3.6v2.1M12 18.3v2.1M4.7 7.6l1.8 1.1M17.5 15.3l1.8 1.1M4.7 16.4l1.8-1.1M17.5 8.7l1.8-1.1M3.6 12h2.1M18.3 12h2.1" />
    <S cx={17.4} cy={8.2} />
  </>
));
export const AyroviUsers = createAyroviIcon('Users', (
  <>
    <circle cx="9" cy="8" r="2.5" />
    <path d="M4.4 18.4c.7-3.4 2.6-5.1 4.6-5.1s3.9 1.7 4.6 5.1" />
    <circle cx="16.2" cy="8.6" r="2.05" />
    <path d="M15.2 13.4c1.7.2 3.2 1.6 3.8 5" />
    <S cx={18} cy={17.4} />
  </>
));
export const AyroviClock = createAyroviIcon('Clock', (
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 7.4V12l3.2 2" />
  </>
));
export const AyroviBookmark = createAyroviIcon('Bookmark', (
  <>
    <path d="M7.2 4.6h9.6v15.2L12 16.2 7.2 19.8Z" />
    <S cx={16.6} cy={17.8} />
  </>
));
export const AyroviCalculator = createAyroviIcon('Calculator', (
  <>
    <rect x="5.4" y="3.6" width="13.2" height="16.8" rx="2.1" />
    <rect x="7.4" y="6" width="9.2" height="3.2" rx="0.8" />
    <path d="M8.4 12.2h.01M12 12.2h.01M15.6 12.2h.01M8.4 15.6h.01M12 15.6h.01M15.6 15.6h.01" />
  </>
));
export const AyroviCalendar = createAyroviIcon('Calendar', (
  <>
    <rect x="4.2" y="5.6" width="15.6" height="14" rx="2" />
    <path d="M8 3.8v3.4M16 3.8v3.4M4.2 10.2h15.6" />
  </>
));
export const AyroviUpload = createAyroviIcon('Upload', (
  <>
    <path d="M12 16.6V5.6M8.2 9.2 12 5.6l3.8 3.6" stroke={A} data-ayrovi-accent="true" />
    <path d="M5.2 18.6h13.6" />
  </>
));
export const AyroviDownload = createAyroviIcon('Download', (
  <>
    <path d="M12 5.6v11M8.2 13 12 16.6 15.8 13" />
    <path d="M5.2 18.8h13.6" />
    <S cx={16.6} cy={16.6} />
  </>
));
export const AyroviArrowUp = createAyroviIcon('ArrowUp', <path d="M12 19.2V4.8M6.6 10.2 12 4.8l5.4 5.4" />);
export const AyroviArrowDown = createAyroviIcon('ArrowDown', <path d="M12 4.8v14.4M6.6 13.8 12 19.2l5.4-5.4" />);
export const AyroviArrowRight = createAyroviIcon('ArrowRight', <path d="M4.8 12h14.4M13.8 6.6 19.2 12l-5.4 5.4" />);
export const AyroviArrowUpRight = createAyroviIcon('ArrowUpRight', <path d="M7 17 17 7M8.2 7H17v8.8" />);
export const AyroviSwap = createAyroviIcon('Swap', (
  <>
    <path d="M4.4 8.2h15M16 5.2l3.4 3-3.4 3M19.6 15.8H4.6M8 12.8l-3.4 3 3.4 3" />
    <S cx={18.4} cy={8.2} />
  </>
));
export const AyroviGrid = createAyroviIcon('Grid', (
  <>
    <rect x="4" y="4" width="6.4" height="6.4" rx="1.3" />
    <rect x="13.6" y="4" width="6.4" height="6.4" rx="1.3" />
    <rect x="4" y="13.6" width="6.4" height="6.4" rx="1.3" />
    <rect x="13.6" y="13.6" width="6.4" height="6.4" rx="1.3" />
  </>
));
export const AyroviCode = createAyroviIcon('Code', (
  <>
    <rect x="4" y="4" width="6.2" height="6.2" rx="1.2" />
    <rect x="13.8" y="4" width="6.2" height="6.2" rx="1.2" />
    <rect x="4" y="13.8" width="6.2" height="6.2" rx="1.2" />
    <rect x="13.8" y="13.8" width="6.2" height="6.2" rx="1.2" />
    <S cx={20.2} cy={7.1} />
    <S cx={7.1} cy={20.2} />
  </>
));
export const AyroviHistory = createAyroviIcon('History', (
  <>
    <path d="M5.2 12a6.8 6.8 0 1 0 2-4.8" />
    <path d="M5.2 5.6v4.2h4.2" />
    <path d="M12 8.4V12l2.6 1.6" />
  </>
));
export const AyroviSquare = createAyroviIcon('Square', <rect x="5.2" y="5.2" width="13.6" height="13.6" rx="2.2" />);
export const AyroviPause = createAyroviIcon('Pause', (
  <>
    <rect x="7" y="5.4" width="3.2" height="13.2" rx="1" />
    <rect x="13.8" y="5.4" width="3.2" height="13.2" rx="1" />
  </>
));
export const AyroviMic = createAyroviIcon('Mic', (
  <>
    <rect x="9.2" y="4.4" width="5.6" height="9.2" rx="2.8" />
    <path d="M6.6 11.4a5.4 5.4 0 0 0 10.8 0M12 16.8v2.8" />
  </>
));
export const AyroviVolume = createAyroviIcon('Volume', (
  <>
    <path d="M5.2 9.4h3.2L12.6 6v12L8.4 14.6H5.2z" />
    <path d="M16 9.2a4 4 0 0 1 0 5.6M18.4 7.2a6.6 6.6 0 0 1 0 9.6" />
  </>
));
export const AyroviVolumeOff = createAyroviIcon('VolumeOff', (
  <>
    <path d="M5.2 9.4h3.2L12.6 6v12L8.4 14.6H5.2z" />
    <path d="m16 10 4 4M20 10l-4 4" />
  </>
));
export const AyroviLoader = createAyroviIcon('Loader', <path d="M12 4.2a7.8 7.8 0 1 1-6.6 3.7" />);
export const AyroviStar = createAyroviIcon('Star', <path d="M12 3.8 14.4 9l5.8.6-4.4 3.8 1.3 5.6L12 16.6 6.9 19l1.3-5.6L3.8 9.6 9.6 9Z" />);
export const AyroviTag = createAyroviIcon('Tag', (
  <>
    <path d="M4.4 4.4h7.1l8.3 8.3-7 7-8.4-8.4z" />
    <circle cx="8.4" cy="8.4" r="1.15" />
  </>
));
export const AyroviGift = createAyroviIcon('Gift', (
  <>
    <rect x="4.4" y="11" width="15.2" height="8.6" rx="1.4" />
    <path d="M4.4 11V8.2h15.2V11M12 8.2v11.4M9.2 8.2A2.2 2.2 0 1 1 12 6.4 2.2 2.2 0 1 1 14.8 8.2" />
  </>
));
export const AyroviPalette = createAyroviIcon('Palette', (
  <>
    <path d="M12 3.8a8.2 8.2 0 0 1 1.2 16.3 2.2 2.2 0 0 1-2.1-2.1 2.4 2.4 0 0 0-2.5-2.4H7.4A8.2 8.2 0 0 1 12 3.8Z" />
    <circle cx="9.2" cy="9" r="0.9" />
    <circle cx="12.6" cy="7.4" r="0.9" />
    <circle cx="15.6" cy="9.4" r="0.9" />
  </>
));
export const AyroviChart = createAyroviIcon('Chart', (
  <>
    <path d="M4.4 18.8h15.2" />
    <path d="m5.2 14.2 4.2-4.2 3.4 2.6 6-7.2" />
    <S cx={18.8} cy={5.4} />
  </>
));
export const AyroviClipboard = createAyroviIcon('Clipboard', (
  <>
    <rect x="6.2" y="5.6" width="11.6" height="14.4" rx="2" />
    <path d="M9.2 5.6V4.4h5.6v1.2" />
  </>
));
export const AyroviLocate = createAyroviIcon('Locate', (
  <>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 3.6v2.6M12 17.8v2.6M3.6 12h2.6M17.8 12h2.6" />
  </>
));
export const AyroviRefresh = createAyroviIcon('Refresh', (
  <>
    <path d="M19.2 12a7.2 7.2 0 1 1-2.1-5.1" />
    <path d="M19.2 4.8v4.4h-4.4" />
  </>
));
export const AyroviBarcode = createAyroviIcon('Barcode', (
  <>
    <path d="M5 6v12M8.2 6v12M10.4 6v12M14.2 6v12M16.4 6v12M19 6v12" />
  </>
));
export const AyroviHourglass = createAyroviIcon('Hourglass', <path d="M7.2 4.6h9.6v3.4L12 12l4.8 4v3.4H7.2V16L12 12 7.2 8Z" />);
export const AyroviExternal = createAyroviIcon('External', (
  <>
    <path d="M14 5.4h4.6V10" />
    <path d="M10.4 13.6 18.6 5.4" />
    <path d="M16.4 14.2v4.2H5.4V7.6h4.2" />
  </>
));
export const AyroviEyeOff = createAyroviIcon('EyeOff', (
  <>
    <path d="M4.2 4.2 19.8 19.8" />
    <path d="M9.4 9.5A3.2 3.2 0 0 0 12 15.2M14.7 14.4A3.2 3.2 0 0 0 12 8.8" />
    <path d="M6.2 6.8C4.4 8.2 3.2 12 3.2 12s3.3 5.3 8.8 5.3c1.3 0 2.5-.3 3.6-.7M17.6 16.6c2-1.3 3.2-4.6 3.2-4.6S17.5 6.7 12 6.7c-.7 0-1.4.1-2 .2" />
  </>
));
export const AyroviSend = createAyroviIcon('Send', <path d="M4.4 4.6 20 12 4.4 19.4 7.6 12Z" />);
export const AyroviSave = createAyroviIcon('Save', (
  <>
    <path d="M5.4 5.4h11.2L18.6 8.2v10.4H5.4z" />
    <path d="M8 18.6v-6.2h8v6.2M8 5.4v4.4h7.2" />
  </>
));
export const AyroviType = createAyroviIcon('Type', <path d="M5.4 6.2h13.2M12 6.2v11.6M8.4 17.8h7.2" />);
export const AyroviVideo = createAyroviIcon('Video', (
  <>
    <rect x="3.6" y="7" width="12.2" height="10" rx="2" />
    <path d="m15.8 10.4 4.6-2.2v7.6l-4.6-2.2z" />
  </>
));
export const AyroviMonitor = createAyroviIcon('Monitor', (
  <>
    <rect x="3.6" y="5" width="16.8" height="11.2" rx="1.8" />
    <path d="M8.4 19h7.2M12 16.2V19" />
  </>
));
export const AyroviBuilding = createAyroviIcon('Building', (
  <>
    <path d="M5.4 20.2V7.4L12 3.8l6.6 3.6v12.8z" />
    <path d="M9.2 20.2v-4.8h5.6v4.8" />
  </>
));
export const AyroviHandshake = createAyroviIcon('Handshake', <path d="M8 13.2 5.2 10.4 8.6 7 12 10.4l3.2-3.2 3.6 3.6-2.8 2.8M8 13.2l4 4.2 6.4-6.2" />);
export const AyroviMegaphone = createAyroviIcon('Megaphone', <path d="M4.6 11.2v1.6a2 2 0 0 0 2 2h.8l8.8 4V5.2L7.4 9.2H6.6a2 2 0 0 0-2 2Z" />);
export const AyroviPointer = createAyroviIcon('Pointer', <path d="m5.2 4.8 14 6.4-6.2 1.8-1.8 6.2z" />);
export const AyroviNav = createAyroviIcon('Nav', <path d="m4.6 12 15.2-7.4L12 19.4l-1.6-6.4z" />);
export const AyroviRuler = createAyroviIcon('Ruler', <path d="M4.4 15.2 15.2 4.4l4.4 4.4L8.8 19.6zM8 11.6l1.4 1.4M10.4 9.2l1.4 1.4M12.8 6.8l1.4 1.4" />);
export const AyroviUndo = createAyroviIcon('Undo', (
  <>
    <path d="M5.2 9.4h10.2A4.4 4.4 0 0 1 19.8 13.8v0A4.4 4.4 0 0 1 15.4 18.2H12" />
    <path d="M9.2 13.4 5.2 9.4 9.2 5.4" />
  </>
));
export const AyroviScan = createAyroviIcon('Scan', (
  <>
    <path d="M8 4.4H5.2A1.8 1.8 0 0 0 3.4 6.2V9M16 4.4h2.8A1.8 1.8 0 0 1 20.6 6.2V9M8 19.6H5.2A1.8 1.8 0 0 1 3.4 17.8V15M16 19.6h2.8a1.8 1.8 0 0 0 1.8-1.8V15" />
    <circle cx="12" cy="12" r="3.2" />
  </>
));
export const AyroviSliders = createAyroviIcon('Sliders', (
  <>
    <path d="M5 8h14M5 16h14" />
    <circle cx="9" cy="8" r="1.6" />
    <circle cx="15" cy="16" r="1.6" />
  </>
));
export const AyroviCart = createAyroviIcon('Cart', (
  <>
    <path d="M4.2 5.4h2.2l1.6 10.4h10.6" />
    <path d="M7.8 8.2h11.4l-1.2 6.2H8.6z" />
    <circle cx="9.6" cy="18.6" r="1.2" />
    <circle cx="16.4" cy="18.6" r="1.2" />
  </>
));
export const AyroviDollar = createAyroviIcon('Dollar', (
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 7.2v9.6M9.2 9.4c.6-1 1.6-1.6 2.8-1.6s2.4.8 2.4 2-1 2-2.6 2.4-2.8.8-2.8 2.4 1.4 2.2 3 2.2 2.4-.6 3-1.6" />
  </>
));
export const AyroviGauge = createAyroviIcon('Gauge', (
  <>
    <path d="M5.2 16.2a7.8 7.8 0 1 1 13.6 0" />
    <path d="m12 13.2 3.6-4.2" />
  </>
));
export const AyroviContact = createAyroviIcon('Contact', (
  <>
    <rect x="4.4" y="4.4" width="15.2" height="15.2" rx="2.2" />
    <circle cx="12" cy="10" r="2.2" />
    <path d="M7.6 17.2c.8-2.2 2.4-3.2 4.4-3.2s3.6 1 4.4 3.2" />
  </>
));
export const AyroviDatabase = createAyroviIcon('Database', (
  <>
    <ellipse cx="12" cy="6.4" rx="7" ry="2.4" />
    <path d="M5 6.4v11.2c0 1.3 3.1 2.4 7 2.4s7-1.1 7-2.4V6.4" />
    <path d="M5 12c0 1.3 3.1 2.4 7 2.4s7-1.1 7-2.4" />
  </>
));
export const AyroviLayout = createAyroviIcon('Layout', (
  <>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 10h16M10 10v10" />
  </>
));
export const AyroviRadio = createAyroviIcon('Radio', (
  <>
    <path d="M12 15.6a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z" />
    <path d="M7.4 8.2a7 7 0 0 1 9.2 0M5.2 5.8a10.2 10.2 0 0 1 13.6 0M12 15.6V20" />
  </>
));
export const AyroviBot = createAyroviIcon('Bot', (
  <>
    <rect x="5.2" y="7.4" width="13.6" height="10.4" rx="3" />
    <path d="M12 7.4V4.6M9.2 12.2h.01M14.8 12.2h.01" />
  </>
));
export const AyroviMoreHorizontal = createAyroviIcon('MoreHorizontal', (
  <>
    <circle cx="6" cy="12" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.25" fill="currentColor" stroke="none" />
  </>
));
export const AyroviBars = createAyroviIcon('Bars', (
  <>
    <path d="M7.2 18.4V11M12 18.4V6.4M16.8 18.4v-4.8" />
    <S cx={16.8} cy={13.6} />
  </>
));
export const AyroviReceipt = createAyroviIcon('Receipt', (
  <>
    <path d="M7 4.4h10v15.4l-1.6-1-1.6 1-1.6-1-1.6 1-1.6-1-1.6 1z" />
    <path d="M9.2 9h5.6M9.2 12.2h5.6M9.2 15.4h3.6" />
    <S cx={16.6} cy={18.4} />
  </>
));
export const AyroviThumbsUp = createAyroviIcon('ThumbsUp', <path d="M8 11.2V19H5.4v-7.8zm3 0h5.4l1.8-4.6H12V4.4L8 11.2" />);
export const AyroviThumbsDown = createAyroviIcon('ThumbsDown', <path d="M8 12.8V5H5.4v7.8zm3 0h5.4l1.8 4.6H12V19.6L8 12.8" />);
export const AyroviPackageCheck = createAyroviIcon('PackageCheck', (
  <>
    <path d="M4.8 8.2 12 4.6l7.2 3.6v4.6" />
    <path d="M4.8 8.2v7.6L12 19.4l3-1.6" />
    <path d="M12 11.8V19.4M4.9 8.3 12 11.8 19.1 8.3" />
    <path d="m14.8 16.6 1.7 1.7 3.4-3.8" />
  </>
));
export const AyroviHelp = createAyroviIcon('Help', (
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M9.6 9.4a2.4 2.4 0 1 1 3.2 2.2c-.8.4-1.2 1-1.2 1.8V14M12 16.8h.01" />
    <S cx={17.4} cy={17.4} />
  </>
));
export const AyroviHeadset = createAyroviIcon('Headset', (
  <>
    <path d="M5.4 13.2V12a6.6 6.6 0 0 1 13.2 0v1.2" />
    <path d="M5.4 13.2h2.4v5.2H5.4zM16.2 13.2h2.4v5.2h-2.4z" />
    <path d="M18.6 18.4h-3.2" />
    <S cx={16.8} cy={18.4} />
  </>
));
export const AyroviLogoMark = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviLogoMark({ className, strokeWidth: _s, ...props }, ref) {
  return (
    <svg ref={ref} viewBox="0 0 24 24" fill="currentColor" stroke="none" data-ayrovi-icon="Logo" className={['ayrovi-icon', className].filter(Boolean).join(' ')} {...props}>
      <path d="M1.9 21.6h6.05L12.15 2.5H6.55L1.9 21.6Z" />
      <path d="M17.55 2.5H12.2L16.05 21.6h6.05L17.55 2.5Z" />
      <circle cx="12" cy="15.55" r="2.15" fill={A} />
    </svg>
  );
});
