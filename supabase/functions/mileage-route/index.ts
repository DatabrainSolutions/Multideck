import { authenticate, authenticatedClient, body, corsHeaders, currentInternalUser, HttpError, json } from '../_shared/backend.ts'
import { normalizeMileageRoute } from '../_shared/mileage-route.ts'
import { calculateRoadRoute } from '../_shared/mileage-provider.ts'

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Use POST to calculate a route.')
    const { admin, user, token } = await authenticate(request)
    const actor = await currentInternalUser(admin, user)
    // The real workspace gate also rejects unlinked or deactivated accounts.
    const { error: gateError } = await authenticatedClient(token).rpc('multideck_mileage', { p_action: 'context' })
    if (gateError) throw new HttpError(403, 'Mileage is unavailable for this workspace account.')
    const input = normalizeMileageRoute(await body(request))
    const { data: cached } = await admin.from('mileage_route_quotes').select('id,distance_miles,route_data,route_input').eq('company_id',actor.Company_ID).eq('user_id',actor.User_ID).contains('route_input',input.original).gte('created_at',new Date(Date.now()-86400_000).toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle()
    // JSONB containment ignores array order: require exact waypoint order before reuse.
    const exactCachedInput = cached && Object.entries(input.original).every(([key,value]) => JSON.stringify(cached.route_input?.[key]) === JSON.stringify(value))
    if (exactCachedInput && cached.route_data?.routingVersion === 2 && cached.route_data.points?.length > 1) return json(request,{id:cached.id,distance_miles:cached.distance_miles,route_data:cached.route_data})
    const { error: limitError } = await authenticatedClient(token).rpc('multideck_mileage', { p_action: 'reserve_route' })
    if (limitError) throw new HttpError(429, 'You have reached today’s route limit. Try again tomorrow.')
    const route = await calculateRoadRoute(input, {
      googleKey: Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim(),
      osrmBase: Deno.env.get('MILEAGE_OSRM_URL')?.trim(),
      photonBase: Deno.env.get('MILEAGE_PHOTON_URL')?.trim(),
      reserve: async provider => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data, error } = await admin.rpc('multideck_mileage_provider_slot',{p_provider:provider})
          if (error) throw new HttpError(503,'The map service is unavailable. Try again in a moment.')
          if (data) return
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1150))
        }
        throw new HttpError(429,'The map service is busy. Try again in a moment.')
      },
    })
    const { data: quote, error } = await admin.from('mileage_route_quotes').insert({
      company_id: actor.Company_ID, user_id: actor.User_ID,
      // Retain exact reviewed input for the database's tamper check; normalization is provider-only.
      route_input: input.original, distance_miles: route.distance_miles,
      route_data: { ...route.route_data, routingVersion: 2 },
    }).select('id,distance_miles,route_data').single()
    if (error) throw new HttpError(503, 'The route could not be saved. Try again.')
    return json(request, quote)
  } catch (error) {
    return json(request, { detail: error instanceof Error ? error.message : 'The route could not be calculated.' }, error instanceof HttpError ? error.status : 400)
  }
})
