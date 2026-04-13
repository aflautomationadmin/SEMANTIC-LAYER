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
 *   []        – admin, full access
 *   string[]  – restricted to these brands
 *   null      – no access
 */
export async function getBrandAccess(email) {
  if (!email) return null
  const config = await loadPermissions()
  const e = email.toLowerCase()

  if (config.admins.some(a => a.toLowerCase() === e)) return []

  const allowed = Object.entries(config.brands)
    .filter(([, users]) => users.some(u => u.toLowerCase() === e))
    .map(([brand]) => brand)

  return allowed.length > 0 ? allowed : null
}
