import { forwardRef, useRef, useState, type PropsWithChildren, type ReactNode } from "react"
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { BrandLockup } from "./BrandLockup"
import { useWarehouseShell } from "./WarehouseShell"
import { colors, radius, shadow, spacing, type } from "@/theme/tokens"
import { wt } from "@/warehouse/i18n"
import { useSoftKeyboard, type ScanStatus } from "@/warehouse/scanner"

export function WarehouseScreen({ title, subtitle, onBack, actions, onRefresh, refreshing = false, children }: PropsWithChildren<{ title?: string; subtitle?: string; onBack?: () => void; actions?: ReactNode; onRefresh?: () => void; refreshing?: boolean }>) {
  const shell = useWarehouseShell()
  const [drawerOpen, setDrawerOpen] = useState(false)

  function runDrawerAction(action: () => void | Promise<void>) {
    setDrawerOpen(false)
    void action()
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* One compact bar: handheld screens are short, so the first scan must sit above the fold. */}
      <View style={styles.topBar}>
        {onBack ? <>
          <Pressable accessibilityLabel={wt("back")} accessibilityRole="button" hitSlop={6} onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.menuButtonPressed]}><Text style={styles.backText}>{"←"}</Text></Pressable>
          {title ? <Text accessibilityRole="header" numberOfLines={1} style={styles.barTitle}>{title}</Text> : <View style={styles.barSpacer} />}
        </> : <>
          <Pressable accessibilityLabel={wt("openMenu")} accessibilityRole="button" onPress={() => setDrawerOpen(true)} style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}>
            <BrandLockup />
          </Pressable>
          <View style={styles.barSpacer} />
        </>}
        {actions}
        {!onBack && shell?.facility ? <Pressable accessibilityLabel={`${wt("facility")}: ${shell.facility.name}. ${wt("openMenu")}`} accessibilityRole="button" onPress={() => setDrawerOpen(true)} style={({ pressed }) => [styles.facilityBadge, pressed && styles.menuButtonPressed]}><View style={styles.facilityDot} /><Text numberOfLines={1} style={styles.facilityBadgeText}>{shell.facility.name}</Text></Pressable> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl colors={[colors.accent]} onRefresh={onRefresh} refreshing={refreshing} /> : undefined}>
        {title && !onBack ? <Text accessibilityRole="header" style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={[styles.subtitle, onBack && styles.subtitleCompact]}>{subtitle}</Text> : null}
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

type ScanFieldProps = {
  label?: string
  value: string
  onChangeText: (value: string) => void
  /** Receives the submitted text directly: scanners can send Enter before state re-renders. */
  onSubmit?: (text: string) => void
  placeholder?: string
  /** What the operator is expected to scan, e.g. the task's source location. */
  expected?: string | null
  status?: ScanStatus
  message?: string | null
  autoFocus?: boolean
  multiline?: boolean
  editable?: boolean
}

