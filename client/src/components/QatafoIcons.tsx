import React, { forwardRef } from 'react';

/**
 * AYROVI interface icons rebuilt from the supplied Qatafo 24 × 24 icon system.
 * Every glyph shares the same 1.6 px outline, rounded caps/joins and currentColor palette.
 * A small set of app-specific glyphs extends the supplied collection using the same geometry.
 */
export type QatafoIconProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string;
};

type IconNode = React.ReactNode;

const createIcon = (name: string, nodes: IconNode) => {
  const Icon = forwardRef<SVGSVGElement, QatafoIconProps>(
    ({ size = 24, className, ...props }, ref) => (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={['qatafo-icon', className].filter(Boolean).join(' ')}
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {nodes}
      </svg>
    ),
  );
  Icon.displayName = name;
  return Icon;
};

// Navigation — supplied system.
export const Home = createIcon('Home', <>
  <path d="M4 11.3 12 4.5l8 6.8" />
  <path d="M6 9.8V19a1 1 0 0 0 1 1h3.2v-5.6h3.6V20H17a1 1 0 0 0 1-1V9.8" />
</>);

export const Search = createIcon('Search', <>
  <circle cx="10.8" cy="10.8" r="6.3" />
  <line x1="15.4" y1="15.4" x2="20.5" y2="20.5" />
</>);

export const Grid = createIcon('Grid', <>
  <rect x="4" y="4" width="6.6" height="6.6" rx="1.2" />
  <rect x="13.4" y="4" width="6.6" height="6.6" rx="1.2" />
  <rect x="4" y="13.4" width="6.6" height="6.6" rx="1.2" />
  <rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.2" />
</>);

export const ShoppingBag = createIcon('ShoppingBag', <>
  <path d="M6.8 8.2h10.4l1.1 11.3a1.2 1.2 0 0 1-1.2 1.3H6.9a1.2 1.2 0 0 1-1.2-1.3L6.8 8.2z" />
  <path d="M9.2 8.2V6.6a2.8 2.8 0 0 1 5.6 0v1.6" />
</>);

export const Heart = createIcon('Heart',
  <path d="M12 19.4c-3-1.9-8.1-5.4-8.1-9.9 0-2.6 2.1-4.5 4.5-4.5 1.6 0 3 .8 3.6 2.1.6-1.3 2-2.1 3.6-2.1 2.4 0 4.5 1.9 4.5 4.5 0 4.5-5.1 8-8.1 9.9z" />,
);

export const HeartFilled = createIcon('HeartFilled',
  <path d="M12 19.4c-3-1.9-8.1-5.4-8.1-9.9 0-2.6 2.1-4.5 4.5-4.5 1.6 0 3 .8 3.6 2.1.6-1.3 2-2.1 3.6-2.1 2.4 0 4.5 1.9 4.5 4.5 0 4.5-5.1 8-8.1 9.9z" fill="currentColor" stroke="none" />,
);

export const Menu = createIcon('Menu', <>
  <line x1="4.5" y1="7.5" x2="19.5" y2="7.5" />
  <line x1="4.5" y1="12" x2="19.5" y2="12" />
  <line x1="4.5" y1="16.5" x2="14" y2="16.5" />
</>);

export const ArrowLeft = createIcon('ArrowLeft', <path d="M14.5 6 8.5 12l6 6" />);
export const ArrowRight = createIcon('ArrowRight', <path d="M9.5 6l6 6-6 6" />);
export const ChevronLeft = ArrowLeft;
export const ChevronRight = ArrowRight;

export const ChevronDown = createIcon('ChevronDown', <path d="M6 9.5l6 6 6-6" />);
export const X = createIcon('X', <>
  <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
  <line x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
</>);

// Commerce and product — supplied system.
export const ShoppingBagPlus = createIcon('ShoppingBagPlus', <>
  <path d="M6.8 8.2h10.4l1.1 11.3a1.2 1.2 0 0 1-1.2 1.3H6.9a1.2 1.2 0 0 1-1.2-1.3L6.8 8.2z" />
  <path d="M9.2 8.2V6.6a2.8 2.8 0 0 1 5.6 0v1.6" />
  <line x1="12" y1="12" x2="12" y2="16.4" />
  <line x1="9.8" y1="14.2" x2="14.2" y2="14.2" />
</>);

