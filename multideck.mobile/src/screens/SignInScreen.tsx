import { useRef, useState } from "react"
import { StyleSheet, Text, TextInput, View } from "react-native"
import type { SupabaseClient } from "@supabase/supabase-js"
import { AuthScreen } from "@/components/AuthScreen"
import { Feedback, Field, PrimaryButton, TextButton } from "@/components/FormControls"
import { t } from "@/i18n"
import type { WorkspaceConfiguration } from "@/auth/workspace"
import { colors, radius, spacing, type } from "@/theme/tokens"

type SignInScreenProps = {
  client: SupabaseClient
  workspace: WorkspaceConfiguration
  onChangeWorkspace: () => Promise<void>
}

export function SignInScreen({ client, workspace, onChangeWorkspace }: SignInScreenProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const passwordInput = useRef<TextInput>(null)

  async function signIn() {
    const normalizedEmail = email.trim().toLowerCase()
    setError(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !password) {
      setError(t("invalidCredentials"))
      return
    }

    setBusy(true)
    try {
      const { error: signInError } = await client.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })
      if (signInError) throw signInError
    } catch {
      setError(t("invalidCredentials"))
      setBusy(false)
    }
  }

  const workspaceBadge = (
    <View style={styles.workspaceBadge}>
      <View style={styles.workspaceDot} />
      <Text style={styles.workspaceBadgeText}>{workspace.workspace.name}</Text>
    </View>
  )

  return (
    <AuthScreen title={t("signIn")} description={t("signInIntro")} badge={workspaceBadge}>
      <Field
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={!busy}
        keyboardType="email-address"
        label={t("email")}
        onChangeText={(value) => {
          setEmail(value)
          setError(null)
        }}
        onSubmitEditing={() => passwordInput.current?.focus()}
        returnKeyType="next"
        textContentType="emailAddress"
        value={email}
      />
      <Field
        ref={passwordInput}
        autoCapitalize="none"
        autoComplete="current-password"
        editable={!busy}
        label={t("password")}
        onChangeText={(value) => {
          setPassword(value)
          setError(null)
        }}
        onSubmitEditing={() => void signIn()}
        returnKeyType="go"
        secureTextEntry
        textContentType="password"
        value={password}
      />
      <Feedback>{error}</Feedback>
      <PrimaryButton busy={busy} onPress={() => void signIn()}>
        {busy ? t("signingIn") : t("signInAction")}
      </PrimaryButton>
      <Text style={styles.help}>{t("accountHelp")}</Text>
      <TextButton disabled={busy} onPress={() => void onChangeWorkspace()}>{t("changeWorkspace")}</TextButton>
    </AuthScreen>
  )
}

const styles = StyleSheet.create({
  workspaceBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.backgroundStrong,
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  workspaceDot: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  workspaceBadgeText: {
    color: colors.inkSoft,
    fontSize: type.meta,
    fontWeight: "500",
    writingDirection: "ltr",
  },
  help: {
    color: colors.text,
    fontSize: type.meta,
    lineHeight: 19,
    marginTop: spacing.lg,
    textAlign: "left",
    writingDirection: "ltr",
  },
})