export const ScanField = forwardRef<TextInput, ScanFieldProps>(function ScanField({ label, value, onChangeText, onSubmit, placeholder = wt("searchOrScan"), expected, status = "idle", message, autoFocus = false, multiline = false, editable = true }, forwardedRef) {
  const [softKeyboard, toggleSoftKeyboard] = useSoftKeyboard()
  const inputRef = useRef<TextInput | null>(null)
  const setRef = (node: TextInput | null) => {
    inputRef.current = node
    if (typeof forwardedRef === "function") forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }
  const statusText = status === "checking" ? wt("scanChecking") : status === "matched" ? message || wt("scanMatched") : message
  function toggleKeyboard() {
    toggleSoftKeyboard()
    // Android applies showSoftInputOnFocus on the next focus.
    inputRef.current?.blur()
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  return (
    <View style={styles.scanGroup}>
      {label || expected ? <View style={styles.scanLabelRow}>
        {label ? <Text style={styles.scanLabel}>{label}</Text> : <View />}
        {expected ? <Text numberOfLines={1} style={styles.scanExpected}>{expected}</Text> : null}
      </View> : null}
      <View style={[styles.scanShell, status === "matched" && styles.scanShellMatched, status === "warning" && styles.scanShellWarning, status === "mismatch" && styles.scanShellMismatch, !editable && styles.scanShellLocked]}>
        <TextInput
          ref={setRef}
          accessibilityLabel={label ?? placeholder}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus={autoFocus}
          editable={editable}
          multiline={multiline}
          onChangeText={onChangeText}
          onSubmitEditing={(event) => {
            const text = event.nativeEvent.text
            onSubmit?.(text)
            // Select the scan so the next trigger pull replaces it instead of appending.
            if (!multiline) setTimeout(() => inputRef.current?.setSelection(0, text.length), 0)
          }}
          placeholder={placeholder}
          placeholderTextColor="rgba(104,117,112,0.58)"
          returnKeyType={onSubmit ? "go" : "done"}
          selectTextOnFocus
          showSoftInputOnFocus={softKeyboard}
          spellCheck={false}
          submitBehavior={multiline ? "newline" : "submit"}
          style={[styles.scanInput, multiline && styles.scanInputMultiline]}
          value={value}
        />
        {status === "checking" ? <ActivityIndicator color={colors.accent} style={styles.scanIndicator} /> : status === "matched" ? <Text accessible={false} style={styles.scanTick}>✓</Text> : null}
        <Pressable accessibilityLabel={softKeyboard ? wt("hideKeyboard") : wt("showKeyboard")} accessibilityRole="button" hitSlop={8} onPress={toggleKeyboard} style={({ pressed }) => [styles.keyboardToggle, softKeyboard && styles.keyboardToggleOn, pressed && styles.menuButtonPressed]}>
          <Text style={[styles.keyboardToggleText, softKeyboard && styles.keyboardToggleTextOn]}>{wt("keyboardShort")}</Text>
        </Pressable>
      </View>
      {statusText ? <Text accessibilityLiveRegion="polite" style={[styles.scanStatus, status === "matched" && styles.scanStatusMatched, status === "mismatch" && styles.scanStatusMismatch, status === "warning" && styles.scanStatusWarning]}>{statusText}</Text> : null}
    </View>
  )
})

export function QuantityField({ label, value, onChangeText, max, uomCode }: { label: string; value: string; onChangeText: (value: string) => void; max?: number; uomCode?: string }) {
  const numeric = Number(value)
  const current = Number.isFinite(numeric) ? numeric : 0
  const step = (delta: number) => {
    const next = Math.max(0, Math.min(max ?? Number.POSITIVE_INFINITY, current + delta))
    onChangeText(String(Number.isInteger(next) ? next : Number(next.toFixed(3))))
  }
  return (
    <View style={styles.scanGroup}>
      <View style={styles.scanLabelRow}>
        <Text style={styles.scanLabel}>{label}</Text>
        {max !== undefined ? <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onChangeText(String(max))}><Text style={styles.scanExpected}>{wt("allOf")} {max}{uomCode ? ` ${uomCode}` : ""}</Text></Pressable> : null}
      </View>
      <View style={styles.quantityRow}>
        <Pressable accessibilityLabel={wt("decrease")} accessibilityRole="button" disabled={current <= 0} onPress={() => step(-1)} style={({ pressed }) => [styles.stepper, pressed && styles.menuButtonPressed, current <= 0 && styles.buttonDisabled]}><Text style={styles.stepperText}>−</Text></Pressable>
        <View style={styles.quantityShell}>
          <TextInput accessibilityLabel={label} keyboardType="decimal-pad" onChangeText={onChangeText} selectTextOnFocus style={styles.quantityInput} value={value} />
          {uomCode ? <Text style={styles.quantityUom}>{uomCode}</Text> : null}
        </View>
        <Pressable accessibilityLabel={wt("increase")} accessibilityRole="button" disabled={max !== undefined && current >= max} onPress={() => step(1)} style={({ pressed }) => [styles.stepper, pressed && styles.menuButtonPressed, max !== undefined && current >= max && styles.buttonDisabled]}><Text style={styles.stepperText}>+</Text></Pressable>
      </View>
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

/** A work queue with its live count; the count is the reason to open it. */
export function QueueTile({ label, count, detail, onPress }: { label: string; count: string; detail?: string; onPress: () => void }) {
  const idle = count === "0"
  return (
    <Pressable accessibilityLabel={`${label}: ${count}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.queueTile, pressed && styles.tilePressed]}>
      <Text style={[styles.queueCount, idle && styles.queueCountIdle]}>{count}</Text>
      <Text style={styles.queueLabel}>{label}</Text>
      {detail ? <Text numberOfLines={2} style={styles.queueDetail}>{detail}</Text> : null}
    </Pressable>
  )
}

export function SectionLabel({ children }: { children: string }) {
  return <Text accessibilityRole="header" style={styles.sectionLabel}>{children}</Text>
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
  topBar: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 60, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  barTitle: { color: colors.ink, flex: 1, fontSize: type.heading, fontWeight: "500", ...directional },
  barSpacer: { flex: 1 },
  menuButton: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xl, justifyContent: "center", minHeight: 48, paddingHorizontal: spacing.md, ...shadow.surface },
  menuButtonPressed: { opacity: 0.62 },
  backButton: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xl, height: 48, justifyContent: "center", width: 48, ...shadow.surface },
  backText: { color: colors.accent, fontSize: 22, fontWeight: "500", lineHeight: 26 },
  facilityBadge: { alignItems: "center", backgroundColor: colors.backgroundStrong, borderRadius: radius.lg, flexDirection: "row", flexShrink: 1, gap: spacing.sm, maxWidth: 180, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  facilityDot: { backgroundColor: colors.accent, borderRadius: 4, height: 7, width: 7 },
  facilityBadgeText: { color: colors.inkSoft, flexShrink: 1, fontSize: type.meta, fontWeight: "500", writingDirection: "ltr" },
  content: { flexGrow: 1, paddingBottom: 48, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { color: colors.ink, fontSize: type.title, fontWeight: "500", letterSpacing: -0.3, ...directional },
  subtitle: { color: colors.text, fontSize: type.body, lineHeight: 22, marginBottom: spacing.lg, marginTop: spacing.sm, ...directional },
  subtitleCompact: { fontSize: type.label, lineHeight: 18, marginBottom: spacing.sm, marginTop: 0 },
  scanGroup: { marginBottom: spacing.md, marginTop: spacing.md },
  scanLabelRow: { alignItems: "baseline", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginBottom: spacing.sm },
  scanLabel: { color: colors.ink, fontSize: type.label, fontWeight: "500", ...directional },
  scanExpected: { color: colors.accent, flexShrink: 1, fontSize: type.label, fontWeight: "500", textAlign: "right", writingDirection: "ltr" },
  scanShell: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.accent, borderRadius: radius.xl, borderWidth: 2, flexDirection: "row", minHeight: 62, paddingRight: 6, ...shadow.surface },
  scanShellMatched: { backgroundColor: colors.successSurface, borderColor: colors.success },
  scanShellWarning: { backgroundColor: colors.warningSurface, borderColor: colors.warning },
  scanShellMismatch: { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
  scanShellLocked: { opacity: 0.6 },
  scanInput: { color: colors.ink, flex: 1, fontSize: 18, fontWeight: "500", minHeight: 58, paddingHorizontal: spacing.lg, textAlign: "left", writingDirection: "ltr" },
  scanInputMultiline: { minHeight: 96, paddingTop: spacing.lg, textAlignVertical: "top" },
  scanIndicator: { marginRight: spacing.sm },
  scanTick: { color: colors.success, fontSize: 20, fontWeight: "500", marginRight: spacing.sm },
  // Inner radius follows outer radius (14) minus the 6px shell inset.
  keyboardToggle: { alignItems: "center", backgroundColor: colors.backgroundStrong, borderRadius: radius.xl - 6, height: 46, justifyContent: "center", minWidth: 52, paddingHorizontal: spacing.sm },
  keyboardToggleOn: { backgroundColor: colors.accent },
  keyboardToggleText: { color: colors.inkSoft, fontSize: 11, fontWeight: "500" },
  keyboardToggleTextOn: { color: colors.surface },
  scanStatus: { color: colors.text, fontSize: type.label, lineHeight: 18, marginTop: spacing.sm, ...directional },
  scanStatusMatched: { color: colors.success },
  scanStatusMismatch: { color: colors.danger },
  scanStatusWarning: { color: colors.warning },
  quantityRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  stepper: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xl, height: 62, justifyContent: "center", width: 62, ...shadow.surface },
  stepperText: { color: colors.accent, fontSize: 28, fontWeight: "400", lineHeight: 32 },
  quantityShell: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xl, flex: 1, flexDirection: "row", height: 62, paddingHorizontal: spacing.lg, ...shadow.surface },
  quantityInput: { color: colors.ink, flex: 1, fontSize: 22, fontWeight: "500", textAlign: "center" },
  quantityUom: { color: colors.subtle, fontSize: type.label },
  queueTile: { backgroundColor: colors.surface, borderRadius: radius.xxl, flex: 1, minHeight: 116, padding: spacing.lg, ...shadow.surface },
  queueCount: { color: colors.accent, fontSize: 30, fontWeight: "500", letterSpacing: -0.5 },
  queueCountIdle: { color: colors.subtle },
  queueLabel: { color: colors.ink, fontSize: 16, fontWeight: "500", marginTop: spacing.xs, ...directional },
  queueDetail: { color: colors.text, fontSize: type.meta, lineHeight: 16, marginTop: 2, ...directional },
  sectionLabel: { color: colors.subtle, fontSize: type.meta, fontWeight: "500", letterSpacing: 0.4, marginBottom: spacing.sm, marginTop: spacing.lg, textTransform: "uppercase", ...directional },
  tile: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xxl, flexDirection: "row", gap: spacing.md, marginBottom: spacing.md, minHeight: 72, padding: spacing.lg, ...shadow.surface },
  tilePressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  tileDisabled: { opacity: 0.58 },
  tileIcon: { alignItems: "center", backgroundColor: colors.accentAbyss, borderRadius: radius.lg, height: 48, justifyContent: "center", width: 48 },
  tileIconText: { color: colors.accentLift, fontSize: 23, fontWeight: "500" },
  tileCopy: { flex: 1 },
  tileLabel: { color: colors.ink, fontSize: 16, fontWeight: "500", ...directional },
  tileDetail: { color: colors.text, fontSize: type.meta, lineHeight: 18, marginTop: spacing.xs, ...directional },
  tileArrow: { color: colors.accent, fontSize: 20 },
  button: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.xl, flexDirection: "row", gap: spacing.sm, justifyContent: "center", marginTop: spacing.lg, minHeight: 58, paddingHorizontal: spacing.lg },
  buttonCompact: { marginTop: 0, minHeight: 44, paddingHorizontal: spacing.md },
  buttonDanger: { backgroundColor: colors.danger },
  buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: 1 },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.48 },
  buttonText: { color: colors.surface, fontSize: type.body, fontWeight: "500", writingDirection: "ltr" },
  buttonTextSecondary: { color: colors.accent },
  card: { backgroundColor: colors.surface, borderRadius: radius.xxl, marginBottom: spacing.md, padding: spacing.lg, ...shadow.surface },
  cardHeader: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  cardTitleWrap: { flex: 1 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "500", ...directional },
  cardMeta: { color: colors.text, fontSize: type.meta, lineHeight: 18, marginTop: spacing.xs, ...directional },
  status: { backgroundColor: colors.backgroundStrong, borderRadius: radius.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusText: { color: colors.inkSoft, fontSize: 11, fontWeight: "500" },
  metricRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  metric: { backgroundColor: colors.backgroundStrong, borderRadius: radius.lg, flex: 1, padding: spacing.md },
  metricValue: { color: colors.ink, fontSize: 18, fontWeight: "500", textAlign: "left" },
  metricLabel: { color: colors.subtle, fontSize: 10, marginTop: 2, ...directional },
  state: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xxl, marginVertical: spacing.lg, padding: spacing.section, ...shadow.surface },
  stateError: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xxl, marginVertical: spacing.lg, padding: spacing.section, ...shadow.surface },
  stateEmpty: { alignItems: "center", paddingVertical: spacing.section },
  stateIcon: { alignItems: "center", backgroundColor: colors.backgroundStrong, borderRadius: radius.lg, height: 44, justifyContent: "center", marginBottom: spacing.md, width: 44 },
  stateIconError: { alignItems: "center", backgroundColor: colors.dangerSurface, borderRadius: radius.lg, height: 44, justifyContent: "center", marginBottom: spacing.md, width: 44 },
  stateIconErrorText: { color: colors.danger, fontSize: 22, fontWeight: "500", lineHeight: 26 },
  stateTitle: { color: colors.ink, fontSize: 15, fontWeight: "500", textAlign: "center", writingDirection: "ltr" },
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
  drawerWorkspace: { color: colors.ink, fontSize: 17, fontWeight: "500", ...directional },
  drawerEmail: { color: colors.text, fontSize: type.meta, marginTop: spacing.xs, textAlign: "left", writingDirection: "ltr" },
  drawerFacility: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  drawerFacilityText: { color: colors.inkSoft, fontSize: type.label, fontWeight: "500", ...directional },
  drawerMenu: { gap: spacing.md, paddingTop: spacing.xl },
  drawerAction: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xxl, flexDirection: "row", justifyContent: "space-between", minHeight: 72, paddingHorizontal: spacing.xl, ...shadow.surface },
  drawerActionText: { color: colors.ink, fontSize: 16, fontWeight: "500", ...directional },
  drawerActionArrow: { color: colors.subtle, fontSize: 22 },
  drawerActionDanger: { color: colors.danger },
})
