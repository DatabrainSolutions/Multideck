import { useState, type PropsWithChildren, type ReactNode } from "react"
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { BrandLockup } from "./BrandLockup"
import { useWarehouseShell } from "./WarehouseShell"
import { colors, radius, shadow, spacing, type } from "@/theme/tokens"
import { wt } from "@/warehouse/i18n"

export function WarehouseScreen({ title, subtitle, onBack, actions, children }: PropsWithChildren<{ title?: string; subtitle?: string; onBack?: () => void; actions?: ReactNode }>) {
  const shell = useWarehouseShell()
  const [drawerOpen, setDrawerOpen] = useState(false)

  function runDrawerAction(action: () => void | Promise<void>) {
    setDrawerOpen(false)
    void action()
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel={wt("openMenu")} accessibilityRole="button" onPress={() => setDrawerOpen(true)} style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}>
          <BrandLockup />
        </Pressable>
        {shell?.facility ? <View style={styles.facilityBadge}><View style={styles.facilityDot} /><Text numberOfLines={1} style={styles.facilityBadgeText}>{shell.facility.name}</Text></View> : null}
      </View>
      {onBack || actions ? <View style={styles.secondaryBar}>
        {onBack ? <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>{"←"} {wt("back")}</Text></Pressable> : <View />}
        {actions}
      </View> : null}
      <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
      {shell ? <Modal animationType="fade" onRequestClose={() => setDrawerOpen(false)} visible={drawerOpen}>
        <SafeAreaView style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <BrandLockup />
            <Pressable accessibilityLabel={wt("closeMenu")} accessibilityRole="button" onPress={() => setDrawerOpen(false)} style={({ pressed }) => [styles.drawerClose, pressed && styles.menuButtonPressed]}><Text style={styles.drawerCloseText}>×</Text></Pressable>
          </View>
          <View style={styles.drawerContext}>
            <Text style={styles.drawerWorkspace}>{shell.workspaceName}</Text>
            <Text style={styles.drawerEmail}>{shell.email}</Text>
            {shell.facility ? <View style={styles.drawerFacility}><View style={styles.facilityDot} /><Text style={styles.drawerFacilityText}>{shell.facility.name}</Text></View> : null}
          </View>
          <View style={styles.drawerMenu}>
            {shell.facility ? <DrawerAction label={wt("changeWarehouse")} onPress={() => runDrawerAction(shell.onChangeWarehouse)} /> : null}
            <DrawerAction label={wt("changeWorkspace")} onPress={() => runDrawerAction(shell.onChangeWorkspace)} />
            <DrawerAction label={wt("signOut")} onPress={() => runDrawerAction(shell.onSignOut)} danger />
          </View>
        </SafeAreaView>
      </Modal> : null}
    </SafeAreaView>
  )
}

function DrawerAction({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.drawerAction, pressed && styles.menuButtonPressed]}><Text style={[styles.drawerActionText, danger && styles.drawerActionDanger]}>{label}</Text><Text style={[styles.drawerActionArrow, danger && styles.drawerActionDanger]}>{"→"}</Text></Pressable>
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

export function ActionTile({ label, detail, icon, code, onPress, disabled = false }: { label: string; detail?: string; icon?: string; code?: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.tilePressed, disabled && styles.tileDisabled]}>
      <View accessible={false} style={styles.tileIcon}><Text style={styles.tileIconText}>{icon ?? code}</Text></View>
      <View style={styles.tileCopy}><Text style={styles.tileLabel}>{label}</Text>{detail ? <Text style={styles.tileDetail}>{detail}</Text> : null}</View>
      <Text style={styles.tileArrow}>{"→"}</Text>
    </Pressable>
  )
}

export function WarehouseButton({ label, onPress, tone = "primary", disabled = false, busy = false, compact = false }: { label: string; onPress: () => void; tone?: "primary" | "danger" | "secondary"; disabled?: boolean; busy?: boolean; compact?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, compact && styles.buttonCompact, tone === "danger" && styles.buttonDanger, tone === "secondary" && styles.buttonSecondary, pressed && styles.buttonPressed, (disabled || busy) && styles.buttonDisabled]}>
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

