/* One named React export per icon, plus the shared types.
 *
 * 1383 glyphs from the Iconoir pack (MIT), under Iconoir's own names.
 * 60 of the 93 commission names + 3 additive names are spelled
 * differently by Iconoir and are re-exported below as aliases, so a call site
 * written against the commission spelling keeps working unchanged.
 */
export { createIcon, ICON_SIZES } from "./icon-base";
export type { IconProps, IconSize, IconComponent } from "./icon-base";
export * from "./icons.generated";

export {
  Alarm as AlarmClock,
  BellOff as AlarmClockOff,
  UndoAction as ArchiveRestore,
  ArrowSeparateVertical as ArrowUpDown,
  Prohibition as Ban,
  Cash as Banknote,
  Building as Building2,
  CalendarRotate as CalendarClock,
  Calendar as CalendarDays,
  CalendarArrowDown as CalendarRange,
  CalendarRotate as CalendarSync,
  StatsReport as ChartNoAxesColumn,
  DoubleCheck as CheckCheck,
  NavArrowDown as ChevronDown,
  NavArrowLeft as ChevronLeft,
  NavArrowRight as ChevronRight,
  Sort as ChevronsUpDown,
  NavArrowUp as ChevronUp,
  Pause as CircleStop,
  Copy as ClipboardCopy,
  Reply as CornerDownRight,
  OpenNewWindow as ExternalLink,
  EyeClosed as EyeOff,
  Page as FileSpreadsheet,
  PageEdit as FileText,
  ClockRotateRight as History,
  Home as House,
  MailIn as Inbox,
  Key as KeyRound,
  Translate as Languages,
  BookStack as LibraryBig,
  Lifebelt as LifeBuoy,
  Link as Link2,
  NumberedListLeft as ListOrdered,
  TaskList as ListTodo,
  Refresh as Loader2,
  MoreHoriz as MoreHorizontal,
  SidebarCollapse as PanelLeftClose,
  SidebarExpand as PanelLeftOpen,
  Attachment as Paperclip,
  EditPencil as Pencil,
  Edit as PenLine,
  SwitchOff as Power,
  RefreshDouble as RefreshCw,
  Undo as RotateCcw,
  PathArrow as Route,
  SearchWindow as SearchX,
  Settings as Settings2,
  ShareAndroid as Share,
  ShieldBroken as ShieldOff,
  Sparks as Sparkles,
  OpenInWindow as SquareArrowOutUpRight,
  Trash as Trash2,
  WarningTriangle as TriangleAlert,
  Undo as Undo2,
  UserBadgeCheck as UserCheck,
  UserXmark as UserMinus,
  User as UserRound,
  Group as Users,
  VideoCamera as Video,
} from "./icons.generated";

/* THE KIT'S OWN CONTRACT, as data. The pack above is Iconoir's concern and its
 * size moves when the pack is re-vendored; these 96 spellings (93 commission
 * + 3 additive) are the kit's promise — the names the system and portal
 * call sites are written against. The generator refuses to emit if any of them
 * stops resolving; consumers (the demo's icon sheet) can re-verify at runtime
 * that every one is still an export of this module.
 */
export const KIT_ICON_NAMES = [
  "Pencil", "Power", "UserMinus", "Ban", "Plus", "Upload",
  "AlarmClock", "AlarmClockOff", "AppWindow", "ArchiveRestore", "Archive", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowUpDown", "ArrowUpRight", "BadgeCheck",
  "Banknote", "Building2", "CalendarClock", "CalendarDays", "CalendarRange", "CalendarSync",
  "ChartNoAxesColumn", "Check", "CheckCheck", "ChevronLeft", "ChevronRight", "ChevronsUpDown",
  "CircleStop", "ClipboardCheck", "ClipboardCopy", "Clock", "Copy", "CornerDownRight",
  "Download", "ExternalLink", "Eye", "EyeOff", "FileSpreadsheet", "FileText",
  "GitBranch", "Hammer", "History", "Home", "House", "Inbox",
  "KeyRound", "Languages", "LibraryBig", "LifeBuoy", "Link", "Link2",
  "ListOrdered", "ListTodo", "Loader2", "Lock", "LogOut", "Mail",
  "MailOpen", "MoreHorizontal", "Package", "Palette", "PanelLeftClose", "PanelLeftOpen",
  "Paperclip", "PenLine", "PiggyBank", "Play", "RefreshCw", "RotateCcw",
  "Route", "Search", "SearchX", "Send", "Settings", "Settings2",
  "Share", "Shield", "ShieldOff", "Sparkles", "SquareArrowOutUpRight", "Timer",
  "Trash2", "TriangleAlert", "Undo2", "UserCheck", "UserPlus", "UserRound",
  "Users", "Video", "X", "ChevronDown", "ChevronUp", "Star",
] as const;
