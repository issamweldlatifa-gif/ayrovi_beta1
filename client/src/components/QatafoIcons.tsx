import * as React from 'react';
import {
  createLucideIcon,
  type LucideProps,
  Sparkles,
  Eye,
  ShoppingCart,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ArrowRightLeft,
  Search,
  CircleUser,
  Package,
  ListFilter,
  ArrowUpDown,
  Ruler,
  Gift,
  EyeOff,
  Lock,
  Zap,
  Video,
  Clipboard,
  Plug,
  VolumeX,
  Handshake,
  Hourglass,
  Moon,
  SquarePen,
  ChartLine,
  RadioTower,
  Clock3,
  Plus,
  Minus,
  Trash2,
  Clock,
  CreditCard,
  CheckCircle2,
  MessageSquare,
  Star,
  ShieldCheck,
  Truck,
  MapPin,
  FileText,
  Mail,
  Phone,
  Bell,
  Percent,
  Info,
  Globe2,
  Loader2,
  Send,
  Check,
  AlertCircle,
  RefreshCw,
  LogOut,
  Pencil,
  Calendar,
  Link2,
  ExternalLink,
  MoreVertical,
  MoreHorizontal,
  Upload,
  Grid3X3,
  MessageCircle,
  Image,
  Camera,
  Barcode,
  Bookmark,
  Share2,
  Volume2,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Calculator,
  CircleDollarSign,
  PackageCheck,
  Palette,
  Save,
  Settings,
  Tag,
  Contact,
  History,
  LayoutDashboard,
  Box,
  ChartNoAxesColumnIncreasing,
  CircleGauge,
  LocateFixed,
  Building2,
  Users,
  ReceiptText,
  Megaphone,
  Pause,
  Square,
  Mic,
  SlidersHorizontal,
  DatabaseBackup,
  Bot,
  LayoutGrid,
  Monitor,
  MousePointer2,
  Navigation,
  RotateCcw,
  ScanSearch,
  Type,
} from 'lucide-react';

export type QatafoIconProps = LucideProps;
type AyroviIconNode = Parameters<typeof createLucideIcon>[1];

/**
 * AYROVI icon constructor.
 *
 * The 24 × 24 geometry and 1.75 unit monoline stroke are derived from the
 * AYROVI reference sheet. Callers can still override strokeWidth when a
 * specialised control genuinely needs it; colour always follows currentColor.
 */
function createAyroviIcon(name: string, nodes: AyroviIconNode) {
  const BaseIcon = createLucideIcon(name, nodes);
  const AyroviIcon = React.forwardRef<SVGSVGElement, QatafoIconProps>(
    ({ strokeWidth = 1.75, ...props }, ref) => (
      <BaseIcon ref={ref} strokeWidth={strokeWidth} {...props} />
    ),
  );
  AyroviIcon.displayName = name;
  return AyroviIcon;
}

/** Core AYROVI silhouettes rebuilt from the supplied visual reference. */
export const Home = createAyroviIcon('AyroviHome', [
  ['path', {
    d: 'M4 20V10.65c0-.62.26-1.2.72-1.61l6.14-5.47a1.72 1.72 0 0 1 2.28 0l6.14 5.47c.46.41.72.99.72 1.61V20h-5.5v-5.25c0-.83-.67-1.5-1.5-1.5h-2c-.83 0-1.5.67-1.5 1.5V20H4Z',
    key: 'ay-home',
  }],
]);

export const ShoppingBag = createAyroviIcon('AyroviShoppingBag', [
  ['path', {
    d: 'M6.2 8.25h11.6c1.12 0 2.04.88 2.1 2l.48 7.85a2.6 2.6 0 0 1-2.6 2.75H6.22a2.6 2.6 0 0 1-2.6-2.75l.48-7.85c.06-1.12.98-2 2.1-2Z',
    key: 'ay-bag-body',
  }],
  ['path', {
    d: 'M8.5 10V6.75a3.5 3.5 0 0 1 7 0V10',
    key: 'ay-bag-handle',
  }],
]);

export const ShoppingBagPlus = createAyroviIcon('AyroviShoppingBagPlus', [
  ['path', {
    d: 'M6.2 8.25h11.6c1.12 0 2.04.88 2.1 2l.48 7.85a2.6 2.6 0 0 1-2.6 2.75H6.22a2.6 2.6 0 0 1-2.6-2.75l.48-7.85c.06-1.12.98-2 2.1-2Z',
    key: 'ay-bag-plus-body',
  }],
  ['path', {
    d: 'M8.5 10V6.75a3.5 3.5 0 0 1 7 0V10',
    key: 'ay-bag-plus-handle',
  }],
  ['path', { d: 'M12 13.25v4.5M9.75 15.5h4.5', key: 'ay-bag-plus-mark' }],
]);

export const Menu = createAyroviIcon('AyroviMenu', [
  ['path', { d: 'M4 7h16', key: 'ay-menu-top' }],
  ['path', { d: 'M4 12h16', key: 'ay-menu-middle' }],
  ['path', { d: 'M4 17h16', key: 'ay-menu-bottom' }],
]);

