// Local QA transport only: production components and API code talk to disposable PostgreSQL.
export * from '../../src/lib/supabase'
export async function getSupabaseSession() {
  const user = sessionStorage.getItem('crm-sales-qa-user') || '1'
  return { access_token: 'local-qa-session', user: { id: `10000000-0000-0000-0000-${user.padStart(12, '0')}` } }
}
const available = new Set(["multideck_crm_get_sales_briefing", "multideck_crm_get_sales_insights", "multideck_crm_get_deal_essential", "multideck_crm_deal_people", "multideck_crm_pipeline_settings", "multideck_crm_update_deal", "multideck_crm_set_deal_next_action", "multideck_crm_complete_deal_next_action", "multideck_crm_lose_deal", "multideck_crm_move_deal_stage", "multideck_crm_win_deal", "multideck_crm_reopen_deal"])
const unavailableQuery = () => {
  const result = { data: null, count: null, error: { code: 'P0002', message: 'This integration is unavailable in the isolated CRM verification workspace.' } }
  const query: unknown = new Proxy({}, { get(_target, key) { return key === 'then' ? (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject) : () => query } })
  return query
}
export const supabase = {
  from: unavailableQuery,
  auth: {
    async getSession() { return { data: { session: await getSupabaseSession() }, error: null } },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } } },
  },
  channel() { const channel = { on() { return channel }, subscribe() { return channel }, unsubscribe() {} }; return channel },
  async removeChannel() {},
  rpc(name: string, args: Record<string, unknown> = {}) {
    const execute = async (signal?: AbortSignal) => {
      if (!available.has(name)) return { data: null, error: { code: 'P0002', message: 'This integration is unavailable in the isolated CRM verification workspace.' } }
      const response = await fetch('/__crm_sales_test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: sessionStorage.getItem('crm-sales-qa-user') || '1', name, args, illustrative: sessionStorage.getItem('crm-sales-qa-themes') === 'illustrative' }), signal })
      return await response.json()
    }
    return { abortSignal: execute, then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => execute().then(resolve, reject) }
  },
  functions: {
    async invoke(name: string, options: { body: unknown; signal?: AbortSignal }) {
      if (name !== 'crm-sales-insights') return { data: null, error: new Error('This integration is unavailable in the isolated CRM verification workspace.') }
      const response = await fetch('/__crm_sales_ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, ...options.body as object }), signal: options.signal })
      const data = await response.json()
      return response.ok ? { data, error: null } : { data: null, error: { context: new Response(JSON.stringify(data), { status: response.status }), message: data.message } }
    },
  },
}
