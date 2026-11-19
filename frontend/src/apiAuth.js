import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { msalInstance, loginRequest } from './authConfig'

const API_PREFIX = '/permissions-api'
let redirecting = false

async function getIdToken() {
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0]
  if (!account) return null
  try {
    const result = await msalInstance.acquireTokenSilent({ ...loginRequest, account })
    return result.idToken || null
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) renewSignIn(account)
    return null
  }
}

function renewSignIn(account) {
  if (redirecting) return
  redirecting = true
  msalInstance.acquireTokenRedirect({ ...loginRequest, account }).catch(() => { redirecting = false })
}

// Sends the signed-in user's Microsoft ID token with every API call so the server
// can verify who is calling instead of trusting an email sent by the browser.
export function installApiAuth() {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    if (typeof input !== 'string' || !input.startsWith(API_PREFIX)) return originalFetch(input, init)
    const token = await getIdToken()
    const headers = new Headers(init.headers || {})
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await originalFetch(input, { ...init, headers })
    if (res.status === 401) {
      const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0]
      if (account) renewSignIn(account)
    }
    return res
  }
}