export const Filter = createIcon('Filter', <>
  <line x1="4.5" y1="7" x2="19.5" y2="7" />
  <line x1="4.5" y1="12" x2="19.5" y2="12" />
  <line x1="4.5" y1="17" x2="19.5" y2="17" />
  <circle cx="8.5" cy="7" r="1.5" fill="currentColor" stroke="none" />
  <circle cx="15.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
  <circle cx="10.5" cy="17" r="1.5" fill="currentColor" stroke="none" />
</>);

export const ArrowUpDown = createIcon('ArrowUpDown', <>
  <line x1="6.5" y1="5.5" x2="6.5" y2="18.5" />
  <path d="M3.8 8.3 6.5 5.6l2.7 2.7" />
  <line x1="17.5" y1="18.5" x2="17.5" y2="5.5" />
  <path d="M20.2 15.7 17.5 18.4l-2.7-2.7" />
</>);

export const Star = createIcon('Star', <path d="M12 4.2 14.3 9l5.3.7-3.8 3.7.9 5.3L12 16.2l-4.7 2.5.9-5.3-3.8-3.7L9.7 9 12 4.2z" />);

export const Tag = createIcon('Tag', <>
  <path d="M12.4 4.4h5.4a1.8 1.8 0 0 1 1.8 1.8v5.4a1.8 1.8 0 0 1-.53 1.27l-8 8a1.8 1.8 0 0 1-2.54 0l-5.4-5.4a1.8 1.8 0 0 1 0-2.54l8-8a1.8 1.8 0 0 1 1.27-.53z" />
  <circle cx="15.6" cy="8.4" r="1.1" fill="currentColor" stroke="none" />
</>);

export const Ruler = createIcon('Ruler', <>
  <rect x="3.2" y="8.8" width="17.6" height="6.4" rx="1.2" transform="rotate(-15 12 12)" />
  <path d="M8 9.6l1 2M11.3 8.6l1 2M14.6 7.6l1 2" strokeWidth="1.4" />
</>);

export const Gift = createIcon('Gift', <>
  <rect x="4.5" y="10" width="15" height="9.4" rx="1.2" />
  <line x1="4.5" y1="13.6" x2="19.5" y2="13.6" />
  <line x1="12" y1="10" x2="12" y2="19.4" />
  <path d="M12 10c-.7-3-3-4.6-4.7-3.7-1.6.8-1 3.7 4.7 3.7z" />
  <path d="M12 10c.7-3 3-4.6 4.7-3.7 1.6.8 1 3.7-4.7 3.7z" />
</>);

export const Truck = createIcon('Truck', <>
  <rect x="2.8" y="7.8" width="10.6" height="8.2" rx="1" />
  <path d="M13.4 10.6h3.4l3.4 3.2v2.2h-6.8v-5.4z" />
  <circle cx="6.6" cy="17.6" r="1.5" />
  <circle cx="16.6" cy="17.6" r="1.5" />
</>);

export const RefreshCw = createIcon('RefreshCw', <>
  <path d="M4.8 12a7.2 7.2 0 0 1 12.2-5.1" />
  <path d="M19.2 12A7.2 7.2 0 0 1 7 17.1" />
  <path d="M16.2 4.8 17 7.4l-2.6.5" />
  <path d="M7.8 19.2 7 16.6l2.6-.5" />
</>);

export const Percent = createIcon('Percent', <>
  <circle cx="7.2" cy="7.2" r="2.4" />
  <circle cx="16.8" cy="16.8" r="2.4" />
  <line x1="6" y1="18" x2="18" y2="6" />
</>);

export const FigLeaf = createIcon('FigLeaf', <>
  <path d="M12 4.5c3.6 0 6.8 3 6.8 7.2 0 4.6-3.3 8-6.8 8.3-3.5-.3-6.8-3.7-6.8-8.3 0-4.2 3.2-7.2 6.8-7.2z" />
  <path d="M12 6.2v13.4M12 10.2c-1.6-.2-3-1-3.8-2.3M12 14.4c-2-.1-3.7-1.1-4.7-2.7M12 10.2c1.6-.2 3-1 3.8-2.3M12 14.4c2-.1 3.7-1.1 4.7-2.7" strokeWidth="1.3" />
</>);

