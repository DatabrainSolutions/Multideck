import {
  getSupabaseSession,
  supabaseFunctionsUrl,
  supabasePublicApiKey,
} from "@/lib/supabase";
export type LiveCustomerGrant = {
  id: string;
  connection_id: string;
  subject_id: string;
  facility_ids: string[];
  enabled: boolean;
  products_enabled: boolean;
  orders_enabled: boolean;
  purchase_orders_enabled: boolean;
  version: number;
  email?: string | null;
  live_customer_id?: number | null;
  live_sync_status?: "ready" | "pending";
  syncMessage?: string;
};
async function request<T>(
  customerId: string,
  input?: Record<string, unknown>,
): Promise<T> {
  const session = await getSupabaseSession();
  if (!session?.access_token) {
    throw new Error("Sign in to manage customer grants.");
  }
  const response = await fetch(
    `${supabaseFunctionsUrl}/live-grant-admin/${
      encodeURIComponent(customerId)
    }`,
    {
      method: input ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabasePublicApiKey,
        "Content-Type": "application/json",
      },
      body: input ? JSON.stringify(input) : undefined,
    },
  );
  const value = await response.json();
  if (!response.ok) {
    throw new Error(value?.detail || "Customer grants are unavailable.");
  }
  return value;
}
export const listLiveCustomerGrants = (customerId: string) =>
  request<LiveCustomerGrant[]>(customerId);
export const saveLiveCustomerGrant = (
  customerId: string,
  input: Record<string, unknown>,
) => request<LiveCustomerGrant>(customerId, input);

export const lookupLiveCustomer = (customerId: string, email: string) =>
  request<{ email: string; profiles: { id: number; name: string }[] }>(
    customerId,
    { action: "lookup", email },
  );
