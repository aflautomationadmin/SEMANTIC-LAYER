/**
 * RBAC — Brand access configuration.
 * Permissions are stored in permissions.duckdb via Flask API at /permissions-api/permissions
 */

export const ALL_BRANDS = [
  'US POLO ASS.',
  'ARROW',
  'FLYING MACHINE',
  'ASPOL FOOTWEAR',
  'AD BY ARVIND',
  'COMMON BRAND',
  'TOMMY HILFIGER',
  'CALVIN KLEIN',
]

const API_URL = '/permissions-api/permissions'

const DEFAULT_CONFIG = {
  admins: ['automation.admin@arvindfashions.com'],
  brands: {
    'US POLO ASS.':   ['saifali.khan@arvindfashions.com'],
    'ARROW':          [],
    'FLYING MACHINE': [],
    'ASPOL FOOTWEAR': [],
    'AD BY ARVIND':   [],
    'COMMON BRAND':   [],
    'TOMMY HILFIGER': [],
    'CALVIN KLEIN':   [],
  },
}

export async function loadPermissions() {
  try {
    const res = await fetch(API_URL)
    if (res.ok) return await res.json()
  } catch {}
  return structuredClone(DEFAULT_CONFIG)
}

export async function savePermissions(config, callerEmail) {
  await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...config, caller_email: callerEmail }),
  })
}

/**
 * Returns:
 *   { isAdmin: true,  brands: [] }        – admin (full access)
 *   { isAdmin: false, brands: string[] }  – legacy brand-restricted user
 *   { isAdmin: false, brands: [] }        – portal-access-only user (non-admin)
 *   null                                  – no access at all
 *
 * All logic lives in the backend /check-access endpoint so this
 * function is a thin wrapper with no duplicated rules.
 */
export async function getBrandAccess(email) {
  if (!email) return null
  try {
    const res  = await fetch(`/permissions-api/check-access?email=${encodeURIComponent(email)}`)
    const data = await res.json()
    if (!data.allowed) return null
    return {
      isAdmin: !!data.is_admin,
      brands:  (data.brands && data.brands.length > 0) ? data.brands : [],
    }
  } catch {
    return null
  }
}
