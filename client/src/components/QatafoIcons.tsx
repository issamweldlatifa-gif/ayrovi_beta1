import React from 'react';
import {
  createLucideIcon,
  Heart as LucideHeart,
  type LucideProps,
} from 'lucide-react';

/**
 * AYROVI icon gateway.
 *
 * Every product/admin/social surface imports icons through this stable module,
 * while the implementation is backed by the maintained Lucide library. This
 * keeps stroke weight, viewBox, accessibility behaviour and future upgrades
 * consistent without coupling feature code to a vendor.
 */
export type QatafoIconProps = LucideProps;

export {
  Home,
  Search,
  LayoutGrid as Grid,
  ShoppingBag,
  Menu,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  BadgePlus as ShoppingBagPlus,
  ListFilter as Filter,
  ArrowUpDown,
  Star,
  Tag,
  Ruler,
  Gift,
  Truck,
  RefreshCw,
  Percent,
  User,
  Bell,
  Settings,
  LogOut,
  Trash2,
  Pencil,
  Camera,
  MessageSquare,
  MessageCircle,
  Eye,
  EyeOff,
  Lock,
  CreditCard,
  MapPin,
  Globe2,
  Plus,
  Minus,
  Check,
  Share2,
  Calendar,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  ArrowRightLeft,
  ShieldCheck,
  Sparkles,
  Zap,
  Package,
  Package as Box,
  PackageCheck,
  CircleAlert as AlertCircle,
  CircleCheck as CheckCircle2,
  LoaderCircle as Loader2,
  Phone,
  Copy,
  Calculator,
  Link2,
  Image,
  Video,
  Clipboard,
  Barcode,
  FileText,
  Plug,
  VolumeX,
  Volume2,
  Mic,
  Pause,
  Square,
  EllipsisVertical as MoreVertical,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  Clock3,
  History,
  Handshake,
  Hourglass,
  Moon,
  SquarePen as PenSquare,
  ChartLine,
  Palette,
  RadioTower as Channels,
} from 'lucide-react';

/** Filled social state that still follows the shared Lucide geometry. */
export const Heart: React.FC<QatafoIconProps> = (props) => <LucideHeart {...props} />;
export const HeartFilled: React.FC<QatafoIconProps> = (props) => (
  <LucideHeart {...props} fill="currentColor" />
);

/** AYROVI-specific brand marks use Lucide's own icon factory and contracts. */
export const FigLeaf = createLucideIcon('AyroviFigLeaf', [
  ['path', { d: 'M12 20c-4.6 0-7.5-3.2-7.5-7.3C4.5 8.3 8.2 5.5 12 4c3.8 1.5 7.5 4.3 7.5 8.7 0 4.1-2.9 7.3-7.5 7.3Z', key: 'fig' }],
  ['path', { d: 'M12 4v16M12 8.2c-1.8.8-3.1 2.2-3.8 4.1M12 8.2c1.8.8 3.1 2.2 3.8 4.1', key: 'veins' }],
]);

export const LensBox = createLucideIcon('AyroviLensBox', [
  ['path', { d: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3', key: 'corners' }],
  ['circle', { cx: '10.5', cy: '10.5', r: '3.5', key: 'lens' }],
  ['path', { d: 'm13.2 13.2 3.3 3.3', key: 'handle' }],
]);

export const AiMark = createLucideIcon('AyroviAiMark', [
  ['path', { d: 'm12 3 1.4 4.4a5.2 5.2 0 0 0 3.3 3.3L21 12l-4.3 1.3a5.2 5.2 0 0 0-3.3 3.3L12 21l-1.4-4.4a5.2 5.2 0 0 0-3.3-3.3L3 12l4.3-1.3a5.2 5.2 0 0 0 3.3-3.3L12 3Z', key: 'spark' }],
]);
