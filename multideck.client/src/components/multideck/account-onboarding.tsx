import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowRight, Camera, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, LogOut, X } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { WorkingHoursEditor } from "@/components/multideck/working-hours-editor"
import { TimeZoneSelect } from "@/components/multideck/meeting-time-picker"
import { AccountOnboardingTutorial, AccountOnboardingDictation } from "@/components/multideck/account-onboarding-tutorial"
import { AccountOnboardingConnections } from "@/components/multideck/account-onboarding-connections"
import { AccountOnboardingAppearance } from "@/components/multideck/account-onboarding-appearance"
import { accountSetupSteps, acceptAccountInvitation, getAccountSetup, previewInvitation, saveAccountSetup, type AccountSetupData, type AccountSetupState, type AccountSetupStep, type InvitationPreview } from "@/lib/account-onboarding-api"
import { getCalendarAvailability, saveCalendarAvailability, type CalendarAvailabilityPreferences } from "@/lib/calendar-api"
import { createProfilePhotoSignedUrl, profilePhotoAcceptedTypes, uploadCurrentUserCoverPhoto, uploadCurrentUserProfilePhoto, validateProfilePhoto, type UserProfilePhoto } from "@/lib/profile-photo"
import { getPasswordPolicyError, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_POLICY_DESCRIPTION } from "@/lib/password-policy"
import { accentCssText, isAccentPresetId, readAccentPresetId, writeAccentPresetId, type AccentPresetId } from "@/lib/accent-theme"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { AccountOnboardingCelebration } from "./account-onboarding-celebration"
import { authSupabase, supabase } from "@/lib/supabase"
import { useTheme } from "@/lib/theme-provider"
import { setThemeWithProfileIntent } from "@/lib/theme-preferences"
import { invalidateWorkspaceBootstrap } from "@/lib/workspace-bootstrap"
import { useLanguage } from "@/i18n/language-provider"
import logo from "@/assets/brand/multideck-full-logo.svg"
import "./account-onboarding.css"

const stepLabels: Record<AccountSetupStep, string> = { password: "Your account", photo: "Your profile", work: "Your work", availability: "Your week", connections: "Your tools", dexter: "Meet Dexter", dictation: "Your voice", appearance: "Your space" }
const optionalSteps = new Set<AccountSetupStep>(["photo", "connections"])

