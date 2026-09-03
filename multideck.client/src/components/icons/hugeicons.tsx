import { forwardRef, type ForwardRefExoticComponent, type RefAttributes } from "react"
import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from "@hugeicons/react"
import {
  Activity03Icon as Activity03IconData,
  ActivityIcon as ActivityIconData,
  AudioWaveformIcon as AudioWaveformIconData,
  AiBeautifyIcon as AiBeautifyIconData,
  AiBrain01Icon as AiBrain01IconData,
  AiEditingIcon as AiEditingIconData,
  AlarmClockIcon as AlarmClockIconData,
  Alert02Icon as Alert02IconData,
  AlertCircleIcon as AlertCircleIconData,
  ArchiveIcon as ArchiveIconData,
  ArrowDataTransferHorizontalIcon as ArrowDataTransferHorizontalIconData,
  ArrowDownAZIcon as ArrowDownAZIconData,
  ArrowDownIcon as ArrowDownIconData,
  ArrowDownRightIcon as ArrowDownRightIconData,
  ArrowDownToLineIcon as ArrowDownToLineIconData,
  ArrowLeftIcon as ArrowLeftIconData,
  ArrowLeftRightIcon as ArrowLeftRightIconData,
  ArrowRightIcon as ArrowRightIconData,
  ArrowUpDownIcon as ArrowUpDownIconData,
  ArrowUpFromLineIcon as ArrowUpFromLineIconData,
  ArrowUpIcon as ArrowUpIconData,
  ArrowUpRightIcon as ArrowUpRightIconData,
  Attachment01Icon as Attachment01IconData,
  Award01Icon as Award01IconData,
  BadgeCheckIcon as BadgeCheckIconData,
  BanIcon as BanIconData,
  BarChartIcon as BarChartIconData,
  BellIcon as BellIconData,
  BellRingIcon as BellRingIconData,
  BookOpenIcon as BookOpenIconData,
  BookmarkIcon as BookmarkIconData,
  BotIcon as BotIconData,
  BoxesIcon as BoxesIconData,
  BracesIcon as BracesIconData,
  BrainCircuitIcon as BrainCircuitIconData,
  BrainIcon as BrainIconData,
  BriefcaseBusinessIcon as BriefcaseBusinessIconData,
  BriefcaseIcon as BriefcaseIconData,
  Building03Icon as Building03IconData,
  CalculatorIcon as CalculatorIconData,
  CalendarClockIcon as CalendarClockIconData,
  CalendarDaysIcon as CalendarDaysIconData,
  CameraIcon as CameraIconData,
  CameraMicrophone01Icon as CameraMicrophone01IconData,
  Cancel01Icon as Cancel01IconData,
  CancelCircleIcon as CancelCircleIconData,
  CargoShipIcon as CargoShipIconData,
  ChartAreaIcon as ChartAreaIconData,
  ChartAnalysisIcon as ChartAnalysisIconData,
  ChartBarStackedIcon as ChartBarStackedIconData,
  ChartColumnIcon as ChartColumnIconData,
  ChartIncreaseIcon as ChartIncreaseIconData,
  ChartLineIcon as ChartLineIconData,
  ChartNetworkIcon as ChartNetworkIconData,
  ChartNoAxesCombinedIcon as ChartNoAxesCombinedIconData,
  ChartScatterIcon as ChartScatterIconData,
  CheckCheckIcon as CheckCheckIconData,
  CheckIcon as CheckIconData,
  CheckListIcon as CheckListIconData,
  CheckmarkCircle02Icon as CheckmarkCircle02IconData,
  CheckmarkSquare02Icon as CheckmarkSquare02IconData,
  ChevronDownIcon as ChevronDownIconData,
  ChevronLeftIcon as ChevronLeftIconData,
  ChevronRightIcon as ChevronRightIconData,
  ChevronUpIcon as ChevronUpIconData,
  CircleCheckBigIcon as CircleCheckBigIconData,
  CircleCheckIcon as CircleCheckIconData,
  CircleDollarSignIcon as CircleDollarSignIconData,
  CircleGaugeIcon as CircleGaugeIconData,
  ClipboardCheckIcon as ClipboardCheckIconData,
  ClipboardIcon as ClipboardIconData,
  Clock03Icon as Clock03IconData,
  ClockIcon as ClockIconData,
  CloudIcon as CloudIconData,
  CloudUploadIcon as CloudUploadIconData,
  CombineIcon as CombineIconData,
  CommandIcon as CommandIconData,
  CompassIcon as CompassIconData,
  ComponentIcon as ComponentIconData,
  ComputerPhoneSyncIcon as ComputerPhoneSyncIconData,
  ContainerIcon as ContainerIconData,
  CopyIcon as CopyIconData,
  CornerDownLeftIcon as CornerDownLeftIconData,
  CornerUpLeftIcon as CornerUpLeftIconData,
  CornerUpRightIcon as CornerUpRightIconData,
  CpuIcon as CpuIconData,
  CreditCardIcon as CreditCardIconData,
  CursorPointer02Icon as CursorPointer02IconData,
  CustomerSupportIcon as CustomerSupportIconData,
  DashboardSquare01Icon as DashboardSquare01IconData,
  DatabaseIcon as DatabaseIconData,
  Delete02Icon as Delete02IconData,
  DotIcon as DotIconData,
  DownloadIcon as DownloadIconData,
  Edit03Icon as Edit03IconData,
  EditUser02Icon as EditUser02IconData,
  ExpandIcon as ExpandIconData,
  ExternalLinkIcon as ExternalLinkIconData,
  EyeIcon as EyeIconData,
  EyeOffIcon as EyeOffIconData,
  FileAddIcon as FileAddIconData,
  FileArchiveIcon as FileArchiveIconData,
  FileCheckIcon as FileCheckIconData,
  FileClockIcon as FileClockIconData,
  FileEditIcon as FileEditIconData,
  Facebook02Icon as Facebook02IconData,
  FileExclamationPointIcon as FileExclamationPointIconData,
  FileIcon as FileIconData,
  FileImageIcon as FileImageIconData,
  FileScanIcon as FileScanIconData,
  FileScriptIcon as FileScriptIconData,
  FileSpreadsheetIcon as FileSpreadsheetIconData,
  FileUpIcon as FileUpIconData,
  FilmIcon as FilmIconData,
  FilterHorizontalIcon as FilterHorizontalIconData,
  FilterIcon as FilterIconData,
  FilterRemoveIcon as FilterRemoveIconData,
  FlaskConicalIcon as FlaskConicalIconData,
  FolderAddIcon as FolderAddIconData,
  FolderIcon as FolderIconData,
  FolderInputIcon as FolderInputIconData,
  FolderOpenIcon as FolderOpenIconData,
  ForkliftIcon as ForkliftIconData,
  FunnelIcon as FunnelIconData,
  GaugeIcon as GaugeIconData,
  GitMergeIcon as GitMergeIconData,
  Globe02Icon as Globe02IconData,
  GlobeIcon as GlobeIconData,
  Grid2X2Icon as Grid2X2IconData,
  Grid3X3Icon as Grid3X3IconData,
  GripVerticalIcon as GripVerticalIconData,
  HandIcon as HandIconData,
  HandshakeIcon as HandshakeIconData,
  HardDriveIcon as HardDriveIconData,
  HelpCircleIcon as HelpCircleIconData,
  HistoryIcon as HistoryIconData,
  Home03Icon as Home03IconData,
  HouseIcon as HouseIconData,
  IdentityCardIcon as IdentityCardIconData,
  ImageAdd02Icon as ImageAdd02IconData,
  ImageIcon as ImageIconData,
  ImageUploadIcon as ImageUploadIconData,
  InboxIcon as InboxIconData,
  InformationCircleIcon as InformationCircleIconData,
  InstagramIcon as InstagramIconData,
  InputCursorTextIcon as InputCursorTextIconData,
  KanbanIcon as KanbanIconData,
  Key01Icon as Key01IconData,
  LandmarkIcon as LandmarkIconData,
  LanguageSquareIcon as LanguageSquareIconData,
  LaptopIcon as LaptopIconData,
  Layers01Icon as Layers01IconData,
  Layout03Icon as Layout03IconData,
  LayoutGridIcon as LayoutGridIconData,
  LayoutThreeColumnIcon as LayoutThreeColumnIconData,
  LayoutTopIcon as LayoutTopIconData,
  LeftToRightListNumberIcon as LeftToRightListNumberIconData,
  Linkedin02Icon as Linkedin02IconData,
  Link02Icon as Link02IconData,
  ListPlusIcon as ListPlusIconData,
  ListTreeIcon as ListTreeIconData,
  ListViewIcon as ListViewIconData,
  Loading03Icon as Loading03IconData,
  LockKeyIcon as LockKeyIconData,
  Logout03Icon as Logout03IconData,
  MagicWand02Icon as MagicWand02IconData,
  MailIcon as MailIconData,
  MailOpenIcon as MailOpenIconData,
  MailReplyIcon as MailReplyIconData,
  MailValidationIcon as MailValidationIconData,
  MailWarningIcon as MailWarningIconData,
  MapPinIcon as MapPinIconData,
  MapPinpointIcon as MapPinpointIconData,
  MapsIcon as MapsIconData,
  MapsOffIcon as MapsOffIconData,
  Maximize02Icon as Maximize02IconData,
  MegaphoneIcon as MegaphoneIconData,
  MenuIcon as MenuIconData,
  Message01Icon as Message01IconData,
  Message02Icon as Message02IconData,
  Minimize02Icon as Minimize02IconData,
  MinusSignIcon as MinusSignIconData,
  Moon02Icon as Moon02IconData,
  MoonIcon as MoonIconData,
  MoreHorizontalIcon as MoreHorizontalIconData,
  MusicNote02Icon as MusicNote02IconData,
  PackageAddIcon as PackageAddIconData,
  PackageDeliveredIcon as PackageDeliveredIconData,
  PackageIcon as PackageIconData,
  PackageRemoveIcon as PackageRemoveIconData,
  PaintBoardIcon as PaintBoardIconData,
  PanelLeftCloseIcon as PanelLeftCloseIconData,
  PanelLeftOpenIcon as PanelLeftOpenIconData,
  PanelRightCloseIcon as PanelRightCloseIconData,
  ParagraphIcon as ParagraphIconData,
  PauseCircleIcon as PauseCircleIconData,
  Pen01Icon as Pen01IconData,
  Pen02Icon as Pen02IconData,
  PencilEdit01Icon as PencilEdit01IconData,
  PieChartIcon as PieChartIconData,
  PinIcon as PinIconData,
  PinOffIcon as PinOffIconData,
  PlaneIcon as PlaneIconData,
  PlayCircleIcon as PlayCircleIconData,
  PlugIcon as PlugIconData,
  PlusSignIcon as PlusSignIconData,
  PresentationIcon as PresentationIconData,
  PrinterIcon as PrinterIconData,
  QrCodeIcon as QrCodeIconData,
  QuotesIcon as QuotesIconData,
  RadarIcon as RadarIconData,
  ReceiptTextIcon as ReceiptTextIconData,
  RefreshIcon as RefreshIconData,
  RotateLeftIcon as RotateLeftIconData,
  RouteIcon as RouteIconData,
  SaveIcon as SaveIconData,
  ScissorIcon as ScissorIconData,
  SearchIcon as SearchIconData,
  SearchRemoveIcon as SearchRemoveIconData,
  SecurityCheckIcon as SecurityCheckIconData,
  SecurityWarningIcon as SecurityWarningIconData,
  Sent02Icon as Sent02IconData,
  SentIcon as SentIconData,
  Settings02Icon as Settings02IconData,
  SettingsIcon as SettingsIconData,
  Share02Icon as Share02IconData,
  ShieldIcon as ShieldIconData,
  SignatureIcon as SignatureIconData,
  SlidersHorizontalIcon as SlidersHorizontalIconData,
  SmartPhone01Icon as SmartPhone01IconData,
  SortingAZ01Icon as SortingAZ01IconData,
  SparklesIcon as SparklesIconData,
  SplitIcon as SplitIconData,
  SquareDashedTopSolidIcon as SquareDashedTopSolidIconData,
  SquareIcon as SquareIconData,
  SquareUnlock02Icon as SquareUnlock02IconData,
  StarIcon as StarIconData,
  StickyNoteIcon as StickyNoteIconData,
  SunIcon as SunIconData,
  SunriseIcon as SunriseIconData,
  Table02Icon as Table02IconData,
  TagIcon as TagIconData,
  TagsIcon as TagsIconData,
  TargetIcon as TargetIconData,
  TelephoneIcon as TelephoneIconData,
  TestTube02Icon as TestTube02IconData,
  TextFontIcon as TextFontIconData,
  TicketIcon as TicketIconData,
  TruckIcon as TruckIconData,
  UploadIcon as UploadIconData,
  User03Icon as User03IconData,
  UserAdd02Icon as UserAdd02IconData,
  UserCheck02Icon as UserCheck02IconData,
  UserGroup03Icon as UserGroup03IconData,
  UserGroupIcon as UserGroupIconData,
  UserSearch02Icon as UserSearch02IconData,
  VideoIcon as VideoIconData,
  WalletCardsIcon as WalletCardsIconData,
  WalletIcon as WalletIconData,
  WarehouseIcon as WarehouseIconData,
  WebhookIcon as WebhookIconData,
  WhatsappIcon as WhatsappIconData,
  WorkflowSquare01Icon as WorkflowSquare01IconData,
  ZapIcon as ZapIconData,
} from "@hugeicons/core-free-icons"

