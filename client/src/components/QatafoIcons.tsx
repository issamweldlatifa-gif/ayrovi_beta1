import * as React from 'react';
import * as Lucide from 'lucide-react';

export type QatafoIconProps = React.ComponentPropsWithoutRef<typeof Lucide.Activity>;
type AyroviIconNode = Parameters<typeof Lucide.createLucideIcon>[1];
type LucideComponent = typeof Lucide.Activity;

const AYROVI_STROKE = 2;
export const AYROVI_ICON_SIGNATURE = '#FF6A00';
const iconClassName = (className?: string) => ['ayrovi-icon', className].filter(Boolean).join(' ');

type SignatureDot = { cx: number; cy: number };
type Signature = SignatureDot | SignatureDot[] | null | undefined;

function signatureNodes(dot: Signature): AyroviIconNode {
  if (!dot) return [];
  const dots = Array.isArray(dot) ? dot : [dot];
  return dots.map((item, index) => ['circle', {
    cx: String(item.cx), cy: String(item.cy), r: '1.35', fill: AYROVI_ICON_SIGNATURE, stroke: 'none',
    'data-ayrovi-signature': 'true', key: `signature-${index}`,
  }]);
}

function signatureCircles(dot: Signature) {
  if (!dot) return null;
  const dots = Array.isArray(dot) ? dot : [dot];
  return dots.map((item, index) => (
    <circle key={`signature-${index}`} cx={item.cx} cy={item.cy} r={1.35} fill={AYROVI_ICON_SIGNATURE} stroke="none" data-ayrovi-signature="true" />
  ));
}

/** Builds original AYROVI geometry on a strict 24 × 24 monoline contract. */
function createAyroviIcon(name: string, nodes: AyroviIconNode, signature?: Signature) {
  const BaseIcon = Lucide.createLucideIcon(name, [...nodes, ...signatureNodes(signature)]);
  const AyroviIcon = React.forwardRef<SVGSVGElement, QatafoIconProps>(
    ({ strokeWidth = AYROVI_STROKE, className, ...props }, ref) => (
      <BaseIcon
        ref={ref}
        data-ayrovi-icon={name}
        strokeWidth={strokeWidth}
        className={iconClassName(className)}
        {...props}
      />
    ),
  );
  AyroviIcon.displayName = name;
  return AyroviIcon;
}

/** Adapts secondary semantic geometry to the same AYROVI rendering contract. */
function adaptAyroviIcon(name: string, SourceIcon: LucideComponent, signature: Signature = { cx: 18.1, cy: 18.2 }) {
  const AyroviIcon = React.forwardRef<SVGSVGElement, QatafoIconProps>(
    ({ strokeWidth = AYROVI_STROKE, className, children, ...props }, ref) => (
      <SourceIcon
        ref={ref}
        data-ayrovi-icon={name}
        strokeWidth={strokeWidth}
        className={iconClassName(className)}
        {...props}
      >
        {signatureCircles(signature)}
        {children}
      </SourceIcon>
    ),
  );
  AyroviIcon.displayName = `Ayrovi${name}`;
  return AyroviIcon;
}

/** Core silhouettes rebuilt directly from the supplied AYROVI reference. */
export const Home = createAyroviIcon('Home', [
  ['path', {
    d: 'M4 20V10.65c0-.62.26-1.2.72-1.61l6.14-5.47a1.72 1.72 0 0 1 2.28 0l6.14 5.47c.46.41.72.99.72 1.61V20h-5.5v-5.25c0-.83-.67-1.5-1.5-1.5h-2c-.83 0-1.5.67-1.5 1.5V20H4Z',
    key: 'home',
  }],
], { cx: 12, cy: 18.4 });

export const ShoppingBag = createAyroviIcon('ShoppingBag', [
  ['path', {
    d: 'M6.2 8.25h11.6c1.12 0 2.04.88 2.1 2l.48 7.85a2.6 2.6 0 0 1-2.6 2.75H6.22a2.6 2.6 0 0 1-2.6-2.75l.48-7.85c.06-1.12.98-2 2.1-2Z',
    key: 'bag-body',
  }],
  ['path', { d: 'M8.5 10V6.75a3.5 3.5 0 0 1 7 0V10', key: 'bag-handle' }],
], { cx: 16.6, cy: 16.8 });