export function LoadingState() {
  return (
    <View style={styles.state}>
      <View style={styles.stateIcon}><ActivityIndicator color={colors.accent} /></View>
      <Text style={styles.stateTitle}>{wt("loading")}</Text>
      <Text style={styles.stateText}>{wt("loadingDetail")}</Text>
    </View>
  )
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.stateError}>
      <View style={styles.stateIconError}><Text style={styles.stateIconErrorText}>!</Text></View>
      <Text style={styles.stateTitle}>{wt("loadFailed")}</Text>
      <Text style={styles.stateText}>{message}</Text>
      {onRetry ? <View style={styles.stateAction}><WarehouseButton label={wt("retry")} tone="secondary" onPress={onRetry} /></View> : null}
    </View>
  )
}
export function WarningState({ message }: { message: string }) { return <View style={styles.warning}><Text style={styles.warningText}>{message}</Text></View> }
export function EmptyState({ message = wt("noResults") }: { message?: string }) { return <View style={styles.stateEmpty}><Text style={styles.stateText}>{message}</Text></View> }
export function SuccessState({ message }: { message: string }) { return <View style={styles.success}><Text style={styles.successText}>{message}</Text></View> }

const directional = { textAlign: "left" as const, writingDirection: "ltr" as const }

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", minHeight: 72, paddingHorizontal: spacing.page },
  secondaryBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 52, paddingHorizontal: spacing.page },
  menuButton: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xl, justifyContent: "center", minHeight: 50, paddingHorizontal: spacing.md, ...shadow.surface },
  menuButtonPressed: { opacity: 0.62 },
  backButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  backText: { color: colors.accent, fontSize: type.label, fontWeight: "600", writingDirection: "ltr" },
  facilityBadge: { alignItems: "center", backgroundColor: colors.backgroundStrong, borderRadius: radius.lg, flexDirection: "row", flexShrink: 1, gap: spacing.sm, maxWidth: 180, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  facilityDot: { backgroundColor: colors.accent, borderRadius: 4, height: 7, width: 7 },
  facilityBadgeText: { color: colors.inkSoft, flexShrink: 1, fontSize: type.meta, fontWeight: "600", writingDirection: "ltr" },
  content: { flexGrow: 1, paddingBottom: 48, paddingHorizontal: spacing.page, paddingTop: spacing.md },
  title: { color: colors.ink, fontSize: 26, fontWeight: "600", letterSpacing: -0.4, ...directional },
  subtitle: { color: colors.text, fontSize: type.body, lineHeight: 22, marginBottom: spacing.xl, marginTop: spacing.sm, ...directional },
  scanGroup: { marginBottom: spacing.lg, marginTop: spacing.lg },
  scanInput: { backgroundColor: colors.surface, borderColor: colors.accent, borderRadius: radius.xl, borderWidth: 2, color: colors.ink, fontSize: 18, fontWeight: "500", minHeight: 62, paddingHorizontal: spacing.lg, textAlign: "left", writingDirection: "ltr", ...shadow.surface },
  scanInputMultiline: { minHeight: 96, paddingTop: spacing.lg, textAlignVertical: "top" },
  scanHint: { color: colors.subtle, fontSize: 11, marginTop: spacing.sm, ...directional },
  tile: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xxl, flexDirection: "row", gap: spacing.md, marginBottom: spacing.md, minHeight: 72, padding: spacing.lg, ...shadow.surface },
  tilePressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  tileDisabled: { opacity: 0.58 },
  tileIcon: { alignItems: "center", backgroundColor: colors.accentAbyss, borderRadius: radius.lg, height: 48, justifyContent: "center", width: 48 },
  tileIconText: { color: colors.accentLift, fontSize: 23, fontWeight: "600" },
  tileCopy: { flex: 1 },
  tileLabel: { color: colors.ink, fontSize: 16, fontWeight: "600", ...directional },
  tileDetail: { color: colors.text, fontSize: type.meta, lineHeight: 18, marginTop: spacing.xs, ...directional },
  tileArrow: { color: colors.accent, fontSize: 20 },
  button: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.xl, flexDirection: "row", gap: spacing.sm, justifyContent: "center", marginTop: spacing.lg, minHeight: 58, paddingHorizontal: spacing.lg },
  buttonCompact: { marginTop: 0, minHeight: 44, paddingHorizontal: spacing.md },
  buttonDanger: { backgroundColor: colors.danger },
  buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: 1 },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.48 },
  buttonText: { color: colors.surface, fontSize: type.body, fontWeight: "600", writingDirection: "ltr" },
  buttonTextSecondary: { color: colors.accent },
  card: { backgroundColor: colors.surface, borderRadius: radius.xxl, marginBottom: spacing.md, padding: spacing.lg, ...shadow.surface },
  cardHeader: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  cardTitleWrap: { flex: 1 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "600", ...directional },
  cardMeta: { color: colors.text, fontSize: type.meta, lineHeight: 18, marginTop: spacing.xs, ...directional },
  status: { backgroundColor: colors.backgroundStrong, borderRadius: radius.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusText: { color: colors.inkSoft, fontSize: 11, fontWeight: "600" },
  metricRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  metric: { backgroundColor: colors.backgroundStrong, borderRadius: radius.lg, flex: 1, padding: spacing.md },
  metricValue: { color: colors.ink, fontSize: 18, fontWeight: "600", textAlign: "left" },
  metricLabel: { color: colors.subtle, fontSize: 10, marginTop: 2, ...directional },
  state: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xxl, marginVertical: spacing.lg, padding: spacing.section, ...shadow.surface },
  stateError: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xxl, marginVertical: spacing.lg, padding: spacing.section, ...shadow.surface },
  stateEmpty: { alignItems: "center", paddingVertical: spacing.section },
  stateIcon: { alignItems: "center", backgroundColor: colors.backgroundStrong, borderRadius: radius.lg, height: 44, justifyContent: "center", marginBottom: spacing.md, width: 44 },
  stateIconError: { alignItems: "center", backgroundColor: colors.dangerSurface, borderRadius: radius.lg, height: 44, justifyContent: "center", marginBottom: spacing.md, width: 44 },
  stateIconErrorText: { color: colors.danger, fontSize: 22, fontWeight: "600", lineHeight: 26 },
  stateTitle: { color: colors.ink, fontSize: 15, fontWeight: "600", textAlign: "center", writingDirection: "ltr" },
  stateText: { color: colors.text, fontSize: type.label, lineHeight: 20, marginTop: spacing.xs, maxWidth: 380, textAlign: "center", writingDirection: "ltr" },
  stateAction: { alignSelf: "stretch", marginTop: spacing.sm },
  warning: { backgroundColor: colors.dangerSurface, borderRadius: radius.lg, marginVertical: spacing.md, padding: spacing.lg },
  warningText: { color: colors.danger, fontSize: type.label, lineHeight: 20, ...directional },
  success: { backgroundColor: "#e7f4ef", borderRadius: radius.lg, marginVertical: spacing.lg, padding: spacing.lg },
  successText: { color: colors.accent, fontSize: type.label, lineHeight: 20, ...directional },
  drawer: { backgroundColor: colors.background, flex: 1, paddingHorizontal: spacing.page },
  drawerHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 76 },
  drawerClose: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xl, height: 52, justifyContent: "center", width: 52, ...shadow.surface },
  drawerCloseText: { color: colors.text, fontSize: 28, fontWeight: "300", lineHeight: 30 },
  drawerContext: { backgroundColor: colors.backgroundStrong, borderRadius: radius.xxl, marginTop: spacing.lg, padding: spacing.xl },
  drawerWorkspace: { color: colors.ink, fontSize: 17, fontWeight: "600", ...directional },
  drawerEmail: { color: colors.text, fontSize: type.meta, marginTop: spacing.xs, textAlign: "left", writingDirection: "ltr" },
  drawerFacility: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  drawerFacilityText: { color: colors.inkSoft, fontSize: type.label, fontWeight: "600", ...directional },
  drawerMenu: { gap: spacing.md, paddingTop: spacing.xl },
  drawerAction: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xxl, flexDirection: "row", justifyContent: "space-between", minHeight: 72, paddingHorizontal: spacing.xl, ...shadow.surface },
  drawerActionText: { color: colors.ink, fontSize: 16, fontWeight: "600", ...directional },
  drawerActionArrow: { color: colors.subtle, fontSize: 22 },
  drawerActionDanger: { color: colors.danger },
})
