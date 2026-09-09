import { forwardRef, type ComponentProps, type ReactNode } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { colors, radius, shadow, spacing, type } from "@/theme/tokens"

type FieldProps = ComponentProps<typeof TextInput> & {
  label: string
  suffix?: string
}

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, suffix, style, ...inputProps }, ref) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          {...inputProps}
          ref={ref}
          placeholderTextColor="rgba(104,117,112,0.55)"
          style={[styles.input, suffix ? styles.inputWithSuffix : undefined, style]}
          textAlign={inputProps.textContentType === "emailAddress" || suffix ? "left" : "left"}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  )
})

export function PrimaryButton({
  children,
  busy = false,
  disabled = false,
  onPress,
}: {
  children: ReactNode
  busy?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.primaryButtonPressed,
        (disabled || busy) && styles.primaryButtonDisabled,
      ]}
    >
      {busy ? <ActivityIndicator color={colors.surface} size="small" /> : null}
      <Text style={styles.primaryButtonText}>{children}</Text>
    </Pressable>
  )
}

export function TextButton({ children, disabled = false, onPress }: { children: ReactNode; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.textButton}>
      <Text style={[styles.textButtonLabel, disabled && styles.disabledText]}>{children}</Text>
    </Pressable>
  )
}

export function Feedback({ children }: { children?: string | null }) {
  if (!children) return null
  return (
    <View accessibilityRole="alert" style={styles.feedback}>
      <Text style={styles.feedbackText}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fieldGroup: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  label: {
    color: colors.ink,
    fontSize: type.label,
    fontWeight: "500",
    textAlign: "left",
    writingDirection: "ltr",
  },
  inputShell: {
    backgroundColor: colors.surface,
    borderColor: "rgba(11,20,19,0.06)",
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 58,
    overflow: "hidden",
    ...shadow.surface,
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    writingDirection: "ltr",
  },
  inputWithSuffix: {
    paddingRight: 4,
  },
  suffix: {
    alignSelf: "center",
    color: colors.subtle,
    fontSize: type.label,
    paddingRight: spacing.lg,
    writingDirection: "ltr",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonPressed: {
    backgroundColor: colors.accentPressed,
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: type.body,
    fontWeight: "500",
    writingDirection: "ltr",
  },
  textButton: {
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  textButtonLabel: {
    color: colors.accent,
    fontSize: type.label,
    fontWeight: "500",
    writingDirection: "ltr",
  },
  disabledText: {
    opacity: 0.5,
  },
  feedback: {
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  feedbackText: {
    color: colors.danger,
    fontSize: type.label,
    lineHeight: 20,
    textAlign: "left",
    writingDirection: "ltr",
  },
})
