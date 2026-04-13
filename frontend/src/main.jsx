import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { msalInstance } from './authConfig'
import AuthWrapper from './AuthWrapper'
import App from './App.jsx'
import './index.css'

// MSAL v3: must initialize before any render, then handle the post-redirect response
await msalInstance.initialize()
await msalInstance.handleRedirectPromise().catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MsalProvider instance={msalInstance}>
      <AuthWrapper>
        {({ user, allowedBrands }) => (
          <App user={user} allowedBrands={allowedBrands} />
        )}
      </AuthWrapper>
    </MsalProvider>
  </StrictMode>
)
