import { StyleSheet, Text, View } from "react-native"
import type { Session } from "@supabase/supabase-js"
import { ActionTile, WarehouseButton, WarehouseScreen } from "@/components/WarehouseUI"
import { colors, radius, spacing, type } from "@/theme/tokens"
import { wt } from "@/warehouse/i18n"

export type WarehouseRouteName = "LocationCheck" | "StockEnquiry" | "StockItems" | "Pallets" | "PalletMove" | "Consolidation" | "Exceptions" | "HoldingFees"

export function WarehouseHomeScreen({ session, workspaceName, onOpen, onSignOut, onChangeWorkspace }: { session: Session; workspaceName: string; onOpen: (route: WarehouseRouteName) => void; onSignOut: () => Promise<void>; onChangeWorkspace: () => Promise<void> }) {
  return (
    <WarehouseScreen
      title={wt("warehouseMobile")}
      subtitle={wt("warehouseIntro")}
      actions={<View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>{workspaceName}</Text></View>}
    >
      <ActionTile code="LC" label={wt("locationCheck")} detail={wt("locationCheckDetail")} onPress={() => onOpen("LocationCheck")} />
      <ActionTile code="SE" label={wt("stockEnquiry")} detail={wt("stockEnquiryDetail")} onPress={() => onOpen("StockEnquiry")} />
      <ActionTile code="SI" label={wt("stockItems")} detail={wt("stockItemsDetail")} onPress={() => onOpen("StockItems")} />
      <ActionTile code="PL" label={wt("pallets")} detail={wt("palletsDetail")} onPress={() => onOpen("Pallets")} />
      <ActionTile code="MV" label={wt("moveOverride")} detail={wt("moveOverrideDetail")} onPress={() => onOpen("PalletMove")} />
      <ActionTile code="CP" label={wt("consolidation")} detail={wt("consolidationDetail")} onPress={() => onOpen("Consolidation")} />
      <ActionTile code="EX" label={wt("exceptions")} detail={wt("exceptionsDetail")} onPress={() => onOpen("Exceptions")} />
      <ActionTile code="HF" label={wt("holdingFees")} detail={wt("holdingFeesDetail")} onPress={() => onOpen("HoldingFees")} />

      <View style={styles.account}>
        <Text style={styles.accountLabel}>{session.user.email}</Text>
        <WarehouseButton label={wt("signOut")} tone="secondary" onPress={() => void onSignOut()} />
        <WarehouseButton label={wt("changeWorkspace")} tone="secondary" onPress={() => void onChangeWorkspace()} />
      </View>
    </WarehouseScreen>
  )
}

const styles = StyleSheet.create({
  liveBadge: { alignItems: "center", backgroundColor: colors.backgroundStrong, borderRadius: radius.lg, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  liveDot: { backgroundColor: colors.accent, borderRadius: 4, height: 7, width: 7 },
  liveText: { color: colors.inkSoft, fontSize: type.meta, fontWeight: "600" },
  account: { borderTopColor: colors.hairline, borderTopWidth: 1, marginTop: spacing.xl, paddingTop: spacing.lg },
  accountLabel: { color: colors.text, fontSize: type.meta, textAlign: "center", writingDirection: "ltr" },
})