// Account and system — supplied system.
export const User = createIcon('User', <>
  <circle cx="12" cy="8.2" r="3.2" />
  <path d="M5.3 19.4c1.2-3.5 3.9-5.4 6.7-5.4s5.5 1.9 6.7 5.4" />
</>);

export const Bell = createIcon('Bell', <>
  <path d="M6.4 10.2a5.6 5.6 0 0 1 11.2 0c0 3.7 1.4 5.2 1.4 5.2H5s1.4-1.5 1.4-5.2z" />
  <path d="M10.2 18.4a1.8 1.8 0 0 0 3.6 0" />
</>);

export const Settings = createIcon('Settings', <>
  <circle cx="12" cy="12" r="2.6" />
  <path d="M12 4.2v2M12 17.8v2M19.8 12h-2M6.2 12h-2M17.5 6.5l-1.4 1.4M7.9 16.1l-1.4 1.4M17.5 17.5l-1.4-1.4M7.9 7.9 6.5 6.5" />
</>);

export const LogOut = createIcon('LogOut', <>
  <path d="M10 4.5H6.8a1.3 1.3 0 0 0-1.3 1.3v12.4a1.3 1.3 0 0 0 1.3 1.3H10" />
  <path d="M14.8 8.2l3.8 3.8-3.8 3.8" />
  <line x1="18.4" y1="12" x2="9.6" y2="12" />
</>);

export const Trash2 = createIcon('Trash2', <path d="M5.2 7.4h13.6M9.4 7.4V5.6a1 1 0 0 1 1-1h3.2a1 1 0 0 1 1 1v1.8m-8.4 0 1.05 11.7a1.2 1.2 0 0 0 1.2 1.1h5.5a1.2 1.2 0 0 0 1.2-1.1L17.6 7.4" />);

export const Pencil = createIcon('Pencil', <>
  <path d="M4.5 19.5l.9-3.9L15.7 5.3a1.6 1.6 0 0 1 2.26 0l.74.74a1.6 1.6 0 0 1 0 2.26L8.4 18.6l-3.9.9z" />
  <line x1="14.2" y1="6.8" x2="17.2" y2="9.8" />
</>);

export const Camera = createIcon('Camera', <>
  <path d="M4.3 8.6a1 1 0 0 1 1-1H8l1.3-1.9h5.4L16 7.6h2.7a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H5.3a1 1 0 0 1-1-1V8.6z" />
  <circle cx="12" cy="13" r="3.1" />
</>);

export const MessageSquare = createIcon('MessageSquare', <path d="M4.5 5.8h15a1 1 0 0 1 1 1v8.4a1 1 0 0 1-1 1H9.3l-3.8 3.2v-3.2H4.5a1 1 0 0 1-1-1V6.8a1 1 0 0 1 1-1z" />);
export const MessageCircle = MessageSquare;

export const Eye = createIcon('Eye', <>
  <path d="M2.7 12S6.1 6 12 6s9.3 6 9.3 6-3.4 6-9.3 6-9.3-6-9.3-6z" />
  <circle cx="12" cy="12" r="2.5" />
</>);

export const EyeOff = createIcon('EyeOff', <>
  <path d="M4 4l16 16" />
  <path d="M10.1 6.4A9.8 9.8 0 0 1 12 6.2c5.9 0 9.3 5.8 9.3 5.8a15 15 0 0 1-2.9 3.6M6.9 8.1C4.5 9.8 2.7 12 2.7 12s3.4 5.8 9.3 5.8c.9 0 1.7-.15 2.5-.4" />
  <path d="M9.9 12a2.5 2.5 0 0 0 3.5 2.2" />
</>);

export const Lock = createIcon('Lock', <>
  <rect x="5.6" y="10.6" width="12.8" height="8.8" rx="1.6" />
  <path d="M8.2 10.6V7.8a3.8 3.8 0 0 1 7.6 0v2.8" />
  <circle cx="12" cy="14.8" r="1.15" fill="currentColor" stroke="none" />
</>);