export const Heart = createAyroviIcon('AyroviHeart', [
  ['path', {
    d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z',
    key: 'ay-heart',
  }],
]);

export const User = createAyroviIcon('AyroviUser', [
  ['circle', { cx: '12', cy: '7.5', r: '3.75', key: 'ay-user-head' }],
  ['path', {
    d: 'M4.75 20.25c.95-4.18 3.5-6.35 7.25-6.35s6.3 2.17 7.25 6.35',
    key: 'ay-user-shoulders',
  }],
]);

/** AYROVI fig mark — brand geometry stays custom rather than vendor-generic. */
export const FigLeaf = createAyroviIcon('AyroviFigLeaf', [
  ['path', {
    d: 'M12 20c-4.6 0-7.5-3.2-7.5-7.3C4.5 8.3 8.2 5.5 12 4c3.8 1.5 7.5 4.3 7.5 8.7 0 4.1-2.9 7.3-7.5 7.3Z',
    key: 'ay-fig',
  }],
  ['path', {
    d: 'M12 4v16M12 8.2c-1.8.8-3.1 2.2-3.8 4.1M12 8.2c1.8.8 3.1 2.2 3.8 4.1',
    key: 'ay-fig-veins',
  }],
]);

/** AYROVI Lens mark — retained as the product-specific symbol. */
export const LensBox = createAyroviIcon('AyroviLensBox', [
  ['path', {
    d: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3',
    key: 'frame',
  }],
  ['circle', { cx: '12', cy: '12', r: '4', key: 'lens' }],
  ['path', { d: 'm15 15 2.5 2.5', key: 'handle' }],
]);

/** AYROVI AI sparkle mark. */
export const AIOrb = createAyroviIcon('AyroviAIOrb', [
  ['path', { d: 'M12 2 13.4 7.1 18.5 8.5 13.4 9.9 12 15l-1.4-5.1-5.1-1.4 5.1-1.4L12 2Z', key: 'main' }],
  ['path', { d: 'm18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z', key: 'small' }],
]);

/** Compatibility name consumed by the existing AYROVI brand icon layer. */
export const AiMark = AIOrb;

/** Product result / tag mark. */
export const ResultTag = createAyroviIcon('AyroviResultTag', [
  ['path', { d: 'M4 4h7l9 9-7 7-9-9V4Z', key: 'tag' }],
  ['circle', { cx: '8.5', cy: '8.5', r: '1.25', key: 'dot' }],
]);

/** Motion mark used by the social story surface. */
export const VelocityMark = createAyroviIcon('AyroviVelocityMark', [
  ['path', { d: 'm4 6 5 12L12 9l3 6 5-9', key: 'mark' }],
]);

/** Filled forms are reserved for explicit selected/liked states. */
export const HeartFilled = React.forwardRef<SVGSVGElement, QatafoIconProps>((props, ref) => (
  <Heart ref={ref} {...props} fill="currentColor" />
));
HeartFilled.displayName = 'AyroviHeartFilled';

/** Compatibility alias retained for existing category views. */
export const Grid = Grid3X3;

/**
 * Remaining semantic symbols share the AYROVI rendering contract globally:
 * 24 × 24 canvas, 1.75 optical stroke, round caps/joins and currentColor.
 * Keeping this single gateway prevents visual drift across storefront,
 * customer account, AYROVIX and Admin.
 */
export {
  Sparkles,
  Eye,
  ShoppingCart,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ArrowRightLeft,
  Search,
  CircleUser,
  Package,
  ListFilter as Filter,
  ArrowUpDown,
  Ruler,
  Gift,
  EyeOff,
  Lock,
  Zap,
  Video,
  Clipboard,
  Plug,
  VolumeX,
  Handshake,
  Hourglass,
  Moon,
  SquarePen as PenSquare,
  ChartLine,
  RadioTower as Channels,
  Clock3,
  Plus,
  Minus,
  Trash2,
  Clock,
  CreditCard,
  CheckCircle2,
  MessageSquare,
  Star,
  ShieldCheck,
  Truck,
  MapPin,
  FileText,
  Mail,
  Phone,
  Bell,
  Percent,
  Info,
  Globe2,
  Loader2,
  Send,
  Check,
  AlertCircle,
  RefreshCw,
  LogOut,
  Pencil,
  Calendar,
  Link2,
  ExternalLink,
  MoreVertical,
  MoreHorizontal,
  Upload,
  Grid3X3,
  MessageCircle,
  Image,
  Camera,
  Barcode,
  Bookmark,
  Share2,
  Volume2,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Calculator,
  CircleDollarSign,
  PackageCheck,
  Palette,
  Save,
  Settings,
  Tag,
  Contact,
  History,
  LayoutDashboard,
  Box,
  ChartNoAxesColumnIncreasing,
  CircleGauge,
  LocateFixed,
  Building2,
  Users,
  ReceiptText,
  Megaphone,
  Pause,
  Square,
  Mic,
  SlidersHorizontal,
  DatabaseBackup,
  Bot,
  LayoutGrid,
  Monitor,
  MousePointer2,
  Navigation,
  RotateCcw,
  ScanSearch,
  Type,
};
