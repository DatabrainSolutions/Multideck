import { adminClient, HttpError } from './backend.ts';

export async function requireProductAccess(feature: 'icustoms' | 'rate_management' | 'jenkar_phone') {
  const { data, error } = await adminClient().rpc('multideck_cloud_product_access', { p_feature: feature });
  if (error) throw new HttpError(503, 'Product permissions are unavailable.');
  if (data !== true) throw new HttpError(403, feature === 'icustoms'
    ? 'iCustoms is not enabled for this workspace.'
    : feature === 'rate_management'
      ? 'Rate Management is not enabled for this workspace.'
      : 'The phone system is available only to the verified Jenkar workspace.');
}
