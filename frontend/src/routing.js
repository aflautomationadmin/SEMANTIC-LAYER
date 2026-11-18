// Minimal client-side routing helpers — no router dependency.
// URL shape: <base>/<type-segment>/<portal-id>  e.g. /uploadui/upload/monthly-store-target-upload
// The type segment is cosmetic; only the last path segment (the portal id) is ever read back.

const TYPE_SEGMENT = {
  file_upload: 'upload',
  kpi_input:   'kpi',
}

export function basePath() {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : base + '/'
}

export function homePath() {
  return basePath()
}

export function adminPath() {
  return `${basePath()}admin`
}

export function portalPath(portal) {
  const segment = TYPE_SEGMENT[portal?.config?.type] || 'download'
  return `${basePath()}${segment}/${portal.id}`
}

/** Returns { admin: true } | { portalId } | null based on the current URL. */
export function parseCurrentPath() {
  const base = basePath()
  const baseNoSlash = base.slice(0, -1)
  let path = window.location.pathname

  if (path === base || path === baseNoSlash) return null
  if (path.startsWith(base)) path = path.slice(base.length)
  else if (path.startsWith(baseNoSlash + '/')) path = path.slice(baseNoSlash.length + 1)

  path = path.replace(/^\/+|\/+$/g, '')
  if (!path) return null

  const parts = path.split('/').filter(Boolean)
  if (parts.length === 1 && parts[0] === 'admin') return { admin: true }

  const portalId = parts[parts.length - 1]
  return portalId ? { portalId } : null
}

export function pushPortalPath(portal) {
  const url = portalPath(portal)
  if (window.location.pathname !== url) window.history.pushState({}, '', url)
}

export function pushAdminPath() {
  const url = adminPath()
  if (window.location.pathname !== url) window.history.pushState({}, '', url)
}

export function pushHomePath() {
  const url = homePath()
  if (window.location.pathname !== url) window.history.pushState({}, '', url)
}