export const CreditCard = createIcon('CreditCard', <>
  <rect x="2.8" y="6.2" width="18.4" height="11.6" rx="1.8" />
  <line x1="2.8" y1="9.8" x2="21.2" y2="9.8" />
  <line x1="5.6" y1="14.4" x2="9.6" y2="14.4" />
</>);

export const MapPin = createIcon('MapPin', <>
  <path d="M12 20.6c-2-2-6.4-6.8-6.4-11a6.4 6.4 0 0 1 12.8 0c0 4.2-4.4 9-6.4 11z" />
  <circle cx="12" cy="9.6" r="2.1" />
</>);

export const Globe2 = createIcon('Globe2', <>
  <circle cx="12" cy="12" r="8" />
  <ellipse cx="12" cy="12" rx="3.4" ry="8" />
  <line x1="4.2" y1="12" x2="19.8" y2="12" />
</>);

export const Plus = createIcon('Plus', <>
  <line x1="12" y1="5.5" x2="12" y2="18.5" />
  <line x1="5.5" y1="12" x2="18.5" y2="12" />
</>);

export const Minus = createIcon('Minus', <line x1="5.5" y1="12" x2="18.5" y2="12" />);
export const Check = createIcon('Check', <path d="M5 12.5l4.5 4.5L19 7.5" />);

export const Share2 = createIcon('Share2', <>
  <circle cx="17.5" cy="5.8" r="2.1" />
  <circle cx="6.5" cy="12" r="2.1" />
  <circle cx="17.5" cy="18.2" r="2.1" />
  <line x1="8.4" y1="10.8" x2="15.6" y2="7" />
  <line x1="8.4" y1="13.2" x2="15.6" y2="17" />
</>);

export const Calendar = createIcon('Calendar', <>
  <rect x="3.8" y="5.8" width="16.4" height="14.4" rx="1.6" />
  <line x1="3.8" y1="9.6" x2="20.2" y2="9.6" />
  <line x1="8.2" y1="3.8" x2="8.2" y2="7.4" />
  <line x1="15.8" y1="3.8" x2="15.8" y2="7.4" />
</>);

export const ArrowUpRight = createIcon('ArrowUpRight', <>
  <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
  <path d="M9.5 6.5h8v8" />
</>);

// App-specific extensions in the same Qatafo visual language.
export const ArrowUp = createIcon('ArrowUp', <path d="M6 14.5 12 8.5l6 6" />);
export const ArrowDown = createIcon('ArrowDown', <path d="m6 9.5 6 6 6-6" />);

export const ArrowRightLeft = createIcon('ArrowRightLeft', <>
  <path d="M5 8h14l-3-3M19 16H5l3 3" />
</>);

export const ShieldCheck = createIcon('ShieldCheck', <>
  <path d="M12 3.8c2.1 1.7 4.5 2.6 7 2.7v5.1c0 4.3-2.8 7.3-7 8.8-4.2-1.5-7-4.5-7-8.8V6.5c2.5-.1 4.9-1 7-2.7z" />
  <path d="m8.7 12.1 2.1 2.1 4.6-4.7" />
</>);

export const Sparkles = createIcon('Sparkles', <>
  <path d="M12.5 3.8c0 3.3 2.2 5.5 5.5 5.5-3.3 0-5.5 2.2-5.5 5.5 0-3.3-2.2-5.5-5.5-5.5 3.3 0 5.5-2.2 5.5-5.5z" />
  <path d="M18.2 14.2c0 1.8 1.2 3 3 3-1.8 0-3 1.2-3 3 0-1.8-1.2-3-3-3 1.8 0 3-1.2 3-3zM5.3 15.4c0 1.2.8 2 2 2-1.2 0-2 .8-2 2 0-1.2-.8-2-2-2 1.2 0 2-.8 2-2z" />
</>);

export const Package = createIcon('Package', <>
  <path d="m4.5 7.2 7.5-3.4 7.5 3.4v9.6L12 20.2l-7.5-3.4V7.2z" />
  <path d="m4.8 7.3 7.2 3.4 7.2-3.4M12 10.7v9.1" />
</>);
export const Box = Package;

export const PackageCheck = createIcon('PackageCheck', <>
  <path d="m4.5 7.2 7.5-3.4 7.5 3.4v9.6L12 20.2l-7.5-3.4V7.2z" />
  <path d="m4.8 7.3 7.2 3.4 7.2-3.4M12 10.7v3.1" />
  <path d="m9.1 16.3 1.8 1.8 4-4" />
</>);

