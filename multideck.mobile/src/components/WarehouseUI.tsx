import type { PropsWithChildren, ReactNode } from "react"
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { BrandLockup } from "./BrandLockup"
import { isRtl, textDirection } from "@/i18n"
import { colors, radius, shadow, spacing, type } from "@/theme/tokens"
import { wt } from "@/warehouse/i18n"

export function WarehouseScreen({ title, subtitle, onBack, actions, children }: PropsWithChildren<{ title: string; subtitle?: string; onBack?: () => void; actions?: ReactNode }>) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        {onBack ? <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>{isRtl ? "→" : "←"} {wt("back")}</Text></Pressable> : <BrandLockup />}
        {actions}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

export function ScanField({ value, onChangeText, onSubmit, placeholder = wt("searchOrScan"), autoFocus = false, multiline = false }: { value: string; onChangeText: (value: string) => void; onSubmit?: () => void; placeholder?: string; autoFocus?: boolean; multiline?: boolean }) {
  return (
    <View style={styles.scanGroup}>
      <TextInput
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus={autoFocus}
        blurOnSubmit={!multiline}
        multiline={multiline}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor="rgba(104,117,112,0.58)"
        returnKeyType={onSubmit ? "search" : "done"}
        style={[styles.scanInput, multiline && styles.scanInputMultiline]}
        value={value}
      />
      <Text style={styles.scanHint}>{wt("scanHint")}</Text>
    </View>
  )
}

export function ActionTile({ label, detail, code, onPress, disabled = false }: { label: string; detail: string; code: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.tilePressed, disabled && styles.tileDisabled]}>
      <View style={styles.tileCode}><Text style={styles.tileCodeText}>{code}</Text></View>
      <View style={styles.tileCopy}><Text style={styles.tileLabel}>{label}</Text><Text style={styles.tileDetail}>{detail}</Text></View>
      <Text style={styles.tileArrow}>{isRtl ? "←" : "→"}</Text>
    </Pressable>
  )
}

export function WarehouseButton({ label, onPress, tone = "primary", disabled = false, busy = false }: { label: string; onPress: () => void; tone?: "primary" | "danger" | "secondary"; disabled?: boolean; busy?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, tone === "danger" && styles.buttonDanger, tone === "secondary" && styles.buttonSecondary, pressed && styles.buttonPressed, (disabled || busy) && styles.buttonDisabled]}>
      {busy ? <ActivityIndicator color={tone === "secondary" ? colors.accent : colors.surface} /> : null}
      <Text style={[styles.buttonText, tone === "secondary" && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  )
}

export function DataCard({ title, meta, status, children, onPress }: PropsWithChildren<{ title: string; meta?: string | null; status?: string | null; onPress?: () => void }>) {
  const content = <><View style={styles.cardHeader}><View style={styles.cardTitleWrap}><Text style={styles.cardTitle}>{title}</Text>{meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}</View>{status ? <View style={styles.status}><Text style={styles.statusText}>{status}</Text></View> : null}</View>{children}</>
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.tilePressed]}>{content}</Pressable> : <View style={styles.card}>{content}</View>
}

export function MetricRow({ values }: { values: { label: string; value: string }[] }) {
  return <View style={styles.metricRow}>{values.map((item) => <View key={item.label} style={styles.metric}><Text style={styles.metricValue}>{item.value}</Text><Text style={styles.metricLabel}>{item.label}</Text></View>)}</View>
}

export function LoadingState() { return <View style={styles.state}><ActivityIndicator color={colors.accent} /><Text style={styles.stateText}>{wt("loading")}</Text></View> }
export function EmptyState({ message = wt("noResults") }: { message?: string }) { return <View style={styles.state}><Text style={styles.stateText}>{message}</Text></View> }
export function ErrorState({ message }: { message: string }) { return <View style={styles.error}><Text style={styles.errorText}>{message}</Text></View> }
export function SuccessState({ message }: { message: string }) { return <View style={styles.success}><Text style={styles.successText}>{message}</Text></View> }

