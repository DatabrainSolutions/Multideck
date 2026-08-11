import { StyleSheet, Text, View } from "react-native"
import { colors } from "@/theme/tokens"

export function BrandMark({ inverted = false }: { inverted?: boolean }) {
  const ink = inverted ? colors.surface : colors.ink

  return (
    <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.deck, styles.deckBack, { backgroundColor: ink }]} />
      <View style={[styles.deck, styles.deckMiddle, { backgroundColor: ink }]} />
      <View style={[styles.deck, styles.deckFront]} />
    </View>
  )
}

export function BrandLockup({ inverted = false }: { inverted?: boolean }) {
  const ink = inverted ? colors.surface : colors.ink

  return (
    <View style={styles.lockup} accessibilityLabel="Multideck">
      <BrandMark inverted={inverted} />
      <Text style={[styles.wordmark, { color: ink }]}>multideck</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  lockup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  mark: {
    height: 22,
    width: 30,
  },
  deck: {
    borderRadius: 2,
    height: 6,
    position: "absolute",
    width: 22,
  },
  deckBack: {
    left: 0,
    opacity: 0.35,
    top: 0,
  },
  deckMiddle: {
    left: 4,
    opacity: 0.65,
    top: 7,
  },
  deckFront: {
    backgroundColor: colors.accent,
    left: 8,
    top: 14,
  },
  wordmark: {
    fontSize: 21,
    fontWeight: "500",
    letterSpacing: -0.2,
  },
})