export const AlertCircle = createIcon('AlertCircle', <>
  <circle cx="12" cy="12" r="8.3" />
  <line x1="12" y1="7.6" x2="12" y2="12.8" />
  <circle cx="12" cy="16.4" r=".7" fill="currentColor" stroke="none" />
</>);

export const CheckCircle2 = createIcon('CheckCircle2', <>
  <circle cx="12" cy="12" r="8.3" />
  <path d="m7.8 12.3 2.8 2.8 5.8-6" />
</>);

export const Loader2 = createIcon('Loader2', <>
  <path d="M20 12a8 8 0 1 1-2.35-5.65" />
  <path d="M17.7 3.8v3.1h-3.1" />
</>);

export const Phone = createIcon('Phone', <path d="M7.2 4.2 9.4 8 7.8 9.8c1.4 2.8 3.6 5 6.4 6.4l1.8-1.6 3.8 2.2-.6 2.7c-.2.8-.9 1.3-1.7 1.3C10.1 20.3 3.7 13.9 3.2 6.5c0-.8.5-1.5 1.3-1.7l2.7-.6z" />);

export const Copy = createIcon('Copy', <>
  <rect x="8" y="8" width="11.5" height="11.5" rx="1.5" />
  <path d="M16 8V5.8a1.3 1.3 0 0 0-1.3-1.3H5.8a1.3 1.3 0 0 0-1.3 1.3v8.9A1.3 1.3 0 0 0 5.8 16H8" />
</>);

export const Calculator = createIcon('Calculator', <>
  <rect x="5" y="3.5" width="14" height="17" rx="1.8" />
  <rect x="7.5" y="6" width="9" height="3.2" rx=".7" />
  <path d="M8 12.5h.1M12 12.5h.1M16 12.5h.1M8 16.5h.1M12 16.5h.1M16 16.5h.1" strokeWidth="2.3" />
</>);

export const Link2 = createIcon('Link2', <>
  <path d="M9.3 14.7 14.7 9.3" />
  <path d="m7.3 17.4-1 .9a3.5 3.5 0 0 1-4.9-4.9l3.1-3.1a3.5 3.5 0 0 1 4.9 0" />
  <path d="m16.7 6.6 1-.9a3.5 3.5 0 0 1 4.9 4.9l-3.1 3.1a3.5 3.5 0 0 1-4.9 0" />
</>);

export const Image = createIcon('Image', <>
  <rect x="3.5" y="4.5" width="17" height="15" rx="1.6" />
  <circle cx="9" cy="9" r="1.5" />
  <path d="m5.8 17 4.3-4.4 2.7 2.6 2.2-2.1 3.2 3.9" />
</>);

export const Clipboard = createIcon('Clipboard', <>
  <rect x="5.2" y="5.4" width="13.6" height="15" rx="1.5" />
  <path d="M9 6.7V5.3a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 5.3v1.4H9z" />
</>);

export const FileText = createIcon('FileText', <>
  <path d="M6 3.8h7l5 5v11.4H6V3.8z" />
  <path d="M13 3.8v5h5M9 13h6M9 16.5h6" />
</>);

export const Plug = createIcon('Plug', <>
  <path d="M8.5 4.2v4M15.5 4.2v4M6.5 8.2h11v2.2a5.5 5.5 0 0 1-11 0V8.2zM12 15.9v4" />
</>);

export const Mic = createIcon('Mic', <>
  <rect x="8.4" y="3.5" width="7.2" height="11.3" rx="3.6" />
  <path d="M5.7 11.8a6.3 6.3 0 0 0 12.6 0M12 18.1v2.4M9.2 20.5h5.6" />
</>);

export const Pause = createIcon('Pause', <>
  <rect x="7" y="5" width="3.2" height="14" rx=".8" fill="currentColor" stroke="none" />
  <rect x="13.8" y="5" width="3.2" height="14" rx=".8" fill="currentColor" stroke="none" />
</>);

export const Square = createIcon('Square', <rect x="6" y="6" width="12" height="12" rx="1.4" fill="currentColor" stroke="none" />);