const directional = { textAlign: isRtl ? "right" as const : "left" as const, writingDirection: textDirection }

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", flexDirection: isRtl ? "row-reverse" : "row", justifyContent: "space-between", minHeight: 64, paddingHorizontal: spacing.page },
  backButton: { minHeight: 48, justifyContent: "center", paddingRight: spacing.lg },
  backText: { color: colors.accent, fontSize: type.label, fontWeight: "600", writingDirection: textDirection },
  content: { flexGrow: 1, paddingBottom: 48, paddingHorizontal: spacing.page, paddingTop: spacing.md },
  title: { color: colors.ink, fontSize: 26, fontWeight: "600", letterSpacing: -0.4, ...directional },
  subtitle: { color: colors.text, fontSize: type.body, lineHeight: 22, marginBottom: spacing.xl, marginTop: spacing.sm, ...directional },
  scanGroup: { marginBottom: spacing.lg, marginTop: spacing.lg },
  scanInput: { backgroundColor: colors.surface, borderColor: colors.accent, borderRadius: radius.xl, borderWidth: 2, color: colors.ink, fontSize: 18, fontWeight: "500", minHeight: 62, paddingHorizontal: spacing.lg, textAlign: "left", writingDirection: "ltr", ...shadow.surface },
  scanInputMultiline: { minHeight: 96, paddingTop: spacing.lg, textAlignVertical: "top" },
  scanHint: { color: colors.subtle, fontSize: 11, marginTop: spacing.sm, ...directional },
  tile: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xxl, flexDirection: isRtl ? "row-reverse" : "row", gap: spacing.md, marginBottom: spacing.md, minHeight: 86, padding: spacing.lg, ...shadow.surface },
  tilePressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  tileDisabled: { opacity: 0.58 },
  tileCode: { alignItems: "center", backgroundColor: colors.accentAbyss, borderRadius: radius.lg, height: 48, justifyContent: "center", width: 48 },
  tileCodeText: { color: colors.accentLift, fontSize: type.label, fontWeight: "700" },
  tileCopy: { flex: 1 },
  tileLabel: { color: colors.ink, fontSize: 16, fontWeight: "600", ...directional },
  tileDetail: { color: colors.text, fontSize: type.meta, lineHeight: 18, marginTop: spacing.xs, ...directional },
  tileArrow: { color: colors.accent, fontSize: 20 },
  button: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.xl, flexDirection: "row", gap: spacing.sm, justifyContent: "center", marginTop: spacing.lg, minHeight: 58, paddingHorizontal: spacing.lg },
  buttonDanger: { backgroundColor: colors.danger },
  buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: 1 },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.48 },
  buttonText: { color: colors.surface, fontSize: type.body, fontWeight: "600", writingDirection: textDirection },
  buttonTextSecondary: { color: colors.accent },
  card: { backgroundColor: colors.surface, borderRadius: radius.xxl, marginBottom: spacing.md, padding: spacing.lg, ...shadow.surface },
  cardHeader: { alignItems: "flex-start", flexDirection: isRtl ? "row-reverse" : "row", gap: spacing.md, justifyContent: "space-between" },
  cardTitleWrap: { flex: 1 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "600", ...directional },
  cardMeta: { color: colors.text, fontSize: type.meta, lineHeight: 18, marginTop: spacing.xs, ...directional },
  status: { backgroundColor: colors.backgroundStrong, borderRadius: radius.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusText: { color: colors.inkSoft, fontSize: 11, fontWeight: "600" },
  metricRow: { flexDirection: isRtl ? "row-reverse" : "row", gap: spacing.sm, marginTop: spacing.lg },
  metric: { backgroundColor: colors.backgroundStrong, borderRadius: radius.lg, flex: 1, padding: spacing.md },
  metricValue: { color: colors.ink, fontSize: 18, fontWeight: "600", textAlign: isRtl ? "right" : "left" },
  metricLabel: { color: colors.subtle, fontSize: 10, marginTop: 2, ...directional },
  state: { alignItems: "center", gap: spacing.md, paddingVertical: 48 },
  stateText: { color: colors.text, fontSize: type.label, textAlign: "center", writingDirection: textDirection },
  error: { backgroundColor: colors.dangerSurface, borderRadius: radius.lg, marginVertical: spacing.lg, padding: spacing.lg },
  errorText: { color: colors.danger, fontSize: type.label, lineHeight: 20, ...directional },
  success: { backgroundColor: "#e7f4ef", borderRadius: radius.lg, marginVertical: spacing.lg, padding: spacing.lg },
  successText: { color: colors.accent, fontSize: type.label, lineHeight: 20, ...directional },
})
