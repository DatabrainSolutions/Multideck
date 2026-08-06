import { useState } from "react"
import { StyleSheet, Text } from "react-native"
import { AuthScreen } from "@/components/AuthScreen"
import { Feedback, Field, PrimaryButton } from "@/components/FormControls"
import { t, isRtl, textDirection } from "@/i18n"
import { discoverWorkspace, isValidWorkspaceSlug, normalizeWorkspaceSlug, type WorkspaceConfiguration } from "@/auth/workspace"
import { colors, spacing, type } from "@/theme/tokens"

export function WorkspaceScreen({ onWorkspaceSelected }: { onWorkspaceSelected: (configuration: WorkspaceConfiguration) => Promise<void> }) {
  const [workspace, setWorkspace] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rootHost = (process.env.EXPO_PUBLIC_MULTIDECK_ROOT_HOST || "multideck.app").trim().toLowerCase()

  async function continueToWorkspace() {
    const slug = normalizeWorkspaceSlug(workspace)
    setError(null)

    if (!isValidWorkspaceSlug(slug)) {
      setError(t("workspaceInvalid"))
      return
    }

    setBusy(true)
    try {
      const configuration = await discoverWorkspace(slug)
      await onWorkspaceSelected(configuration)
    } catch {
      setError(t("workspaceUnavailable"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthScreen title={t("openWorkspace")} description={t("workspaceIntro")}>
      <Field
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        label={t("workspace")}
        onChangeText={(value) => {
          setWorkspace(value)
          setError(null)
        }}
        onSubmitEditing={() => void continueToWorkspace()}
        placeholder={t("workspacePlaceholder")}
        returnKeyType="go"
        suffix={`.${rootHost}`}
        value={workspace}
      />
      <Feedback>{error}</Feedback>
      <PrimaryButton busy={busy} onPress={() => void continueToWorkspace()}>{t("open")}</PrimaryButton>
      <Text style={styles.help}>{t("workspaceHelp")}</Text>
    </AuthScreen>
  )
}

const styles = StyleSheet.create({
  help: {
    color: colors.text,
    fontSize: type.meta,
    lineHeight: 19,
    marginTop: spacing.lg,
    textAlign: isRtl ? "right" : "left",
    writingDirection: textDirection,
  },
})