export const MoreVertical = createIcon('MoreVertical', <>
  <circle cx="12" cy="5.5" r="1" fill="currentColor" stroke="none" />
  <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  <circle cx="12" cy="18.5" r="1" fill="currentColor" stroke="none" />
</>);

export const ThumbsUp = createIcon('ThumbsUp', <path d="M8 10.2 11.5 4c.4-.7 1.5-.4 1.5.4v4.1h5.5a1.7 1.7 0 0 1 1.6 2.2l-2 7.2a1.7 1.7 0 0 1-1.6 1.2H8m0-8.9H4.2v8.9H8v-8.9z" />);
export const ThumbsDown = createIcon('ThumbsDown', <path d="M8 13.8 11.5 20c.4.7 1.5.4 1.5-.4v-4.1h5.5a1.7 1.7 0 0 0 1.6-2.2l-2-7.2a1.7 1.7 0 0 0-1.6-1.2H8m0 8.9H4.2V4.9H8v8.9z" />);

export const Bookmark = createIcon('Bookmark', <path d="M6.2 4.2h11.6v16l-5.8-3.5-5.8 3.5v-16z" />);

export const Clock3 = createIcon('Clock3', <>
  <circle cx="12" cy="12" r="8.2" />
  <path d="M12 7.2v5.1l3.4 2" />
</>);

export const History = createIcon('History', <>
  <path d="M4.8 7.2A8.2 8.2 0 1 1 4 14" />
  <path d="M4.8 3.8v3.4h3.4M12 7.4V12l3 1.8" />
</>);

export const Handshake = createIcon('Handshake', <>
  <path d="m3.2 9 4-3 3 2.2 3-2.2 3.6 2.8" />
  <path d="m8 10.2 2.4-2a1.7 1.7 0 0 1 2.3.1l4.4 4.4a1.4 1.4 0 0 1-2 2l-3.3-3.3" />
  <path d="m3.2 9 4.6 6.3a1.4 1.4 0 0 0 2.1.2l1.1-1M2.8 7.5l2.6-1.9M21.2 7.5l-2.6-1.9" />
</>);

export const Hourglass = createIcon('Hourglass', <>
  <path d="M6.5 3.8h11M6.5 20.2h11M7.4 3.8c0 4.1 1.7 5.3 4.6 8.2-2.9 2.9-4.6 4.1-4.6 8.2M16.6 3.8c0 4.1-1.7 5.3-4.6 8.2 2.9 2.9 4.6 4.1 4.6 8.2" />
</>);

export const Moon = createIcon('Moon', <path d="M19.5 15.1A7.8 7.8 0 0 1 8.9 4.5 8.1 8.1 0 1 0 19.5 15.1z" />);

export const PenSquare = createIcon('PenSquare', <>
  <rect x="4" y="4" width="16" height="16" rx="2" />
  <path d="m8 16 .8-3.3 6.8-6.8a1.4 1.4 0 0 1 2 2l-6.8 6.8L8 16z" />
</>);

// AYROVI's two primary actions, normalized to the same 24 px system.
export const LensBox = createIcon('LensBox', <>
  <path d="M10 4H6a2 2 0 0 0-2 2v4M4 14v4a2 2 0 0 0 2 2h4M14 20h4a2 2 0 0 0 2-2v-4M20 10V6a2 2 0 0 0-2-2h-4" />
  <path d="M14.6 7.2c0 2.2 1.5 3.7 3.7 3.7-2.2 0-3.7 1.5-3.7 3.7 0-2.2-1.5-3.7-3.7-3.7 2.2 0 3.7-1.5 3.7-3.7z" />
  <path d="M8.1 12.8c0 1.3.8 2.1 2.1 2.1-1.3 0-2.1.8-2.1 2.1 0-1.3-.8-2.1-2.1-2.1 1.3 0 2.1-.8 2.1-2.1z" />
</>);

export const AiMark = createIcon('AiMark', <>
  <path d="M3.8 19.2 9.4 6.1a1 1 0 0 1 1.8 0l5.6 13.1M6.2 14h8.2" />
  <line x1="19.4" y1="9.2" x2="19.4" y2="19.2" />
  <circle cx="19.4" cy="5.8" r="1" fill="currentColor" stroke="none" />
</>);
