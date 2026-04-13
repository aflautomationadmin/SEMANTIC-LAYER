/**
 * RBAC — Brand access configuration.
 * Permissions are stored in localStorage so admin changes persist without a backend.
 * Falls back to DEFAULT_CONFIG on first run.
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

const STORAGE_KEY = 'arvind_permissions_v1'

// Seed config — used only when localStorage is empty
const DEFAULT_CONFIG = {
  admins: [
    'automation.admin@arvindfashions.com',
  ],
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

export function loadPermissions() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return structuredClone(DEFAULT_CONFIG)
}

export function savePermissions(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

/**
 * Returns:
 *   []        – admin, full access
 *   string[]  – restricted to these brands
 *   null      – no access
 */
export function getBrandAccess(email) {
  if (!email) return null
  const config = loadPermissions()
  const e = email.toLowerCase()

  if (config.admins.some(a => a.toLowerCase() === e)) return []

  const allowed = Object.entries(config.brands)
    .filter(([, users]) => users.some(u => u.toLowerCase() === e))
    .map(([brand]) => brand)

  return allowed.length > 0 ? allowed : null
}