export type MultideckIconProps = Omit<HugeiconsIconProps, "icon" | "altIcon"> & {
  altIcon?: IconSvgElement
}

export type LucideIcon = ForwardRefExoticComponent<MultideckIconProps & RefAttributes<SVGSVGElement>>
export type Hugeicon = LucideIcon

export function createMultideckIcon(icon: IconSvgElement, displayName: string): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, MultideckIconProps>(function MultideckHugeicon(
    { color = "currentColor", size = 24, strokeWidth = 1.5, ...props },
    ref,
  ) {
    const hasAccessibleName = Boolean(props["aria-label"] || props["aria-labelledby"])

    return (
      <HugeiconsIcon
        ref={ref}
        icon={icon}
        color={color}
        size={size}
        strokeWidth={strokeWidth}
        aria-hidden={props["aria-hidden"] ?? (hasAccessibleName ? undefined : true)}
        {...props}
      />
    )
  })
  Icon.displayName = displayName
  return Icon
}

export function MorphingIcon({
  from: From,
  to: To,
  active,
  className,
  strokeWidth = 1.5,
}: {
  from: LucideIcon
  to: LucideIcon
  active: boolean
  className?: string
  strokeWidth?: number
}) {
  const sharedClassName = "absolute inset-0 size-full transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"

  return (
    <span aria-hidden="true" className={`relative inline-grid shrink-0 place-items-center ${className ?? "size-4"}`}>
      <From
        className={`${sharedClassName} ${active ? "rotate-45 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
        strokeWidth={strokeWidth}
      />
      <To
        className={`${sharedClassName} ${active ? "rotate-0 scale-100 opacity-100" : "-rotate-45 scale-75 opacity-0"}`}
        strokeWidth={strokeWidth}
      />
    </span>
  )
}

export const AiBeautify = createMultideckIcon(AiBeautifyIconData, "AiBeautify")
export const AiBrain = createMultideckIcon(AiBrain01IconData, "AiBrain")
export const AiEditing = createMultideckIcon(AiEditingIconData, "AiEditing")
export const FacebookBrand = createMultideckIcon(Facebook02IconData, "FacebookBrand")
export const Forklift = createMultideckIcon(ForkliftIconData, "Forklift")
export const Home03 = createMultideckIcon(Home03IconData, "Home03")
export const InstagramBrand = createMultideckIcon(InstagramIconData, "InstagramBrand")
export const LinkedinBrand = createMultideckIcon(Linkedin02IconData, "LinkedinBrand")
export const WhatsappBrand = createMultideckIcon(WhatsappIconData, "WhatsappBrand")

export const Activity = createMultideckIcon(ActivityIconData, "Activity")
export const AudioWaveform = createMultideckIcon(AudioWaveformIconData, "AudioWaveform")
export const Health = createMultideckIcon(Activity03IconData, "Health")
export const AlarmClock = createMultideckIcon(AlarmClockIconData, "AlarmClock")
export const AlertCircle = createMultideckIcon(AlertCircleIconData, "AlertCircle")
export const AlertTriangle = createMultideckIcon(Alert02IconData, "AlertTriangle")
export const Archive = createMultideckIcon(ArchiveIconData, "Archive")
export const ArrowDown = createMultideckIcon(ArrowDownIconData, "ArrowDown")
export const ArrowDownAZ = createMultideckIcon(ArrowDownAZIconData, "ArrowDownAZ")
export const ArrowDownRight = createMultideckIcon(ArrowDownRightIconData, "ArrowDownRight")
export const ArrowDownToLine = createMultideckIcon(ArrowDownToLineIconData, "ArrowDownToLine")
export const ArrowLeft = createMultideckIcon(ArrowLeftIconData, "ArrowLeft")
export const ArrowLeftIcon = createMultideckIcon(ArrowLeftIconData, "ArrowLeftIcon")
export const ArrowLeftRight = createMultideckIcon(ArrowLeftRightIconData, "ArrowLeftRight")
export const ArrowRight = createMultideckIcon(ArrowRightIconData, "ArrowRight")
export const ArrowRightIcon = createMultideckIcon(ArrowRightIconData, "ArrowRightIcon")
export const ArrowRightLeft = createMultideckIcon(ArrowDataTransferHorizontalIconData, "ArrowRightLeft")
export const ArrowUp = createMultideckIcon(ArrowUpIconData, "ArrowUp")
export const ArrowUpAZ = createMultideckIcon(SortingAZ01IconData, "ArrowUpAZ")
export const ArrowUpDown = createMultideckIcon(ArrowUpDownIconData, "ArrowUpDown")
export const ArrowUpFromLine = createMultideckIcon(ArrowUpFromLineIconData, "ArrowUpFromLine")
export const ArrowUpRight = createMultideckIcon(ArrowUpRightIconData, "ArrowUpRight")
export const BadgeCheck = createMultideckIcon(BadgeCheckIconData, "BadgeCheck")
export const Ban = createMultideckIcon(BanIconData, "Ban")
export const BarChart3 = createMultideckIcon(BarChartIconData, "BarChart3")
export const Bell = createMultideckIcon(BellIconData, "Bell")
export const BellRing = createMultideckIcon(BellRingIconData, "BellRing")
export const BookOpen = createMultideckIcon(BookOpenIconData, "BookOpen")
export const Bookmark = createMultideckIcon(BookmarkIconData, "Bookmark")
export const Bot = createMultideckIcon(BotIconData, "Bot")
export const Boxes = createMultideckIcon(BoxesIconData, "Boxes")
export const Braces = createMultideckIcon(BracesIconData, "Braces")
export const BrainCircuit = createMultideckIcon(BrainCircuitIconData, "BrainCircuit")
export const BrainIcon = createMultideckIcon(BrainIconData, "BrainIcon")
export const Briefcase = createMultideckIcon(BriefcaseIconData, "Briefcase")
export const BriefcaseBusiness = createMultideckIcon(BriefcaseBusinessIconData, "BriefcaseBusiness")
export const Building2 = createMultideckIcon(Building03IconData, "Building2")
export const Calculator = createMultideckIcon(CalculatorIconData, "Calculator")
export const CalendarClock = createMultideckIcon(CalendarClockIconData, "CalendarClock")
export const CalendarDays = createMultideckIcon(CalendarDaysIconData, "CalendarDays")
export const Camera = createMultideckIcon(CameraIconData, "Camera")
export const Microphone = createMultideckIcon(CameraMicrophone01IconData, "Microphone")
export const ChartArea = createMultideckIcon(ChartAreaIconData, "ChartArea")
export const ChartAnalysis = createMultideckIcon(ChartAnalysisIconData, "ChartAnalysis")
export const ChartBar = createMultideckIcon(ChartColumnIconData, "ChartBar")
export const ChartBarStacked = createMultideckIcon(ChartBarStackedIconData, "ChartBarStacked")
export const ChartLine = createMultideckIcon(ChartLineIconData, "ChartLine")
export const ChartNoAxesCombined = createMultideckIcon(ChartNoAxesCombinedIconData, "ChartNoAxesCombined")
export const ChartPie = createMultideckIcon(PieChartIconData, "ChartPie")
export const ChartScatter = createMultideckIcon(ChartScatterIconData, "ChartScatter")
export const Check = createMultideckIcon(CheckIconData, "Check")
export const CheckCheck = createMultideckIcon(CheckCheckIconData, "CheckCheck")
export const CheckCircle2 = createMultideckIcon(CheckmarkCircle02IconData, "CheckCircle2")
export const CheckIcon = createMultideckIcon(CheckIconData, "CheckIcon")
export const ChevronDown = createMultideckIcon(ChevronDownIconData, "ChevronDown")
export const ChevronDownIcon = createMultideckIcon(ChevronDownIconData, "ChevronDownIcon")
export const ChevronLeft = createMultideckIcon(ChevronLeftIconData, "ChevronLeft")
export const ChevronLeftIcon = createMultideckIcon(ChevronLeftIconData, "ChevronLeftIcon")
export const ChevronRight = createMultideckIcon(ChevronRightIconData, "ChevronRight")
export const ChevronRightIcon = createMultideckIcon(ChevronRightIconData, "ChevronRightIcon")
export const ChevronUp = createMultideckIcon(ChevronUpIconData, "ChevronUp")
export const ChevronUpIcon = createMultideckIcon(ChevronUpIconData, "ChevronUpIcon")
export const CircleAlert = createMultideckIcon(AlertCircleIconData, "CircleAlert")
export const CircleCheck = createMultideckIcon(CircleCheckIconData, "CircleCheck")
export const CircleCheckBig = createMultideckIcon(CircleCheckBigIconData, "CircleCheckBig")
export const CircleDollarSign = createMultideckIcon(CircleDollarSignIconData, "CircleDollarSign")
export const CircleGauge = createMultideckIcon(CircleGaugeIconData, "CircleGauge")
export const CircleHelp = createMultideckIcon(HelpCircleIconData, "CircleHelp")
export const CirclePause = createMultideckIcon(PauseCircleIconData, "CirclePause")
export const CirclePlay = createMultideckIcon(PlayCircleIconData, "CirclePlay")
export const Clipboard = createMultideckIcon(ClipboardIconData, "Clipboard")
export const ClipboardCheck = createMultideckIcon(ClipboardCheckIconData, "ClipboardCheck")
export const Clock = createMultideckIcon(ClockIconData, "Clock")
export const Clock3 = createMultideckIcon(Clock03IconData, "Clock3")
export const Cloud = createMultideckIcon(CloudIconData, "Cloud")
export const Columns3 = createMultideckIcon(LayoutThreeColumnIconData, "Columns3")
export const Combine = createMultideckIcon(CombineIconData, "Combine")
export const Command = createMultideckIcon(CommandIconData, "Command")
export const Compass = createMultideckIcon(CompassIconData, "Compass")
export const Component = createMultideckIcon(ComponentIconData, "Component")
export const Container = createMultideckIcon(ContainerIconData, "Container")
export const Copy = createMultideckIcon(CopyIconData, "Copy")
export const CornerDownLeft = createMultideckIcon(CornerDownLeftIconData, "CornerDownLeft")
export const CornerUpLeft = createMultideckIcon(CornerUpLeftIconData, "CornerUpLeft")
export const CornerUpRight = createMultideckIcon(CornerUpRightIconData, "CornerUpRight")
export const Cpu = createMultideckIcon(CpuIconData, "Cpu")
export const CreditCard = createMultideckIcon(CreditCardIconData, "CreditCard")
export const Database = createMultideckIcon(DatabaseIconData, "Database")
export const DotIcon = createMultideckIcon(DotIconData, "DotIcon")
export const Download = createMultideckIcon(DownloadIconData, "Download")
export const Edit3 = createMultideckIcon(Edit03IconData, "Edit3")
export const EditUser02 = createMultideckIcon(EditUser02IconData, "EditUser02")
export const Expand = createMultideckIcon(ExpandIconData, "Expand")
export const ExternalLink = createMultideckIcon(ExternalLinkIconData, "ExternalLink")
export const Eye = createMultideckIcon(EyeIconData, "Eye")
export const EyeOff = createMultideckIcon(EyeOffIconData, "EyeOff")
export const File = createMultideckIcon(FileIconData, "File")
export const FileArchive = createMultideckIcon(FileArchiveIconData, "FileArchive")
export const FileCheck2 = createMultideckIcon(FileCheckIconData, "FileCheck2")
export const FileClock = createMultideckIcon(FileClockIconData, "FileClock")
export const FileImage = createMultideckIcon(FileImageIconData, "FileImage")
export const FilePenLine = createMultideckIcon(FileEditIconData, "FilePenLine")
export const FilePlus2 = createMultideckIcon(FileAddIconData, "FilePlus2")
export const FileSpreadsheet = createMultideckIcon(FileSpreadsheetIconData, "FileSpreadsheet")
export const FileText = createMultideckIcon(FileScriptIconData, "FileText")
export const FileUp = createMultideckIcon(FileUpIconData, "FileUp")
export const FileWarning = createMultideckIcon(FileExclamationPointIconData, "FileWarning")
export const Film = createMultideckIcon(FilmIconData, "Film")
export const Filter = createMultideckIcon(FilterIconData, "Filter")
export const FilterX = createMultideckIcon(FilterRemoveIconData, "FilterX")
export const FlaskConical = createMultideckIcon(FlaskConicalIconData, "FlaskConical")
export const Folder = createMultideckIcon(FolderIconData, "Folder")
export const FolderInput = createMultideckIcon(FolderInputIconData, "FolderInput")
export const FolderOpen = createMultideckIcon(FolderOpenIconData, "FolderOpen")
export const FolderPlus = createMultideckIcon(FolderAddIconData, "FolderPlus")
export const Funnel = createMultideckIcon(FunnelIconData, "Funnel")
export const Gauge = createMultideckIcon(GaugeIconData, "Gauge")
export const Globe = createMultideckIcon(GlobeIconData, "Globe")
export const Globe2 = createMultideckIcon(Globe02IconData, "Globe2")
export const Grid2X2 = createMultideckIcon(Grid2X2IconData, "Grid2X2")
export const Grid3X3 = createMultideckIcon(Grid3X3IconData, "Grid3X3")
export const GripVertical = createMultideckIcon(GripVerticalIconData, "GripVertical")
export const Hand = createMultideckIcon(HandIconData, "Hand")
export const Handshake = createMultideckIcon(HandshakeIconData, "Handshake")
export const HardDrive = createMultideckIcon(HardDriveIconData, "HardDrive")
export const History = createMultideckIcon(HistoryIconData, "History")
export const House = createMultideckIcon(HouseIconData, "House")
export const IdCard = createMultideckIcon(IdentityCardIconData, "IdCard")
export const Image = createMultideckIcon(ImageIconData, "Image")
export const ImagePlus = createMultideckIcon(ImageAdd02IconData, "ImagePlus")
export const ImageUp = createMultideckIcon(ImageUploadIconData, "ImageUp")
export const Inbox = createMultideckIcon(InboxIconData, "Inbox")
export const Info = createMultideckIcon(InformationCircleIconData, "Info")
export const KanbanSquare = createMultideckIcon(KanbanIconData, "KanbanSquare")
export const KeyRound = createMultideckIcon(Key01IconData, "KeyRound")
export const Landmark = createMultideckIcon(LandmarkIconData, "Landmark")
export const Languages = createMultideckIcon(LanguageSquareIconData, "Languages")
export const Laptop = createMultideckIcon(LaptopIconData, "Laptop")
export const Layers3 = createMultideckIcon(Layers01IconData, "Layers3")
export const LayoutDashboard = createMultideckIcon(DashboardSquare01IconData, "LayoutDashboard")
export const LayoutGrid = createMultideckIcon(LayoutGridIconData, "LayoutGrid")
export const LayoutPanelTop = createMultideckIcon(LayoutTopIconData, "LayoutPanelTop")
export const LayoutTemplate = createMultideckIcon(Layout03IconData, "LayoutTemplate")
export const LifeBuoy = createMultideckIcon(CustomerSupportIconData, "LifeBuoy")
export const Link2 = createMultideckIcon(Link02IconData, "Link2")
export const List = createMultideckIcon(ListViewIconData, "List")
export const ListChecks = createMultideckIcon(CheckListIconData, "ListChecks")
export const ListFilter = createMultideckIcon(FilterHorizontalIconData, "ListFilter")
export const ListOrdered = createMultideckIcon(LeftToRightListNumberIconData, "ListOrdered")
export const ListPlus = createMultideckIcon(ListPlusIconData, "ListPlus")
export const ListTree = createMultideckIcon(ListTreeIconData, "ListTree")
export const Loader2 = createMultideckIcon(Loading03IconData, "Loader2")
export const Loader2Icon = createMultideckIcon(Loading03IconData, "Loader2Icon")
export const LoaderCircle = createMultideckIcon(Loading03IconData, "LoaderCircle")
export const LockKeyhole = createMultideckIcon(LockKeyIconData, "LockKeyhole")
export const LogOut = createMultideckIcon(Logout03IconData, "LogOut")
export const Mail = createMultideckIcon(MailIconData, "Mail")
export const MailCheck = createMultideckIcon(MailValidationIconData, "MailCheck")
export const MailOpen = createMultideckIcon(MailOpenIconData, "MailOpen")
export const MailWarning = createMultideckIcon(MailWarningIconData, "MailWarning")
export const Map = createMultideckIcon(MapsIconData, "Map")
export const MapPin = createMultideckIcon(MapPinIconData, "MapPin")
export const MapPinOff = createMultideckIcon(MapsOffIconData, "MapPinOff")
export const MapPinned = createMultideckIcon(MapPinpointIconData, "MapPinned")
export const Maximize2 = createMultideckIcon(Maximize02IconData, "Maximize2")
export const Megaphone = createMultideckIcon(MegaphoneIconData, "Megaphone")
export const Menu = createMultideckIcon(MenuIconData, "Menu")
export const Merge = createMultideckIcon(GitMergeIconData, "Merge")
export const MessageCircle = createMultideckIcon(Message01IconData, "MessageCircle")
export const MessageSquareText = createMultideckIcon(Message02IconData, "MessageSquareText")
export const Minimize2 = createMultideckIcon(Minimize02IconData, "Minimize2")
export const Minus = createMultideckIcon(MinusSignIconData, "Minus")
export const MonitorSmartphone = createMultideckIcon(ComputerPhoneSyncIconData, "MonitorSmartphone")
export const Moon = createMultideckIcon(MoonIconData, "Moon")
export const Moon02 = createMultideckIcon(Moon02IconData, "Moon02")
export const MoonStar = createMultideckIcon(Moon02IconData, "MoonStar")
export const MoreHorizontal = createMultideckIcon(MoreHorizontalIconData, "MoreHorizontal")
export const MoreHorizontalIcon = createMultideckIcon(MoreHorizontalIconData, "MoreHorizontalIcon")
export const MousePointerClick = createMultideckIcon(CursorPointer02IconData, "MousePointerClick")
export const Music = createMultideckIcon(MusicNote02IconData, "Music")
export const Network = createMultideckIcon(ChartNetworkIconData, "Network")
export const Package = createMultideckIcon(PackageIconData, "Package")
export const PackageCheck = createMultideckIcon(PackageDeliveredIconData, "PackageCheck")
export const PackageMinus = createMultideckIcon(PackageRemoveIconData, "PackageMinus")
export const PackagePlus = createMultideckIcon(PackageAddIconData, "PackagePlus")
export const Palette = createMultideckIcon(PaintBoardIconData, "Palette")
export const PanelLeftClose = createMultideckIcon(PanelLeftCloseIconData, "PanelLeftClose")
export const PanelLeftOpen = createMultideckIcon(PanelLeftOpenIconData, "PanelLeftOpen")
export const PanelRightClose = createMultideckIcon(PanelRightCloseIconData, "PanelRightClose")
export const Paperclip = createMultideckIcon(Attachment01IconData, "Paperclip")
export const PenLine = createMultideckIcon(Pen02IconData, "PenLine")
export const Pen01 = createMultideckIcon(Pen01IconData, "Pen01")
// Keep legacy edit/rename imports on Calendar's approved pen, never the old pencil glyph.
export const Pencil = Pen01
export const PencilEdit01 = createMultideckIcon(PencilEdit01IconData, "PencilEdit01")
export const Phone = createMultideckIcon(TelephoneIconData, "Phone")
export const Pilcrow = createMultideckIcon(ParagraphIconData, "Pilcrow")
export const Pin = createMultideckIcon(PinIconData, "Pin")
export const PinOff = createMultideckIcon(PinOffIconData, "PinOff")
export const Plane = createMultideckIcon(PlaneIconData, "Plane")
export const Plug = createMultideckIcon(PlugIconData, "Plug")
export const Plus = createMultideckIcon(PlusSignIconData, "Plus")
export const Presentation = createMultideckIcon(PresentationIconData, "Presentation")
export const Printer = createMultideckIcon(PrinterIconData, "Printer")
export const QrCode = createMultideckIcon(QrCodeIconData, "QrCode")
export const Radar = createMultideckIcon(RadarIconData, "Radar")
export const ReceiptText = createMultideckIcon(ReceiptTextIconData, "ReceiptText")
export const RefreshCcw = createMultideckIcon(RotateLeftIconData, "RefreshCcw")
export const RefreshCw = createMultideckIcon(RefreshIconData, "RefreshCw")
export const Reply = createMultideckIcon(MailReplyIconData, "Reply")
export const RotateCcw = createMultideckIcon(RotateLeftIconData, "RotateCcw")
export const Route = createMultideckIcon(RouteIconData, "Route")
export const Save = createMultideckIcon(SaveIconData, "Save")
export const ScanText = createMultideckIcon(FileScanIconData, "ScanText")
export const Scissors = createMultideckIcon(ScissorIconData, "Scissors")
export const Search = createMultideckIcon(SearchIconData, "Search")
export const SearchX = createMultideckIcon(SearchRemoveIconData, "SearchX")
export const Send = createMultideckIcon(SentIconData, "Send")
export const SendHorizontal = createMultideckIcon(Sent02IconData, "SendHorizontal")
export const Settings = createMultideckIcon(SettingsIconData, "Settings")
export const Settings2 = createMultideckIcon(Settings02IconData, "Settings2")
export const Share2 = createMultideckIcon(Share02IconData, "Share2")
export const Shield = createMultideckIcon(ShieldIconData, "Shield")
export const ShieldAlert = createMultideckIcon(SecurityWarningIconData, "ShieldAlert")
export const ShieldCheck = createMultideckIcon(SecurityCheckIconData, "ShieldCheck")
export const Ship = createMultideckIcon(CargoShipIconData, "Ship")
export const Signature = createMultideckIcon(SignatureIconData, "Signature")
export const SlidersHorizontal = createMultideckIcon(SlidersHorizontalIconData, "SlidersHorizontal")
export const Smartphone = createMultideckIcon(SmartPhone01IconData, "Smartphone")
export const Sparkles = createMultideckIcon(SparklesIconData, "Sparkles")
export const Split = createMultideckIcon(SplitIconData, "Split")
export const Square = createMultideckIcon(SquareIconData, "Square")
export const SquareCheck = createMultideckIcon(CheckmarkSquare02IconData, "SquareCheck")
export const SquareDashed = createMultideckIcon(SquareDashedTopSolidIconData, "SquareDashed")
export const Star = createMultideckIcon(StarIconData, "Star")
export const StickyNote = createMultideckIcon(StickyNoteIconData, "StickyNote")
export const Sun = createMultideckIcon(SunIconData, "Sun")
export const Sunrise = createMultideckIcon(SunriseIconData, "Sunrise")
export const Table2 = createMultideckIcon(Table02IconData, "Table2")
export const Tag = createMultideckIcon(TagIconData, "Tag")
export const Tags = createMultideckIcon(TagsIconData, "Tags")
export const Target = createMultideckIcon(TargetIconData, "Target")
export const TestTube2 = createMultideckIcon(TestTube02IconData, "TestTube2")
export const TextCursorInput = createMultideckIcon(InputCursorTextIconData, "TextCursorInput")
export const TextQuote = createMultideckIcon(QuotesIconData, "TextQuote")
export const TicketCheck = createMultideckIcon(TicketIconData, "TicketCheck")
export const Trash2 = createMultideckIcon(Delete02IconData, "Trash2")
export const TrendingUp = createMultideckIcon(ChartIncreaseIconData, "TrendingUp")
export const TriangleAlert = createMultideckIcon(Alert02IconData, "TriangleAlert")
export const Trophy = createMultideckIcon(Award01IconData, "Trophy")
export const Truck = createMultideckIcon(TruckIconData, "Truck")
export const Type = createMultideckIcon(TextFontIconData, "Type")
export const UnlockKeyhole = createMultideckIcon(SquareUnlock02IconData, "UnlockKeyhole")
export const Upload = createMultideckIcon(UploadIconData, "Upload")
export const UploadCloud = createMultideckIcon(CloudUploadIconData, "UploadCloud")
export const UserRound = createMultideckIcon(User03IconData, "UserRound")
export const UserRoundCheck = createMultideckIcon(UserCheck02IconData, "UserRoundCheck")
export const UserRoundPlus = createMultideckIcon(UserAdd02IconData, "UserRoundPlus")
export const UserRoundSearch = createMultideckIcon(UserSearch02IconData, "UserRoundSearch")
export const Users = createMultideckIcon(UserGroupIconData, "Users")
export const UsersRound = createMultideckIcon(UserGroup03IconData, "UsersRound")
export const Video = createMultideckIcon(VideoIconData, "Video")
export const Wallet = createMultideckIcon(WalletIconData, "Wallet")
export const WalletCards = createMultideckIcon(WalletCardsIconData, "WalletCards")
export const WandSparkles = createMultideckIcon(MagicWand02IconData, "WandSparkles")
export const Warehouse = createMultideckIcon(WarehouseIconData, "Warehouse")
export const Webhook = createMultideckIcon(WebhookIconData, "Webhook")
export const Workflow = createMultideckIcon(WorkflowSquare01IconData, "Workflow")
export const X = createMultideckIcon(Cancel01IconData, "X")
export const XCircle = createMultideckIcon(CancelCircleIconData, "XCircle")
export const XIcon = createMultideckIcon(Cancel01IconData, "XIcon")
export const Zap = createMultideckIcon(ZapIconData, "Zap")
