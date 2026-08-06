import { useCallback, useEffect, useMemo, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { NavigationContainer, DefaultTheme } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { StatusBar } from "expo-status-bar"
import type { Session, SupabaseClient } from "@supabase/supabase-js"
import { WorkspaceScreen } from "@/screens/WorkspaceScreen"
import { SignInScreen } from "@/screens/SignInScreen"
import { WarehouseHomeScreen } from "@/screens/WarehouseHomeScreen"
import { ExceptionsScreen, HoldingFeesScreen, PalletsScreen, StockEnquiryScreen, StockItemsScreen } from "@/screens/WarehouseBrowseScreens"
import { LocationCheckScreen } from "@/screens/LocationCheckScreen"
import { ConsolidationScreen, PalletMoveScreen } from "@/screens/PalletActionScreens"
import { t } from "@/i18n"
import { createWorkspaceClient, registerAuthAutoRefresh, releaseWorkspaceClient } from "@/auth/supabase"
import { discoverWorkspace, forgetWorkspace, loadWorkspace, saveWorkspace, type WorkspaceConfiguration } from "@/auth/workspace"
import { colors, spacing, type } from "@/theme/tokens"
import { createWarehouseMobileApi } from "@/warehouse/api"

export type RootStackParams = {
  Workspace: undefined
  SignIn: undefined
  Home: undefined
  LocationCheck: undefined
  StockEnquiry: undefined
  StockItems: undefined
  Pallets: undefined
  PalletMove: undefined
  Consolidation: undefined
  Exceptions: undefined
  HoldingFees: undefined
}

const Stack = createNativeStackNavigator<RootStackParams>()

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceConfiguration | null>(null)
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => registerAuthAutoRefresh(), [])

  useEffect(() => {
    let active = true

    async function restore() {
      const storedWorkspace = await loadWorkspace()
      if (!active || !storedWorkspace) {
        if (active) setReady(true)
        return
      }

      let refreshedWorkspace: WorkspaceConfiguration
      try {
        refreshedWorkspace = await discoverWorkspace(storedWorkspace.workspace.slug)
        await saveWorkspace(refreshedWorkspace)
      } catch {
        await forgetWorkspace()
        if (active) setReady(true)
        return
      }

      const restoredClient = createWorkspaceClient(refreshedWorkspace)
      const { data } = await restoredClient.auth.getSession()
      if (!active) return

      setWorkspace(refreshedWorkspace)
      setClient(restoredClient)
      setSession(data.session)
      setReady(true)
    }

    void restore()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!client) return
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [client])

  const selectWorkspace = useCallback(async (configuration: WorkspaceConfiguration) => {
    await saveWorkspace(configuration)
    const nextClient = createWorkspaceClient(configuration)
    const { data } = await nextClient.auth.getSession()
    setWorkspace(configuration)
    setClient(nextClient)
    setSession(data.session)
  }, [])

  const changeWorkspace = useCallback(async () => {
    await releaseWorkspaceClient()
    await forgetWorkspace()
    setSession(null)
    setClient(null)
    setWorkspace(null)
  }, [])

  const signOut = useCallback(async () => {
    if (client) await client.auth.signOut()
  }, [client])

  const navigationTheme = useMemo(() => ({
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.background,
      card: colors.background,
      text: colors.ink,
      primary: colors.accent,
      border: colors.hairline,
    },
  }), [])
  const warehouseApi = useMemo(() => client && workspace ? createWarehouseMobileApi(client, workspace) : null, [client, workspace])

  if (!ready) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>{t("preparing")}</Text>
        </View>
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator screenOptions={{ animation: "fade", headerShown: false }}>
          {!workspace || !client ? (
            <Stack.Screen name="Workspace">
              {() => <WorkspaceScreen onWorkspaceSelected={selectWorkspace} />}
            </Stack.Screen>
          ) : !session ? (
            <Stack.Screen name="SignIn">
              {() => <SignInScreen client={client} workspace={workspace} onChangeWorkspace={changeWorkspace} />}
            </Stack.Screen>
          ) : warehouseApi ? (
            <Stack.Group>
              <Stack.Screen name="Home">
                {({ navigation }) => <WarehouseHomeScreen session={session} workspaceName={workspace.workspace.name} onOpen={(route) => navigation.navigate(route)} onSignOut={signOut} onChangeWorkspace={changeWorkspace} />}
              </Stack.Screen>
              <Stack.Screen name="LocationCheck">{({ navigation }) => <LocationCheckScreen api={warehouseApi} onBack={() => navigation.goBack()} />}</Stack.Screen>
              <Stack.Screen name="StockEnquiry">{({ navigation }) => <StockEnquiryScreen api={warehouseApi} onBack={() => navigation.goBack()} />}</Stack.Screen>
              <Stack.Screen name="StockItems">{({ navigation }) => <StockItemsScreen api={warehouseApi} onBack={() => navigation.goBack()} />}</Stack.Screen>
              <Stack.Screen name="Pallets">{({ navigation }) => <PalletsScreen api={warehouseApi} onBack={() => navigation.goBack()} />}</Stack.Screen>
              <Stack.Screen name="PalletMove">{({ navigation }) => <PalletMoveScreen api={warehouseApi} onBack={() => navigation.goBack()} />}</Stack.Screen>
              <Stack.Screen name="Consolidation">{({ navigation }) => <ConsolidationScreen api={warehouseApi} onBack={() => navigation.goBack()} />}</Stack.Screen>
              <Stack.Screen name="Exceptions">{({ navigation }) => <ExceptionsScreen api={warehouseApi} onBack={() => navigation.goBack()} />}</Stack.Screen>
              <Stack.Screen name="HoldingFees">{({ navigation }) => <HoldingFeesScreen onBack={() => navigation.goBack()} />}</Stack.Screen>
            </Stack.Group>
          ) : null}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
  },
  loadingText: {
    color: colors.text,
    fontSize: type.label,
  },
})
