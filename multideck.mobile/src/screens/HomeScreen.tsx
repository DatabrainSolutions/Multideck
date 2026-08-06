import { StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import type { Session } from "@supabase/supabase-js"
import { BrandLockup } from "@/components/BrandLockup"
import { PrimaryButton, TextButton } from "@/components/FormControls"
import { isRtl, t, textDirection } from "@/i18n"
import type { WorkspaceConfiguration } from "@/auth/workspace"
import { colors, radius, shadow, spacing, type } from "@/theme/tokens"

type HomeScreenProps = {
  session: Session
  workspace: WorkspaceConfiguration
  onSignOut: () => Promise<void>
  onChangeWorkspace: () => Promise<void>
}

export function HomeScreen({ session, workspace, onSignOut, onChangeWorkspace }: HomeScreenProps) {
  const rootHost = (process.env.EXPO_PUBLIC_MULTIDECK_ROOT_HOST || "multideck.app").trim().toLowerCase()

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <BrandLockup />
        <View style={styles.workspaceBadge}>
          <View style={styles.workspaceDot} />
          <Text style={styles.workspaceBadgeText}>{workspace.workspace.name}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>{t("privateWorkspace")}</Text>
        <Text style={styles.title}>{t("welcome")}</Text>
        <Text style={styles.body}>{t("welcomeBody")}</Text>

        <View style={styles.sessionPanel}>
          <Text style={styles.sessionLabel}>{t("signedInAs")}</Text>
          <Text style={styles.email}>{session.user.email || "—"}</Text>
          <Text style={styles.host}>{workspace.workspace.slug}.{rootHost}</Text>
        </View>

        <PrimaryButton onPress={() => void onSignOut()}>{t("signOut")}</PrimaryButton>
        <TextButton onPress={() => void onChangeWorkspace()}>{t("changeWorkspace")}</TextButton>
      </View>
    </SafeAreaView>
  )
}

const directionalText = {
  textAlign: isRtl ? "right" as const : "left" as const,
  writingDirection: textDirection,
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: "center",
    flexDirection: isRtl ? "row-reverse" : "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.lg,
  },
  workspaceBadge: {
    alignItems: "center",
    backgroundColor: colors.backgroundStrong,
    borderRadius: radius.lg,
    flexDirection: isRtl ? "row-reverse" : "row",
    gap: spacing.sm,
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
    writingDirection: textDirection,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.page,
    paddingTop: 56,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: type.meta,
    fontWeight: "500",
    marginBottom: spacing.md,
    ...directionalText,
  },
  title: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: "500",
    ...directionalText,
  },
  body: {
    color: colors.text,
    fontSize: type.body,
    lineHeight: 22,
    marginTop: spacing.sm,
    ...directionalText,
  },
  sessionPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    marginTop: spacing.section,
    padding: spacing.xl,
    ...shadow.surface,
  },
  sessionLabel: {
    color: colors.subtle,
    fontSize: type.meta,
    ...directionalText,
  },
  email: {
    color: colors.ink,
    fontSize: type.heading,
    fontWeight: "500",
    marginTop: spacing.sm,
    textAlign: "left",
    writingDirection: "ltr",
  },
  host: {
    color: colors.text,
    fontSize: type.meta,
    marginTop: spacing.sm,
    textAlign: "left",
    writingDirection: "ltr",
  },
})
