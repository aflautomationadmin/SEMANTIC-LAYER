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

export async function savePermissions(config) {
  await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(config),
  })
}

/**
 * Returns:
 *   []        – admin or portal-access user (full gate-level access)
 *   string[]  – legacy brand-restricted user
 *   null      – no access at all
 */
export async function getBrandAccess(email) {
  if (!email) return null
  const config = await loadPermissions()
  const e = email.toLowerCase()

  // 1. Admin — full access
  if (config.admins.some(a => a.toLowerCase() === e)) return []

  // 2. Legacy brand list
  const allowed = Object.entries(config.brands)
    .filter(([, users]) => users.some(u => u.toLowerCase() === e))
    .map(([brand]) => brand)

  if (allowed.length > 0) return allowed

  // 3. New portal_access — users added via the Admin → Users tab
  //    If they have at least one portal, let them through.
  //    Per-portal row restriction is handled inside the app, not here.
  try {
    const res = await fetch(`/permissions-api/my-portals?email=${encodeURIComponent(email)}`)
    if (res.ok) {
      const data = await res.json()
      if ((data.portals || []).length > 0) return []
    }
  } catch {}

  return null
}
