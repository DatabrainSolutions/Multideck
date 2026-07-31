import { useCallback, useEffect, useRef } from "react"
import { isLanguageCode, type LanguageCode } from "@/i18n/languages"
import { useLanguage } from "@/i18n/language-provider"
import { supabase } from "@/lib/supabase"

function readLanguagePreference(value: unknown): LanguageCode | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== "object") return null

  const candidate = row as Record<string, unknown>
  return typeof candidate.locale === "string" && isLanguageCode(candidate.locale)
    ? candidate.locale
    : null
}

/**
 * Supabase is the signed-in operator's source of truth. Local storage remains a
 * fast first-paint cache, but cannot silently override a saved profile locale.
 */
export function LanguageProfileSync() {
  const { language, setLanguage } = useLanguage()
  const activeUserId = useRef<string | null>(null)
  const loadVersion = useRef(0)
  const languageRevision = useRef(0)
  const currentLanguage = useRef<LanguageCode>(language)
  const lastPersistedLanguage = useRef<LanguageCode | null>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  const saveLanguage = useCallback((locale: LanguageCode, userId: string) => {
    const client = supabase
    if (!client) return Promise.resolve()

    saveQueue.current = saveQueue.current
      .then(async () => {
        if (activeUserId.current !== userId) return

        const { error } = await client.rpc("set_current_user_language_preference", {
          p_locale: locale,
        })
        if (error) throw error

        if (activeUserId.current === userId) lastPersistedLanguage.current = locale
      })
      .catch((error: unknown) => {
        console.warn("Your language preference could not be saved to your profile.", error)
      })

    return saveQueue.current
  }, [])

  useEffect(() => {
    currentLanguage.current = language
    languageRevision.current += 1

    const userId = activeUserId.current
    if (!userId || lastPersistedLanguage.current === language) return

    void saveLanguage(language, userId)
  }, [language, saveLanguage])

  useEffect(() => {
    const configuredClient = supabase
    if (!configuredClient) return
    const client: NonNullable<typeof supabase> = configuredClient

    async function syncProfileLanguage() {
      const { data: sessionData, error: sessionError } = await client.auth.getSession()
      if (sessionError) {
        console.warn("Your language preference could not be loaded from your profile.", sessionError)
        return
      }

      const userId = sessionData.session?.user.id ?? null
      const requestVersion = ++loadVersion.current
      activeUserId.current = userId
      lastPersistedLanguage.current = null

      if (!userId) return

      const revisionAtStart = languageRevision.current
      const { data, error } = await client.rpc("get_current_user_language_preference")
      if (error) {
        console.warn("Your language preference could not be loaded from your profile.", error)
        return
      }

      if (requestVersion !== loadVersion.current || activeUserId.current !== userId) return
      if (languageRevision.current !== revisionAtStart) return

      const savedLanguage = readLanguagePreference(data)
      if (savedLanguage) {
        lastPersistedLanguage.current = savedLanguage
        if (currentLanguage.current !== savedLanguage) setLanguage(savedLanguage)
        return
      }

      void saveLanguage(currentLanguage.current, userId)
    }

    void syncProfileLanguage()
    const { data: listener } = client.auth.onAuthStateChange(() => {
      void syncProfileLanguage()
    })

    return () => listener.subscription.unsubscribe()
  }, [saveLanguage, setLanguage])

  return null
}
