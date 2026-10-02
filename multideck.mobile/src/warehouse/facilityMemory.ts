import AsyncStorage from "@react-native-async-storage/async-storage"

// Only the facility identifier is remembered. The facility itself is always re-read from the
// tenant so a device never re-enters a warehouse the operator can no longer access.
const key = (workspaceSlug: string) => `multideck.mobile.facility.v1.${workspaceSlug}`

export async function loadRememberedFacilityId(workspaceSlug: string) {
  try {
    return await AsyncStorage.getItem(key(workspaceSlug))
  } catch {
    return null
  }
}

export async function rememberFacility(workspaceSlug: string, facilityId: string) {
  try {
    await AsyncStorage.setItem(key(workspaceSlug), facilityId)
  } catch {
    // Remembering is a convenience; the operator can always choose again.
  }
}

export async function forgetFacility(workspaceSlug: string) {
  try {
    await AsyncStorage.removeItem(key(workspaceSlug))
  } catch {
    // Nothing to recover: the next launch simply asks again.
  }
}
