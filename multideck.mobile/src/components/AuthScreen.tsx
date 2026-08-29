import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react"
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { BrandLockup } from "./BrandLockup"
import { t } from "@/i18n"
import { colors, radius, spacing, type } from "@/theme/tokens"

type AuthScreenProps = PropsWithChildren<{
  title: string
  description: string
  badge?: ReactNode
}>

export function AuthScreen({ title, description, badge, children }: AuthScreenProps) {
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true))
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboard}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[styles.scrollContent, keyboardVisible && styles.scrollContentKeyboard]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.brandPanel, keyboardVisible && styles.brandPanelKeyboard]}>
            <View style={styles.glowOne} />
            <View style={styles.glowTwo} />
            <BrandLockup inverted />
            <View style={[styles.brandCopy, keyboardVisible && styles.brandCopyKeyboard]}>
              <View style={[styles.privateBadge, keyboardVisible && styles.privateBadgeKeyboard]}>
                <View style={styles.statusDot} />
                <Text style={[styles.privateBadgeText, styles.directionalText]}>{t("privateWorkspace")}</Text>
              </View>
              {!keyboardVisible ? <Text style={[styles.brandTitle, styles.directionalText]}>{t("freightTitle")}</Text> : null}
              {!keyboardVisible ? <Text style={[styles.brandBody, styles.directionalText]}>{t("freightBody")}</Text> : null}
            </View>
          </View>

          <View style={[styles.formPanel, keyboardVisible && styles.formPanelKeyboard]}>
            {badge}
            <Text style={[styles.title, styles.directionalText]}>{title}</Text>
            <Text style={[styles.description, styles.directionalText]}>{description}</Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentKeyboard: {
    paddingBottom: spacing.xl,
  },
  brandPanel: {
    backgroundColor: colors.accentAbyss,
    minHeight: 300,
    overflow: "hidden",
    paddingHorizontal: spacing.page,
    paddingTop: spacing.xl,
  },
  brandPanelKeyboard: {
    minHeight: 96,
    paddingBottom: spacing.md,
    paddingTop: spacing.md,
  },
  glowOne: {
    backgroundColor: "rgba(49,178,159,0.18)",
    borderRadius: 160,
    height: 280,
    position: "absolute",
    right: -90,
    top: -100,
    width: 280,
  },
  glowTwo: {
    backgroundColor: "rgba(104,142,83,0.13)",
    borderRadius: 130,
    bottom: -110,
    height: 250,
    left: 45,
    position: "absolute",
    width: 250,
  },
  brandCopy: {
    marginTop: "auto",
    paddingBottom: spacing.xl,
  },
  brandCopyKeyboard: {
    alignItems: "flex-end",
    flexDirection: "row",
    marginTop: spacing.sm,
    paddingBottom: 0,
  },
  privateBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.16)",
    borderRadius: radius.xl,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  privateBadgeKeyboard: {
    marginBottom: 0,
  },
  statusDot: {
    backgroundColor: colors.accentLift,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  privateBadgeText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: type.meta,
    fontWeight: "500",
  },
  brandTitle: {
    color: colors.surface,
    fontSize: type.title,
    fontWeight: "500",
    lineHeight: 30,
  },
  brandBody: {
    color: "rgba(255,255,255,0.62)",
    fontSize: type.label,
    lineHeight: 20,
    marginTop: spacing.md,
    maxWidth: 350,
  },
  formPanel: {
    backgroundColor: colors.background,
    flex: 1,
    paddingBottom: spacing.section,
    paddingHorizontal: spacing.page,
    paddingTop: spacing.section,
  },
  formPanelKeyboard: {
    paddingBottom: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: "500",
    lineHeight: 31,
  },
  description: {
    color: colors.text,
    fontSize: type.body,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  directionalText: {
    textAlign: "left",
    writingDirection: "ltr",
  },
})