export const ShoppingBagPlus = createAyroviIcon('ShoppingBagPlus', [
  ['path', {
    d: 'M6.2 8.25h11.6c1.12 0 2.04.88 2.1 2l.48 7.85a2.6 2.6 0 0 1-2.6 2.75H6.22a2.6 2.6 0 0 1-2.6-2.75l.48-7.85c.06-1.12.98-2 2.1-2Z',
    key: 'bag-plus-body',
  }],
  ['path', { d: 'M8.5 10V6.75a3.5 3.5 0 0 1 7 0V10', key: 'bag-plus-handle' }],
  ['path', { d: 'M12 13.25v4.5M9.75 15.5h4.5', key: 'bag-plus-mark' }],
], { cx: 16.6, cy: 16.8 });

export const Menu = createAyroviIcon('Menu', [
  ['path', { d: 'M4 7h13.2', key: 'menu-top' }],
  ['path', { d: 'M4 12h13.2', key: 'menu-middle' }],
  ['path', { d: 'M4 17h13.2', key: 'menu-bottom' }],
], [{ cx: 19.4, cy: 7 }, { cx: 19.4, cy: 12 }, { cx: 19.4, cy: 17 }]);

export const Heart = createAyroviIcon('Heart', [
  ['path', {
    d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z',
    key: 'heart',
  }],
], { cx: 16.8, cy: 16.6 });

export const User = createAyroviIcon('User', [
  ['circle', { cx: '12', cy: '7.5', r: '3.75', key: 'user-head' }],
  ['path', { d: 'M4.75 20.25c.95-4.18 3.5-6.35 7.25-6.35s6.3 2.17 7.25 6.35', key: 'user-shoulders' }],
], { cx: 16.6, cy: 18.4 });

/** High-visibility public symbols redrawn as an AYROVI family. */
export const Eye = createAyroviIcon('Eye', [
  ['path', { d: 'M2.75 12s3.45-5.45 9.25-5.45S21.25 12 21.25 12 17.8 17.45 12 17.45 2.75 12 2.75 12Z', key: 'eye' }],
  ['circle', { cx: '12', cy: '12', r: '2.65', key: 'pupil' }],
], { cx: 17.8, cy: 16.6 });

export const MessageCircle = createAyroviIcon('MessageCircle', [
  ['path', { d: 'M20.5 11.3a8.15 8.15 0 0 1-8.35 8.15 9.7 9.7 0 0 1-3.55-.68L3.5 20.5l1.72-4.55a7.65 7.65 0 0 1-1.57-4.65 8.16 8.16 0 0 1 8.43-8.1 8.16 8.16 0 0 1 8.42 8.1Z', key: 'bubble' }],
  ['path', { d: 'M8 11.6h.01M12 11.6h.01M16 11.6h.01', key: 'dots' }],
], { cx: 17.6, cy: 7.4 });

export const MessageSquare = createAyroviIcon('MessageSquare', [
  ['path', { d: 'M6 4h12a3 3 0 0 1 3 3v7.5a3 3 0 0 1-3 3H9l-4.5 3v-4.05A3 3 0 0 1 3 14V7a3 3 0 0 1 3-3Z', key: 'message-square' }],
  ['path', { d: 'M8 9h8M8 13h5', key: 'message-lines' }],
], { cx: 17.6, cy: 7.2 });

export const Package = createAyroviIcon('Package', [
  ['path', { d: 'm4 7.5 8-4.5 8 4.5v9L12 21l-8-4.5v-9Z', key: 'package-body' }],
  ['path', { d: 'm4.25 7.55 7.75 4.4 7.75-4.4M12 11.95V21M8 5.25l8 4.55', key: 'package-folds' }],
], { cx: 16.8, cy: 17.4 });

export const PackageCheck = createAyroviIcon('PackageCheck', [
  ['path', { d: 'm3.5 7.5 8-4.5 8 4.5v5.25M3.5 7.5v9l8 4.5 3-1.7M3.75 7.55l7.75 4.4 7.75-4.4M11.5 11.95V21M7.5 5.25l8 4.55', key: 'package-check-box' }],
  ['path', { d: 'm15.25 17.25 1.8 1.8 3.7-4.1', key: 'package-check-mark' }],
]);

