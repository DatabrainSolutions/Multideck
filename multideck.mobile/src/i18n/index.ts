const translations = {
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
} as const

type TranslationKey = keyof typeof translations

export const language = "en" as const

export function t(key: TranslationKey): string {
  return translations[key]
}
