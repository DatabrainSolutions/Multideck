/** Select a ledger projection only after the caller's current permissions are resolved. */
export function accountFinanceAccess(partyType: string, permissions: readonly string[]) {
  const financialAccess = permissions.includes("Customers.Read") && (
    (partyType === "customer" && permissions.includes("Finance.Receivables.View"))
    || (partyType === "supplier" && permissions.includes("Finance.Payables.View"))
  )
  return {
    financialAccess,
    accountingSyncAccess: financialAccess && permissions.includes("Finance.Integration.Manage"),
  }
}