export const ShieldCheck = createAyroviIcon('ShieldCheck', [
  ['path', { d: 'M12 2.75 20 6v5.35c0 4.75-3.15 8.15-8 9.9-4.85-1.75-8-5.15-8-9.9V6l8-3.25Z', key: 'shield' }],
  ['path', { d: 'm8.25 11.8 2.35 2.35 5.15-5.15', key: 'shield-check' }],
], { cx: 16.8, cy: 16.8 });

export const Truck = createAyroviIcon('Truck', [
  ['path', { d: 'M3 6h11.5v10H3V6Zm11.5 3h3l3.5 3.7V16h-6.5V9Z', key: 'truck-body' }],
  ['circle', { cx: '7', cy: '17.75', r: '1.75', key: 'truck-wheel-left' }],
  ['circle', { cx: '18', cy: '17.75', r: '1.75', key: 'truck-wheel-right' }],
], { cx: 20.2, cy: 9.4 });

export const Sparkles = createAyroviIcon('Sparkles', [
  ['path', { d: 'M10.5 2.75 11.75 7a5.2 5.2 0 0 0 3.5 3.5l4.25 1.25L15.25 13a5.2 5.2 0 0 0-3.5 3.5l-1.25 4.25-1.25-4.25a5.2 5.2 0 0 0-3.5-3.5L1.5 11.75l4.25-1.25A5.2 5.2 0 0 0 9.25 7l1.25-4.25Z', key: 'spark-main' }],
  ['path', { d: 'm18.5 2.5.45 1.55L20.5 4.5l-1.55.45L18.5 6.5l-.45-1.55-1.55-.45 1.55-.45.45-1.55Z', key: 'spark-small' }],
], { cx: 18.6, cy: 4.6 });

export const ArrowRightLeft = createAyroviIcon('ArrowRightLeft', [
  ['path', { d: 'M4 8h15M16 5l3 3-3 3M20 16H5M8 13l-3 3 3 3', key: 'swap' }],
], { cx: 18.6, cy: 8.2 });

export const Percent = createAyroviIcon('Percent', [
  ['circle', { cx: '7.25', cy: '7.25', r: '2.25', key: 'percent-top' }],
  ['circle', { cx: '16.75', cy: '16.75', r: '2.25', key: 'percent-bottom' }],
  ['path', { d: 'm18.5 4.5-13 15', key: 'percent-slash' }],
], { cx: 18.4, cy: 8.2 });

export const FileText = createAyroviIcon('FileText', [
  ['path', { d: 'M6 2.75h7l5 5V21.25H6a2 2 0 0 1-2-2V4.75a2 2 0 0 1 2-2Z', key: 'file' }],
  ['path', { d: 'M13 2.75v5h5M8 12h6M8 16h8', key: 'file-details' }],
], { cx: 16.8, cy: 18.6 });

export const MapPin = createAyroviIcon('MapPin', [
  ['path', { d: 'M19.5 10c0 5.4-7.5 11.25-7.5 11.25S4.5 15.4 4.5 10a7.5 7.5 0 0 1 15 0Z', key: 'pin' }],
  ['circle', { cx: '12', cy: '10', r: '2.5', key: 'pin-dot' }],
], { cx: 16.4, cy: 18.8 });

export const Info = createAyroviIcon('Info', [
  ['circle', { cx: '12', cy: '12', r: '9.25', key: 'info-circle' }],
  ['path', { d: 'M12 10.5v6M12 7.5h.01', key: 'info-mark' }],
], { cx: 17.8, cy: 17.8 });

export const Globe2 = createAyroviIcon('Globe2', [
  ['circle', { cx: '12', cy: '12', r: '9.25', key: 'globe-circle' }],
  ['path', { d: 'M2.75 12h18.5M12 2.75c2.45 2.55 3.75 5.65 3.75 9.25S14.45 18.7 12 21.25C9.55 18.7 8.25 15.6 8.25 12S9.55 5.3 12 2.75Z', key: 'globe-grid' }],
], { cx: 17.8, cy: 17.6 });

export const Search = createAyroviIcon('Search', [
  ['circle', { cx: '10.75', cy: '10.75', r: '6.75', key: 'search-lens' }],
  ['path', { d: 'm15.75 15.75 4.25 4.25', key: 'search-handle' }],
], { cx: 19.6, cy: 19.6 });

