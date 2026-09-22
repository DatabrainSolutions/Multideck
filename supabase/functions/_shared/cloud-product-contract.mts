export class ProductRequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export const paidFeatureIds = ['icustoms', 'rate_management'] as const;
export type PaidFeatureId = typeof paidFeatureIds[number];
export type FeatureRequest = { contractVersion: 1; action: 'features'; tenantId: string; revision: number; features: PaidFeatureId[] };
export type HealthRequest = { contractVersion: 1; action: 'health'; tenantId: string };
export type LifecycleRequest = { contractVersion: 1; action: 'lifecycle_status'; tenantId: string; revision?: never; requestId?: never }
  | { contractVersion: 1; action: 'shutdown'; tenantId: string; revision: number; requestId: string }
  | { contractVersion: 1; action: 'verify_shutdown'; tenantId: string; revision: number; requestId: string }
  | { contractVersion: 1; action: 'recover'; tenantId: string; revision: number; requestId: string };

export function parseProductRequest(input: unknown, configuredTenantId: string): FeatureRequest | HealthRequest | LifecycleRequest {
  if (!configuredTenantId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(configuredTenantId)) {
    throw new ProductRequestError(503, 'Customer identity is not configured.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProductRequestError(400, 'Invalid request.');
  const value = input as Record<string, unknown>;
  if (value.contractVersion !== 1) throw new ProductRequestError(400, 'Unsupported contract version.');
  if (value.tenantId !== configuredTenantId) throw new ProductRequestError(403, 'Customer identity does not match.');
  if (value.action === 'health') return { contractVersion: 1, action: 'health', tenantId: configuredTenantId };
  if (value.action === 'lifecycle_status') return { contractVersion: 1, action: 'lifecycle_status', tenantId: configuredTenantId };
  if (value.action === 'shutdown' || value.action === 'verify_shutdown' || value.action === 'recover') {
    if (!Number.isSafeInteger(value.revision) || Number(value.revision)<1 || typeof value.requestId!=='string' ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.requestId)) throw new ProductRequestError(400,'Invalid lifecycle request.');
    return {contractVersion:1,action:value.action,tenantId:configuredTenantId,revision:Number(value.revision),requestId:value.requestId};
  }
  if (value.action !== 'features' || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
    || !Array.isArray(value.features) || value.features.length > paidFeatureIds.length
    || value.features.some(f => typeof f !== 'string' || !paidFeatureIds.includes(f as PaidFeatureId))) {
    throw new ProductRequestError(400, 'Invalid feature request.');
  }
  return { contractVersion: 1, action: 'features', tenantId: configuredTenantId, revision: Number(value.revision), features: [...new Set(value.features)] as PaidFeatureId[] };
}

export async function validProductAuthentication(headers: Headers, expected: string): Promise<boolean> {
  if (!expected || headers.has('origin')) return false;
  const token = headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!token || !/^Bearer /i.test(headers.get('authorization') || '')) return false;
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b, c] = await Promise.all([digest(expected), digest(token), digest(headers.get('apikey') || '')]);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= (a[i] ^ b[i]) | (a[i] ^ c[i]);
  return mismatch === 0;
}