export function AccountOnboarding({ invite = false, navigate }: { invite?: boolean; navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const { setTheme } = useTheme()
  const reducedMotion = Boolean(useReducedMotion())
  const preview = import.meta.env.DEV && !invite && new URLSearchParams(window.location.search).get("preview") === "1"
  const [ticket] = useState(() => invite ? new URLSearchParams(window.location.search).get("ticket") || "" : "")
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null)
  const [data, setData] = useState<AccountSetupData | null>(null)
  const [state, setState] = useState<AccountSetupState | null>(null)
  const [step, setStep] = useState<AccountSetupStep>("password")
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  const [direction, setDirection] = useState(1)
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [jobTitle, setJobTitle] = useState("")
  const [preferredName, setPreferredName] = useState("")
  const [phone, setPhone] = useState("")
  const [departmentIds, setDepartmentIds] = useState<string[]>([])
  const [photo, setPhoto] = useState<UserProfilePhoto | null>(null)
  const [cover, setCover] = useState<UserProfilePhoto | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [failedUploads, setFailedUploads] = useState<Set<"photo" | "cover">>(new Set())
  const [mediaMessage, setMediaMessage] = useState<string | null>(null)
  const [availability, setAvailability] = useState<CalendarAvailabilityPreferences | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [availabilityReload, setAvailabilityReload] = useState(0)
  const [tutorialStage, setTutorialStage] = useState(0)
  const [accent, setAccent] = useState<AccentPresetId>(() => { const current = readAccentPresetId(); return isAccentPresetId(current) ? current : "teal" })
  const [theme, setDisplayTheme] = useState<"light" | "dark">(() => window.localStorage.getItem("multideck.theme") === "dark" ? "dark" : "light")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const objectUrls = useRef<string[]>([])
  const bodyRef = useRef<HTMLDivElement>(null)
  const submitting = useRef(false)

  // Live rehearsal uses the existing theme boundary without saving a preference.
  // The invitation/password surface always retains Multideck's light identity.
  useLayoutEffect(() => {
    if (!invite) window.dispatchEvent(new CustomEvent("multideck:onboarding-theme-preview", { detail: step === "password" ? "light" : theme }))
  }, [invite, step, theme])
  useEffect(() => () => {
    if (!invite) window.dispatchEvent(new CustomEvent("multideck:onboarding-theme-preview", { detail: "light" }))
  }, [invite])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(null)
    async function load() {
      try {
        if (invite) {
          if (!ticket) throw new Error("This invitation link is incomplete or has already been used. Sign in to resume setup, or ask your administrator for a fresh invitation.")
          const result = await previewInvitation(ticket)
          if (!controller.signal.aborted) setInvitation(result)
        } else {
          const result = await getAccountSetup(controller.signal)
          if (controller.signal.aborted) return
          if (!preview && (!result.state || result.state.completedAt)) { navigate("/app"); return }
          setData(result); setState(result.state)
          const requested = new URLSearchParams(window.location.search).get("step") as AccountSetupStep
          setStep(preview ? accountSetupSteps.includes(requested) ? requested : "password" : result.state!.step)
          setPreferredName(result.preferredName); setPhone(result.phone); setJobTitle(result.profile.jobTitle || "")
          setDepartmentIds(result.hasProfileDepartments ? result.profileDepartmentIds : result.profile.departments.map((department) => department.id))
          setDisplayTheme(result.themeMode === "dark" ? "dark" : "light")
          setAccent(isAccentPresetId(result.accentPreset) ? result.accentPreset : "teal")
          setTutorialStage(preview ? 0 : result.state?.tutorialStage ?? 0)
          setPhoto(result.profile.profilePhoto); setCover(result.profile.coverPhoto)
          const images = await Promise.allSettled([result.profile.profilePhoto ? createProfilePhotoSignedUrl(result.profile.profilePhoto) : Promise.resolve(null), result.profile.coverPhoto ? createProfilePhotoSignedUrl(result.profile.coverPhoto) : Promise.resolve(null)])
          if (!controller.signal.aborted) {
            if (images[0].status === "fulfilled") setPhotoUrl(images[0].value)
            if (images[1].status === "fulfilled") setCoverUrl(images[1].value)
            if (images.some((image) => image.status === "rejected")) setMediaMessage("One of your photos could not be loaded. Refresh to try again.")
          }
        }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Your account setup could not be loaded.")
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
    // Navigation is supplied by the app; only reload this form intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite, ticket, preview, reload])

  useEffect(() => () => { objectUrls.current.forEach((url) => URL.revokeObjectURL(url)) }, [])
  useEffect(() => {
    if (loading) return
    headingRef.current?.focus({ preventScroll: true })
    bodyRef.current?.scrollTo({ top: 0 })
  }, [step, loading])

  useEffect(() => {
    if (step !== "availability" || availability) return
    const controller = new AbortController()
    setAvailabilityLoading(true); setAvailabilityError(null)
    getCalendarAvailability(controller.signal, { requireDatabase: !preview }).then((value) => { if (!controller.signal.aborted) setAvailability(value) })
      .catch((reason) => { if (!controller.signal.aborted) setAvailabilityError(reason instanceof Error ? reason.message : "Your working hours could not be loaded.") })
      .finally(() => { if (!controller.signal.aborted) setAvailabilityLoading(false) })
    return () => controller.abort()
  }, [step, availability, availabilityReload, preview])

  const index = accountSetupSteps.indexOf(step)
  const name = data?.profile.displayName || invitation?.name || invitation?.firstName || "Your profile"
  const firstName = preferredName || data?.profile.firstName || invitation?.firstName || ""
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
  const title: Record<AccountSetupStep, string> = {
    password: firstName ? `${firstName}, your place is ready.` : "Your place is ready.",
    photo: "Time to personalise.", work: "Where do you fit in?", availability: "When do you work?",
    connections: "Bring your day together.", dexter: "A little help. A lot less work.", dictation: "Say it. We’ll take it from here.", appearance: "Make yourself at home.",
  }
  const description: Record<AccountSetupStep, string> = {
    password: invitation ? `Set a password to join ${invitation.workspaceName}. Then we’ll make this space yours.` : "A few small steps to make Multideck feel like yours.",
    photo: "Add a profile photo and a cover. A familiar face makes all the difference.",
    work: "A little about what you do, so your team knows who to turn to.", availability: "Set your usual week. We’ll use it to find times that work for you.",
    connections: "Your email, calendars and meetings, in one place.", dexter: firstName ? `Let’s try a few things together, ${firstName}.` : "Let’s try a few things together.",
    dictation: "Your thoughts can move faster than your fingers.", appearance: "Choose a display theme and see your colour in action.",
  }

  function goToStep(next: AccountSetupStep) {
    setDirection(accountSetupSteps.indexOf(next) >= index ? 1 : -1)
    setError(null); setStep(next)
    if (preview) window.history.replaceState({}, "", `/onboarding?preview=1&step=${next}`)
  }

  async function upload(kind: "photo" | "cover", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || submitting.current) return
    submitting.current = true; setBusy(true); setMediaMessage(null)
    try {
      await validateProfilePhoto(file)
      if (preview) {
        const url = URL.createObjectURL(file); objectUrls.current.push(url)
        if (kind === "photo") setPhotoUrl(url); else setCoverUrl(url)
        setMediaMessage("Photo ready in this preview.")
      } else {
        const saved = kind === "photo" ? await uploadCurrentUserProfilePhoto(file, photo) : await uploadCurrentUserCoverPhoto(file, cover)
        if (kind === "photo") setPhoto(saved); else setCover(saved)
        const url = await createProfilePhotoSignedUrl(saved)
        if (kind === "photo") setPhotoUrl(url); else setCoverUrl(url)
        setMediaMessage(kind === "photo" ? "Profile photo saved." : "Cover photo saved.")
      }
      setFailedUploads((current) => { const next = new Set(current); next.delete(kind); return next })
    } catch (reason) {
      setFailedUploads((current) => new Set(current).add(kind))
      setError(reason instanceof Error ? reason.message : "The photo could not be uploaded. Try again.")
    }
    finally { submitting.current = false; setBusy(false) }
  }

  async function saveTutorial(stage: number) {
    if (submitting.current) return false
    submitting.current = true; setBusy(true); setError(null)
    try {
      if (!preview) { const result = await saveAccountSetup({ action: "tutorial", stage }); setState(result.state) }
      setTutorialStage(stage); return true
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your practice progress could not be saved."); return false }
    finally { submitting.current = false; setBusy(false) }
  }

  async function continueSetup() {
    if (submitting.current || finished) return
    setError(null)
    if (step === "password" && !preview) {
      const validation = getPasswordPolicyError(password)
      setPasswordError(validation); setConfirmationError(password === confirmation ? null : "The two passwords do not match.")
      if (validation || password !== confirmation) { document.getElementById(validation ? "setup-password" : "setup-password-confirmation")?.focus(); return }
    }
    if (failedUploads.size) { setError("A photo has not finished saving. Return to Your profile and choose it again to retry."); return }
    if (step === "dexter" && tutorialStage < 3) return
    if (step === "availability") {
      if (!availability) { setError("Load your working hours before continuing."); return }
      const ranges = Object.values(availability.workingHours).flat()
      if (!ranges.length || ranges.some(([start, end]) => !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end)) { setError("Choose at least one working day, with each finish time after its start."); return }
    }
    submitting.current = true; setBusy(true)
    try {
      if (step === "password") {
        if (preview) goToStep("photo")
        else { await acceptAccountInvitation(ticket, password); setPassword(""); setConfirmation(""); navigate("/onboarding") }
        return
      }
      if (!preview) {
        if (step === "availability" && availability) {
          const saved = await saveCalendarAvailability(availability, { requireDatabase: true })
          if (!saved.saved) throw new Error("Your working hours were not saved. Please try again.")
          setAvailability(saved.availability)
        }
        if (step === "appearance") {
          if (!supabase) throw new Error("Your appearance could not be saved. Try again.")
          const results = await Promise.all([supabase.rpc("set_current_user_theme_preference", { p_theme_mode: theme }), supabase.rpc("set_current_user_accent_preference", { p_accent_preset: accent })])
          if (results.some((result) => result.error) || results[0].data?.[0]?.theme_mode !== theme || results[1].data?.[0]?.accent_preset !== accent) throw new Error("Your appearance could not be saved completely. Try again.")
        }
        const result = await saveAccountSetup(step === "work"
          ? { action: "profile", jobTitle, preferredName, phone, departmentIds }
          : { action: "advance", step })
        setState(result.state)
      }
      if (step === "appearance") {
        if (!preview) {
          await saveAccountSetup({ action: "complete" })
          writeAccentPresetId(accent); setThemeWithProfileIntent(setTheme, theme)
          invalidateWorkspaceBootstrap()
          const refreshed = await authSupabase!.auth.refreshSession()
          if (refreshed.error) throw new Error("Your account is ready. Refresh this page to open your workspace.")
          window.dispatchEvent(new Event("multideck:onboarding-complete"))
        }
        setFinished(true)
      } else goToStep(accountSetupSteps[index + 1])
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This step could not be saved. Your entries are still here.") }
    finally { submitting.current = false; setBusy(false) }
  }

  const failedToLoad = !loading && !data && !invitation
  const canGoBack = index > (preview ? 0 : 1) && !busy
  const continueDisabled = busy || loading || failedToLoad || (step === "dexter" && tutorialStage < 3) || (step === "availability" && !availability)

  return <main className="md-onboarding" data-onboarding-preview={preview || undefined} data-onboarding-step={step}>
    <style>{accentCssText(invite || step === "password" ? "teal" : accent).replaceAll(":root.dark", ".dark .md-onboarding").replaceAll(":root", ".md-onboarding")}</style>
    <motion.section className="md-onboarding-panel" aria-label={t("Set up your Multideck account")} initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={reduceMotion(reducedMotion, mdMotion.enter)}>
      {finished ? <AccountOnboardingCelebration firstName={firstName} preview={preview} onContinue={() => navigate(preview ? "/settings?tab=profile" : "/agent-dexter")} /> : <>
      <header className="md-onboarding-header">
        <img src={logo} alt="Multideck" />
        <div className="md-onboarding-header-end">{preview ? <span className="md-onboarding-preview-badge">{t("Development preview")}</span> : <span>{t("Your account, your way")}</span>}
          {preview ? <button type="button" aria-label={t("Close onboarding preview")} onClick={() => navigate("/settings?tab=profile")}><X className="size-4" /></button> : !invite ? <button type="button" aria-label={t("Sign out and finish setup later")} disabled={busy} onClick={() => void authSupabase?.auth.signOut().then(() => navigate("/auth"))}><LogOut className="size-4" /></button> : null}
        </div>
      </header>
      <nav className="md-onboarding-progress" aria-label={t("Account setup progress")}>
        {accountSetupSteps.map((item, position) => <button type="button" key={item} aria-label={`${t(stepLabels[item])}, ${position + 1} ${t("of")} 8`} aria-current={item === step ? "step" : undefined} disabled={!preview || busy || loading} onClick={() => goToStep(item)} className={position <= index ? "is-current" : ""}><span><motion.i initial={false} animate={{ scaleX: position <= index ? 1 : 0, opacity: position === index ? 0.6 : 1 }} transition={reduceMotion(reducedMotion, mdMotion.smooth)} /></span></button>)}
      </nav>
      <div className="md-onboarding-body" ref={bodyRef}>
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.div className={`md-onboarding-step is-${step}`} key={step} custom={direction} variants={{ enter: (travel: number) => ({ opacity: 0, x: reducedMotion ? 0 : travel * 12 }), exit: (travel: number) => ({ opacity: 0, x: reducedMotion ? 0 : travel * -8, transition: { duration: reducedMotion ? 0 : 0.08, ease: "easeIn" } }) }} initial="enter" animate={{ opacity: 1, x: 0 }} exit="exit" transition={reduceMotion(reducedMotion, { duration: 0.2, ease: [0.22, 1, 0.36, 1] })}>
        <div className="md-onboarding-heading"><p>{t(stepLabels[step])}<span>0{index + 1} / 08</span></p><h1 ref={headingRef} tabIndex={-1}>{t(title[step])}</h1><p>{t(description[step])}</p></div>
        <div className={`md-onboarding-content is-${step}`}>
          {loading ? <div className="md-onboarding-loading" role="status"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />{t("Getting your space ready…")}</div> : failedToLoad ? <div className="md-onboarding-load-error"><p role="alert">{t(error || "Your invitation could not be loaded.")}</p><Button variant="outline" onClick={() => setReload((value) => value + 1)}>{t("Try again")}</Button><a href="/auth">{t("Back to sign in")}</a></div> : <>
            {step === "password" ? <form className="md-onboarding-password" onSubmit={(event) => { event.preventDefault(); void continueSetup() }}>
              <span className="md-onboarding-password-icon"><LockKeyhole className="size-6" /></span>
              <div className="md-onboarding-invited-person"><strong>{name}</strong><span>{invitation?.email || data?.profile.email}</span></div>
              {preview ? <p className="md-onboarding-preview-note">{t("You’re previewing the password step. Your password won’t change.")}</p> : null}
              <label htmlFor="setup-password">{t("Create a password")}</label>
              <div className="md-onboarding-password-field"><Input id="setup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={password} onChange={(event) => { setPassword(event.target.value); setPasswordError(null) }} aria-invalid={Boolean(passwordError)} aria-describedby="setup-password-hint setup-password-error" disabled={busy} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={t(showPassword ? "Hide password" : "Show password")}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
              <p id="setup-password-hint" className="md-onboarding-field-hint">{t(PASSWORD_POLICY_DESCRIPTION)}</p>
              <p id="setup-password-error" role="alert" className="md-onboarding-field-error">{passwordError ? t(passwordError) : null}</p>
              <label htmlFor="setup-password-confirmation">{t("One more time")}</label>
              <Input id="setup-password-confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setConfirmationError(null) }} aria-invalid={Boolean(confirmationError)} aria-describedby="setup-confirmation-error" disabled={busy} />
              <p id="setup-confirmation-error" role="alert" className="md-onboarding-field-error">{confirmationError ? t(confirmationError) : null}</p>
              <button type="submit" className="sr-only" tabIndex={-1}>{t("Continue")}</button>
            </form> : null}
            {step === "photo" ? <div className="md-onboarding-profile">
              <input ref={photoInput} type="file" className="sr-only" tabIndex={-1} accept={profilePhotoAcceptedTypes.join(",")} onChange={(event) => void upload("photo", event)} />
              <input ref={coverInput} type="file" className="sr-only" tabIndex={-1} accept={profilePhotoAcceptedTypes.join(",")} onChange={(event) => void upload("cover", event)} />
              <div className="md-onboarding-profile-cover">{coverUrl ? <img src={coverUrl} alt={t("Your cover photo preview")} /> : <div className="md-onboarding-cover-art" aria-hidden="true"><i /><i /><i /></div>}<button type="button" onClick={() => coverInput.current?.click()} disabled={busy}><Camera className="size-4" />{t(coverUrl ? "Change cover" : "Add cover photo")}</button></div>
              <button type="button" className="md-onboarding-profile-avatar" onClick={() => photoInput.current?.click()} disabled={busy} aria-label={t(photoUrl ? "Change profile photo" : "Upload profile photo")}>{photoUrl ? <img src={photoUrl} alt={t("Your profile photo preview")} /> : <span>{initials}</span>}<span className="md-onboarding-avatar-camera"><Camera className="size-4" /></span></button>
              <h2>{name}</h2><p>{jobTitle || data?.profile.company?.name}</p>
              <p role="status" className="md-onboarding-photo-status">{t(mediaMessage || (busy ? "Uploading your photo…" : "Choose either photo to change it. JPG, PNG or WebP, up to 5 MB."))}</p>
            </div> : null}
            {step === "work" ? <div className="md-onboarding-work">
              <div className="md-onboarding-field-grid"><label htmlFor="setup-preferred-name">{t("What should we call you?")}<Input id="setup-preferred-name" autoComplete="nickname" maxLength={80} value={preferredName} onChange={(event) => setPreferredName(event.target.value)} disabled={busy} /></label><label htmlFor="setup-job-title">{t("Job title")}<Input id="setup-job-title" autoComplete="organization-title" maxLength={120} value={jobTitle} placeholder={t("e.g. Operations manager")} onChange={(event) => setJobTitle(event.target.value)} disabled={busy} /></label></div>
              <fieldset disabled={busy} className="md-onboarding-departments"><legend>{t("Which teams are you part of?")}<span>{t("Choose all that fit")}</span></legend>
                {data?.departments.length ? <div className="md-onboarding-department-pills">{Array.from({ length: Math.ceil(data.departments.length / 3) }, (_, row) => <div className="md-onboarding-department-row" key={row}>{data.departments.slice(row * 3, row * 3 + 3).map((department) => <motion.button type="button" key={department.id} aria-pressed={departmentIds.includes(department.id)} whileTap={reducedMotion ? undefined : { scale: 0.97 }} transition={mdMotion.spring} onClick={() => setDepartmentIds((current) => current.includes(department.id) ? current.filter((id) => id !== department.id) : [...current, department.id])}><span className="md-onboarding-pill-dot">{departmentIds.includes(department.id) ? <Check className="size-3" /> : null}</span>{department.name}</motion.button>)}</div>)}</div> : <p className="md-onboarding-muted">{t("Your workspace hasn’t added departments yet. You can add this detail later.")}</p>}
              </fieldset>
              <label htmlFor="setup-phone">{t("Phone")} <span className="md-onboarding-optional">{t("Optional")}</span><Input id="setup-phone" type="tel" autoComplete="tel" maxLength={50} value={phone} onChange={(event) => setPhone(event.target.value)} disabled={busy} /></label>
              <p className="md-onboarding-muted">{t("These choices describe your profile. Your administrator manages workspace access.")}</p>
            </div> : null}
            {step === "availability" ? <div className="md-onboarding-availability">{availability ? <><div className="md-onboarding-timezone"><span>{t("Your timezone")}</span><TimeZoneSelect variant="field" value={availability.timeZone} onChange={(timeZone) => { if (!submitting.current) setAvailability({ ...availability, timeZone }) }} /></div><WorkingHoursEditor className="md-onboarding-hours" value={availability.workingHours} onChange={(workingHours) => setAvailability({ ...availability, workingHours })} disabled={busy} /></> : availabilityLoading ? <div className="md-onboarding-loading" role="status"><LoaderCircle className="size-5 animate-spin" />{t("Loading your week…")}</div> : <div role="alert" className="md-onboarding-error">{t(availabilityError || "Working hours could not be loaded.")}<button type="button" onClick={() => setAvailabilityReload((value) => value + 1)}>{t("Try again")}</button></div>}</div> : null}
            {step === "connections" ? <AccountOnboardingConnections preview={preview} /> : null}
            {step === "dexter" ? <AccountOnboardingTutorial stage={tutorialStage} busy={busy} onStage={saveTutorial} /> : null}
            {step === "dictation" ? <AccountOnboardingDictation /> : null}
            {step === "appearance" ? <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><AccountOnboardingAppearance accent={accent} theme={theme} onAccent={(value) => { if (!submitting.current) setAccent(value) }} onTheme={(value) => { if (!submitting.current) setDisplayTheme(value) }} /></fieldset> : null}
          </>}
        </div>
        </motion.div>
        </AnimatePresence>
      </div>
      <footer className="md-onboarding-footer">
        {error && !failedToLoad ? <p role="alert" className="md-onboarding-footer-error">{t(error)}{step === "password" ? <a href="/auth">{t("Sign in instead")}</a> : null}</p> : null}
        {step === "dexter" && tutorialStage < 3 && !loading ? <p className="md-onboarding-footer-hint">{t("Try all three exercises to continue.")}</p> : null}
        <div><Button type="button" variant="ghost" disabled={!canGoBack} onClick={() => goToStep(accountSetupSteps[index - 1])}><ArrowLeft className="size-4" />{t("Back")}</Button>
          <div className="md-onboarding-footer-actions">{!failedToLoad && optionalSteps.has(step) ? <Button type="button" variant="ghost" disabled={busy || loading} onClick={() => void continueSetup()}>{t("Set up later")}</Button> : null}
            <Button type="button" className="md-onboarding-continue" disabled={continueDisabled} onClick={() => void continueSetup()}>{busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : null}{t(busy ? "Saving…" : step === "appearance" ? preview ? "Finish preview" : "Let’s get to work" : step === "password" && preview ? "Continue preview" : "Continue")}{!busy ? <ArrowRight className="size-4" /> : null}</Button>
          </div>
        </div>
        {preview ? <p className="md-onboarding-preview-footer">{t("Preview changes stay here. Use the progress bar to jump between steps.")}</p> : state?.completed?.length ? <p className="md-onboarding-preview-footer"><Check className="size-3" />{t("Your progress is saved as you go.")}</p> : null}
      </footer>
      </>}
    </motion.section>
  </main>
}