export const X = createAyroviIcon('X', [
  ['path', { d: 'm5 5 14 14M19 5 5 19', key: 'close' }],
]);

/** Official AYSONIC A mark — filled, not the old fig leaf. */
export const FigLeaf = React.forwardRef<SVGSVGElement, QatafoIconProps>(({ className, strokeWidth: _strokeWidth, ...props }, ref) => (
  <svg
    ref={ref}
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="none"
    data-ayrovi-icon="FigLeaf"
    className={iconClassName(className)}
    {...props}
  >
    <path d="M1.9 21.6h6.05L12.15 2.5H6.55L1.9 21.6Z" />
    <path d="M17.55 2.5H12.2L16.05 21.6h6.05L17.55 2.5Z" />
    <circle cx="12" cy="15.55" r="2.15" fill="#FF6A00" />
  </svg>
));
FigLeaf.displayName = 'FigLeaf';

export const LensBox = createAyroviIcon('LensBox', [
  ['path', { d: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3', key: 'lens-frame' }],
  ['circle', { cx: '12', cy: '12', r: '4', key: 'lens' }],
], [{ cx: 16.6, cy: 7.4 }, { cx: 17.6, cy: 12 }, { cx: 16.6, cy: 16.6 }]);

export const AIOrb = createAyroviIcon('AIOrb', [
  ['path', { d: 'M12 2 13.4 7.1 18.5 8.5 13.4 9.9 12 15l-1.4-5.1-5.1-1.4 5.1-1.4L12 2Z', key: 'ai-main' }],
  ['path', { d: 'm18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z', key: 'ai-small' }],
], { cx: 19.4, cy: 6.2 });
export const AiMark = AIOrb;

export const ResultTag = createAyroviIcon('ResultTag', [
  ['path', { d: 'M4 4h7l9 9-7 7-9-9V4Z', key: 'tag' }],
  ['circle', { cx: '8.5', cy: '8.5', r: '1.25', key: 'tag-dot' }],
]);

export const VelocityMark = createAyroviIcon('VelocityMark', [
  ['path', { d: 'm4 6 5 12L12 9l3 6 5-9', key: 'velocity' }],
]);

export const HeartFilled = React.forwardRef<SVGSVGElement, QatafoIconProps>(({ className, ...props }, ref) => (
  <Heart ref={ref} className={className} {...props} fill="currentColor" />
));
HeartFilled.displayName = 'AyroviHeartFilled';

export const Grid = createAyroviIcon('Grid', [
  ['rect', { x: '3.5', y: '3.5', width: '6.5', height: '6.5', rx: '1.25', key: 'grid-1' }],
  ['rect', { x: '14', y: '3.5', width: '6.5', height: '6.5', rx: '1.25', key: 'grid-2' }],
  ['rect', { x: '3.5', y: '14', width: '6.5', height: '6.5', rx: '1.25', key: 'grid-3' }],
  ['rect', { x: '14', y: '14', width: '6.5', height: '6.5', rx: '1.25', key: 'grid-4' }],
]);

/**
 * Secondary symbols stay behind this gateway and receive an AYROVI wrapper,
 * data marker, 2px optical stroke, currentColor, signature dot and the global round contract.
 */
export const AlertCircle = adaptAyroviIcon('AlertCircle', Lucide.AlertCircle, { cx: 16.8, cy: 17.4 });
export const ArrowDown = adaptAyroviIcon('ArrowDown', Lucide.ArrowDown, { cx: 16.6, cy: 18.4 });
export const ArrowLeft = adaptAyroviIcon('ArrowLeft', Lucide.ArrowLeft, { cx: 6.2, cy: 16.6 });
export const ArrowRight = adaptAyroviIcon('ArrowRight', Lucide.ArrowRight);
export const ArrowUp = adaptAyroviIcon('ArrowUp', Lucide.ArrowUp);
export const ArrowUpDown = adaptAyroviIcon('ArrowUpDown', Lucide.ArrowUpDown);
export const ArrowUpRight = adaptAyroviIcon('ArrowUpRight', Lucide.ArrowUpRight);
export const Barcode = adaptAyroviIcon('Barcode', Lucide.Barcode);
export const Bell = adaptAyroviIcon('Bell', Lucide.Bell, { cx: 16.6, cy: 7.4 });
export const Bookmark = adaptAyroviIcon('Bookmark', Lucide.Bookmark);
export const Bot = adaptAyroviIcon('Bot', Lucide.Bot);
export const Box = adaptAyroviIcon('Box', Lucide.Box);
export const Building2 = adaptAyroviIcon('Building2', Lucide.Building2);
export const Calculator = adaptAyroviIcon('Calculator', Lucide.Calculator);
export const Calendar = adaptAyroviIcon('Calendar', Lucide.Calendar);
export const Camera = adaptAyroviIcon('Camera', Lucide.Camera, { cx: 17.8, cy: 8.2 });
export const Channels = adaptAyroviIcon('Channels', Lucide.RadioTower);
export const ChartLine = adaptAyroviIcon('ChartLine', Lucide.ChartLine);
export const ChartNoAxesColumnIncreasing = adaptAyroviIcon('ChartNoAxesColumnIncreasing', Lucide.ChartNoAxesColumnIncreasing);
export const Check = adaptAyroviIcon('Check', Lucide.Check);
export const CheckCircle2 = adaptAyroviIcon('CheckCircle2', Lucide.CheckCircle2, { cx: 17.6, cy: 17.6 });
export const ChevronDown = adaptAyroviIcon('ChevronDown', Lucide.ChevronDown);
export const ChevronLeft = adaptAyroviIcon('ChevronLeft', Lucide.ChevronLeft);
export const ChevronRight = adaptAyroviIcon('ChevronRight', Lucide.ChevronRight);
export const ChevronUp = adaptAyroviIcon('ChevronUp', Lucide.ChevronUp);
export const CircleDollarSign = adaptAyroviIcon('CircleDollarSign', Lucide.CircleDollarSign);
export const CircleGauge = adaptAyroviIcon('CircleGauge', Lucide.CircleGauge);
export const CircleUser = adaptAyroviIcon('CircleUser', Lucide.CircleUser);
export const Clipboard = adaptAyroviIcon('Clipboard', Lucide.Clipboard);
export const Clock = adaptAyroviIcon('Clock', Lucide.Clock);
export const Clock3 = adaptAyroviIcon('Clock3', Lucide.Clock3);
export const Contact = adaptAyroviIcon('Contact', Lucide.Contact);
export const Copy = adaptAyroviIcon('Copy', Lucide.Copy, { cx: 18.2, cy: 8.4 });
export const CreditCard = adaptAyroviIcon('CreditCard', Lucide.CreditCard, { cx: 18.2, cy: 16.8 });
export const DatabaseBackup = adaptAyroviIcon('DatabaseBackup', Lucide.DatabaseBackup);
export const ExternalLink = adaptAyroviIcon('ExternalLink', Lucide.ExternalLink);
export const EyeOff = adaptAyroviIcon('EyeOff', Lucide.EyeOff);
export const Filter = adaptAyroviIcon('Filter', Lucide.ListFilter, { cx: 12, cy: 18.6 });
export const Gift = adaptAyroviIcon('Gift', Lucide.Gift);
export const Grid3X3 = adaptAyroviIcon('Grid3X3', Lucide.Grid3X3);
export const Handshake = adaptAyroviIcon('Handshake', Lucide.Handshake);
export const History = adaptAyroviIcon('History', Lucide.History);
export const Hourglass = adaptAyroviIcon('Hourglass', Lucide.Hourglass);
export const Image = adaptAyroviIcon('Image', Lucide.Image, { cx: 17.8, cy: 8.2 });
export const LayoutDashboard = adaptAyroviIcon('LayoutDashboard', Lucide.LayoutDashboard);
export const LayoutGrid = adaptAyroviIcon('LayoutGrid', Lucide.LayoutGrid);
export const Link2 = adaptAyroviIcon('Link2', Lucide.Link2, { cx: 17.8, cy: 17.8 });
export const Loader2 = adaptAyroviIcon('Loader2', Lucide.Loader2);
export const LocateFixed = adaptAyroviIcon('LocateFixed', Lucide.LocateFixed);
export const Lock = adaptAyroviIcon('Lock', Lucide.Lock, { cx: 16.8, cy: 16.8 });
export const LogOut = adaptAyroviIcon('LogOut', Lucide.LogOut, { cx: 19.2, cy: 12 });
export const Mail = adaptAyroviIcon('Mail', Lucide.Mail, { cx: 18.2, cy: 16.8 });
export const Megaphone = adaptAyroviIcon('Megaphone', Lucide.Megaphone);
export const Mic = adaptAyroviIcon('Mic', Lucide.Mic);
export const Minus = adaptAyroviIcon('Minus', Lucide.Minus);
export const Monitor = adaptAyroviIcon('Monitor', Lucide.Monitor);
export const Moon = adaptAyroviIcon('Moon', Lucide.Moon, { cx: 16.8, cy: 8.2 });
export const MoreHorizontal = adaptAyroviIcon('MoreHorizontal', Lucide.MoreHorizontal);
export const MoreVertical = createAyroviIcon('MoreVertical', [
  ['circle', { cx: '12', cy: '6', r: '1.15', key: 'mv-1' }],
  ['circle', { cx: '12', cy: '18', r: '1.15', key: 'mv-3' }],
], { cx: 12, cy: 12 });
export const MousePointer2 = adaptAyroviIcon('MousePointer2', Lucide.MousePointer2);
export const Navigation = adaptAyroviIcon('Navigation', Lucide.Navigation);
export const Palette = adaptAyroviIcon('Palette', Lucide.Palette);
export const Pause = adaptAyroviIcon('Pause', Lucide.Pause);
export const PenSquare = adaptAyroviIcon('PenSquare', Lucide.SquarePen);
export const Pencil = adaptAyroviIcon('Pencil', Lucide.Pencil, { cx: 18.2, cy: 8.2 });
export const Phone = adaptAyroviIcon('Phone', Lucide.Phone, { cx: 16.8, cy: 17.6 });
export const Plug = adaptAyroviIcon('Plug', Lucide.Plug, { cx: 12, cy: 19.2 });
export const Plus = adaptAyroviIcon('Plus', Lucide.Plus, { cx: 16.4, cy: 16.4 });
export const ReceiptText = adaptAyroviIcon('ReceiptText', Lucide.ReceiptText);
export const RefreshCw = adaptAyroviIcon('RefreshCw', Lucide.RefreshCw);
export const RotateCcw = adaptAyroviIcon('RotateCcw', Lucide.RotateCcw);
export const Ruler = adaptAyroviIcon('Ruler', Lucide.Ruler);
export const Save = adaptAyroviIcon('Save', Lucide.Save);
export const ScanSearch = adaptAyroviIcon('ScanSearch', Lucide.ScanSearch);
export const Send = adaptAyroviIcon('Send', Lucide.Send);
export const Settings = adaptAyroviIcon('Settings', Lucide.Settings, { cx: 17.6, cy: 8.2 });
export const Share2 = adaptAyroviIcon('Share2', Lucide.Share2, { cx: 18.4, cy: 6.6 });
export const ShoppingCart = adaptAyroviIcon('ShoppingCart', Lucide.ShoppingCart);
export const SlidersHorizontal = adaptAyroviIcon('SlidersHorizontal', Lucide.SlidersHorizontal);
export const Square = adaptAyroviIcon('Square', Lucide.Square);
export const Star = adaptAyroviIcon('Star', Lucide.Star);
export const Tag = adaptAyroviIcon('Tag', Lucide.Tag);
export const ThumbsDown = adaptAyroviIcon('ThumbsDown', Lucide.ThumbsDown);
export const ThumbsUp = adaptAyroviIcon('ThumbsUp', Lucide.ThumbsUp);
export const Trash2 = adaptAyroviIcon('Trash2', Lucide.Trash2, { cx: 16.8, cy: 18.4 });
export const Type = adaptAyroviIcon('Type', Lucide.Type);
export const Upload = adaptAyroviIcon('Upload', Lucide.Upload, { cx: 16.8, cy: 7.2 });
export const Users = adaptAyroviIcon('Users', Lucide.Users, { cx: 18.2, cy: 17.6 });
export const Video = adaptAyroviIcon('Video', Lucide.Video);
export const Volume2 = adaptAyroviIcon('Volume2', Lucide.Volume2);
export const VolumeX = adaptAyroviIcon('VolumeX', Lucide.VolumeX);
export const Zap = adaptAyroviIcon('Zap', Lucide.Zap);
