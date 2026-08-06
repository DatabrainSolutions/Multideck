import { getLocales } from "expo-localization"
import { I18nManager } from "react-native"

type Language = "en" | "de" | "fr" | "ar"

const translations = {
  en: {
    privateWorkspace: "Private workspace",
    freightTitle: "Freight keeps moving.\nMultideck keeps watch.",
    freightBody: "A calm, private operating workspace for every booking, exception and customer promise.",
    openWorkspace: "Open your workspace",
    workspaceIntro: "Each company has its own private Multideck workspace and secure sign-in.",
    workspace: "Workspace",
    workspacePlaceholder: "dev",
    open: "Open workspace",
    workspaceHelp: "Your workspace name is included in the access details sent by your administrator.",
    workspaceInvalid: "Enter the workspace name supplied by your Multideck administrator.",
    workspaceUnavailable: "We could not securely open that workspace. Check the name and try again.",
    signIn: "Sign in to Multideck",
    signInIntro: "Use the email and password already connected to your account.",
    email: "Work email",
    password: "Password",
    signingIn: "Signing in…",
    signInAction: "Sign in",
    invalidCredentials: "We could not sign you in. Check your details and workspace, then try again.",
    accountHelp: "Need access? Ask your workspace administrator. Accounts cannot be created from this app.",
    changeWorkspace: "Change workspace",
    welcome: "Workspace ready",
    welcomeBody: "Your private Multideck session is active on this device.",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    preparing: "Preparing your workspace…",
  },
  de: {
    privateWorkspace: "Privater Arbeitsbereich",
    freightTitle: "Die Fracht bleibt in Bewegung.\nMultideck behält alles im Blick.",
    freightBody: "Ein ruhiger, privater Arbeitsbereich für jede Buchung, Ausnahme und Kundenzusage.",
    openWorkspace: "Arbeitsbereich öffnen",
    workspaceIntro: "Jedes Unternehmen hat einen eigenen privaten Multideck-Arbeitsbereich und eine sichere Anmeldung.",
    workspace: "Arbeitsbereich",
    workspacePlaceholder: "dev",
    open: "Arbeitsbereich öffnen",
    workspaceHelp: "Der Name Ihres Arbeitsbereichs steht in den Zugangsdaten Ihres Administrators.",
    workspaceInvalid: "Geben Sie den Arbeitsbereich ein, den Ihr Multideck-Administrator bereitgestellt hat.",
    workspaceUnavailable: "Dieser Arbeitsbereich konnte nicht sicher geöffnet werden. Prüfen Sie den Namen.",
    signIn: "Bei Multideck anmelden",
    signInIntro: "Verwenden Sie die E-Mail-Adresse und das Passwort Ihres bestehenden Kontos.",
    email: "Arbeits-E-Mail",
    password: "Passwort",
    signingIn: "Anmeldung…",
    signInAction: "Anmelden",
    invalidCredentials: "Die Anmeldung ist fehlgeschlagen. Prüfen Sie Ihre Angaben und den Arbeitsbereich.",
    accountHelp: "Sie benötigen Zugriff? Fragen Sie Ihren Administrator. Konten können hier nicht erstellt werden.",
    changeWorkspace: "Arbeitsbereich wechseln",
    welcome: "Arbeitsbereich bereit",
    welcomeBody: "Ihre private Multideck-Sitzung ist auf diesem Gerät aktiv.",
    signedInAs: "Angemeldet als",
    signOut: "Abmelden",
    preparing: "Arbeitsbereich wird vorbereitet…",
  },
  fr: {
    privateWorkspace: "Espace de travail privé",
    freightTitle: "Le fret continue d’avancer.\nMultideck reste vigilant.",
    freightBody: "Un espace opérationnel calme et privé pour chaque réservation, exception et engagement client.",
    openWorkspace: "Ouvrir votre espace de travail",
    workspaceIntro: "Chaque entreprise dispose de son propre espace Multideck privé et d’une connexion sécurisée.",
    workspace: "Espace de travail",
    workspacePlaceholder: "dev",
    open: "Ouvrir l’espace",
    workspaceHelp: "Le nom de votre espace figure dans les informations d’accès envoyées par votre administrateur.",
    workspaceInvalid: "Saisissez le nom fourni par votre administrateur Multideck.",
    workspaceUnavailable: "Impossible d’ouvrir cet espace de façon sécurisée. Vérifiez le nom.",
    signIn: "Se connecter à Multideck",
    signInIntro: "Utilisez l’e-mail et le mot de passe déjà associés à votre compte.",
    email: "E-mail professionnel",
    password: "Mot de passe",
    signingIn: "Connexion…",
    signInAction: "Se connecter",
    invalidCredentials: "Connexion impossible. Vérifiez vos informations et votre espace de travail.",
    accountHelp: "Besoin d’un accès ? Contactez votre administrateur. Aucun compte ne peut être créé ici.",
    changeWorkspace: "Changer d’espace",
    welcome: "Espace prêt",
    welcomeBody: "Votre session Multideck privée est active sur cet appareil.",
    signedInAs: "Connecté en tant que",
    signOut: "Se déconnecter",
    preparing: "Préparation de votre espace…",
  },
  ar: {
    privateWorkspace: "مساحة عمل خاصة",
    freightTitle: "حركة الشحن مستمرة.\nوMultideck يراقب.",
    freightBody: "مساحة تشغيل هادئة وخاصة لكل حجز واستثناء ووعد للعميل.",
    openWorkspace: "افتح مساحة عملك",
    workspaceIntro: "لكل شركة مساحة عمل خاصة بها في Multideck وتسجيل دخول آمن.",
    workspace: "مساحة العمل",
    workspacePlaceholder: "dev",
    open: "فتح مساحة العمل",
    workspaceHelp: "اسم مساحة العمل موجود في تفاصيل الوصول التي أرسلها المسؤول.",
    workspaceInvalid: "أدخل اسم مساحة العمل الذي زودك به مسؤول Multideck.",
    workspaceUnavailable: "تعذر فتح مساحة العمل بأمان. تحقق من الاسم وحاول مرة أخرى.",
    signIn: "تسجيل الدخول إلى Multideck",
    signInIntro: "استخدم البريد الإلكتروني وكلمة المرور المرتبطين بحسابك.",
    email: "بريد العمل",
    password: "كلمة المرور",
    signingIn: "جارٍ تسجيل الدخول…",
    signInAction: "تسجيل الدخول",
    invalidCredentials: "تعذر تسجيل الدخول. تحقق من بياناتك ومساحة العمل ثم حاول مرة أخرى.",
    accountHelp: "هل تحتاج إلى الوصول؟ اطلب من مسؤول مساحة العمل. لا يمكن إنشاء حساب من التطبيق.",
    changeWorkspace: "تغيير مساحة العمل",
    welcome: "مساحة العمل جاهزة",
    welcomeBody: "جلسة Multideck الخاصة بك نشطة على هذا الجهاز.",
    signedInAs: "تم تسجيل الدخول باسم",
    signOut: "تسجيل الخروج",
    preparing: "جارٍ تجهيز مساحة العمل…",
  },
} as const

type TranslationKey = keyof typeof translations.en

function getLanguage(): Language {
  const languageCode = getLocales()[0]?.languageCode
  return languageCode === "de" || languageCode === "fr" || languageCode === "ar" ? languageCode : "en"
}

export const language = getLanguage()
export const isRtl = language === "ar" || I18nManager.isRTL
export const textDirection: "rtl" | "ltr" = isRtl ? "rtl" : "ltr"

export function t(key: TranslationKey): string {
  return translations[language][key]
}
