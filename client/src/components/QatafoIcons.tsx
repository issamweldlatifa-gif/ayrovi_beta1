/**
 * QatafoIcons — porte d'entrée UNIQUE des icônes ZAYROVI.
 * Uniquement les noms réellement utilisés par l'UI (aucune export morte).
 * Les doublons conceptuels pointent vers UNE seule icône (ex: Grid = LayoutGrid).
 */
import type { ZayroviIconProps } from './icons/zayrovi';
import * as I from './icons/zayrovi/catalog';

export type QatafoIconProps = ZayroviIconProps;

/* Navigation */
export const Menu = I.ZayroviMenu;
export const ArrowLeft = I.ZayroviBack;
export const X = I.ZayroviClose;
export const MoreVertical = I.ZayroviOptions;
export const Home = I.ZayroviHome;
export const ChevronRight = I.ZayroviChevronRight;
export const ChevronLeft = I.ZayroviChevronLeft;
export const ChevronDown = I.ZayroviChevronDown;
export const Search = I.ZayroviSearch;
export const ArrowRight = I.ZayroviArrowRight;
export const ArrowUp = I.ZayroviArrowUp;
export const ArrowDown = I.ZayroviArrowDown;
export const ArrowUpRight = I.ZayroviArrowUpRight;
export const ArrowRightLeft = I.ZayroviSwap;
export const Navigation = I.ZayroviNav;

/* Action */
export const Plus = I.ZayroviPlus;
export const Minus = I.ZayroviMinus;
export const Story = I.ZayroviStory;
export const Person = I.ZayroviPerson;
export const Check = I.ZayroviCheck;
export const Pencil = I.ZayroviEdit;
export const PenSquare = I.ZayroviEdit;
export const Trash2 = I.ZayroviTrash;
export const Copy = I.ZayroviCopy;
export const Save = I.ZayroviSave;
export const Share2 = I.ZayroviShare;
export const RefreshCw = I.ZayroviRefresh;
export const RotateCcw = I.ZayroviUndo;
export const Loader2 = I.ZayroviLoader;
export const MousePointer2 = I.ZayroviPointer;
export const Square = I.ZayroviSquare;
export const Pause = I.ZayroviPause;

/* Commerce */
export const ShoppingBag = I.ZayroviBag;
export const Heart = I.ZayroviHeart;
export const HeartFilled = I.ZayroviHeartFilled;
export const Package = I.ZayroviCube;
export const Box = I.ZayroviCube;
export const PackageCheck = I.ZayroviPackageCheck;
export const Percent = I.ZayroviPercent;
export const Tag = I.ZayroviTag;
export const Gift = I.ZayroviGift;
export const Star = I.ZayroviStar;
export const CreditCard = I.ZayroviCard;
export const Bank = I.ZayroviBank;
export const Mail = I.ZayroviMail;
export const ReceiptText = I.ZayroviReceipt;
export const Truck = I.ZayroviTruck;
export const Calculator = I.ZayroviCalculator;
export const Clipboard = I.ZayroviClipboard;
export const History = I.ZayroviHistory;
export const ChartLine = I.ZayroviChart;

/* ZAYROVI AI / Lens / Vision */
export const Sparkles = I.ZayroviSparkles;
export const LensBox = I.ZayroviLens;
export const ScanSearch = I.ZayroviScan;
export const Eye = I.ZayroviEye;
export const EyeOff = I.ZayroviEyeOff;
export const Barcode = I.ZayroviBarcode;
export const Camera = I.ZayroviCamera;
export const Plug = I.ZayroviPlug;
export const Link2 = I.ZayroviLink;
export const Image = I.ZayroviImage;
export const Zap = I.ZayroviZap;

/* Communication */
export const MessageCircle = I.ZayroviChat;
export const MessageSquare = I.ZayroviMessage;
export const Phone = I.ZayroviPhone;
export const Bell = I.ZayroviBell;
export const Info = I.ZayroviInfo;
export const CheckCircle2 = I.ZayroviSuccess;
export const AlertCircle = I.ZayroviAlert;
export const ThumbsUp = I.ZayroviThumbsUp;
export const ThumbsDown = I.ZayroviThumbsDown;
export const Mic = I.ZayroviMic;
export const MicOff = I.ZayroviMicOff;
export const VoiceWave = I.ZayroviVoiceWave;
export const Video = I.ZayroviVideo;
export const Volume2 = I.ZayroviVolume;
export const VolumeX = I.ZayroviVolumeOff;

/* Compte */
export const User = I.ZayroviUser;
export const Lock = I.ZayroviLock;
export const LogOut = I.ZayroviLogout;
export const MapPin = I.ZayroviPin;
export const LocateFixed = I.ZayroviLocate;
export const ShieldCheck = I.ZayroviShield;
export const Moon = I.ZayroviMoon;
export const Settings = I.ZayroviSettings;
export const SlidersHorizontal = I.ZayroviSliders;
export const Grid = I.ZayroviGrid;
export const LayoutGrid = I.ZayroviGrid;
export const Bookmark = I.ZayroviBookmark;

/* Contenu */
export const FileText = I.ZayroviFile;
export const Calendar = I.ZayroviCalendar;
export const Type = I.ZayroviType;
export const Monitor = I.ZayroviMonitor;
export const Palette = I.ZayroviPalette;
export const Globe2 = I.ZayroviGlobe;
export const Hourglass = I.ZayroviHourglass;
export const ExternalLink = I.ZayroviExternal;

export const Play = I.ZayroviPlay;
export const Grip = I.ZayroviGrip;

/* Feature identity — not aliases for generic effects or password visibility. */
export const Sonim = I.ZayroviSonim;
export const Vision = I.ZayroviVision;
export const AyWebs = I.ZayroviAyWebs;
