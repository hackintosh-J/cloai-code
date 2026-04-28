import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/app.css'
import './styles/enhanced-animations.css'
import { safeGetStorageItem } from './utils/safeStorage'

const rootElement = document.getElementById('root')

declare global {
  interface Window {
    __CLOAI_DESKTOP_READY__?: boolean
  }
}

function prefersDarkScheme() {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  } catch {
    return false
  }
}

const theme = safeGetStorageItem('theme', 'auto')
const chatFont = safeGetStorageItem('chat_font', 'default')
const prefersDark = prefersDarkScheme()

if (theme === 'dark' || (theme === 'auto' && prefersDark)) {
  document.documentElement.setAttribute('data-theme', 'dark')
  document.documentElement.classList.add('dark')
} else {
  document.documentElement.setAttribute('data-theme', 'light')
}

document.documentElement.setAttribute('data-chat-font', chatFont)

if (!rootElement) {
  throw new Error('Could not find root element to mount to')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

window.__CLOAI_DESKTOP_READY__ = true
