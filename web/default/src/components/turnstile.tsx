/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: Record<string, unknown>
      ) => string
      remove: (widgetId: string) => void
    }
  }
}

interface TurnstileProps {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  className?: string
}

const SCRIPT_ID = 'cf-turnstile'
let scriptPromise: Promise<void> | null = null

/**
 * Load the Cloudflare Turnstile script once and share the promise across all
 * widget instances, so concurrent mounts don't each append a <script> or race
 * on `window.turnstile` being ready.
 */
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(
      SCRIPT_ID
    ) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject())
      return
    }
    const s = document.createElement('script')
    s.id = SCRIPT_ID
    s.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => {
      // allow a later mount to retry loading the script
      scriptPromise = null
      reject()
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export function Turnstile({
  siteKey,
  onVerify,
  onExpire,
  className,
}: TurnstileProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  // Keep the latest callbacks in refs so the render effect only depends on
  // `siteKey`. Otherwise inline callbacks from parents change identity on every
  // re-render and (under StrictMode especially) re-trigger render, stacking a
  // second widget iframe on top of the first.
  const onVerifyRef = useRef(onVerify)
  const onExpireRef = useRef(onExpire)
  onVerifyRef.current = onVerify
  onExpireRef.current = onExpire

  useEffect(() => {
    let cancelled = false
    let widgetId: string | undefined

    const render = () => {
      if (cancelled || !ref.current || !window.turnstile) return
      // Clear any stale markup before rendering to avoid overlapping widgets.
      ref.current.innerHTML = ''
      try {
        widgetId = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (token: string) => onVerifyRef.current(token),
          'error-callback': () => onExpireRef.current?.(),
          'expired-callback': () => onExpireRef.current?.(),
        })
      } catch {
        /* empty */
      }
    }

    loadTurnstileScript().then(render).catch(() => {})

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId)
        } catch {
          /* empty */
        }
      }
    }
  }, [siteKey])

  // Reserve the widget's intrinsic height (~65px) so the surrounding layout
  // doesn't collapse while the script loads and then jump when it renders,
  // which made the checkbox appear to shift or hide behind nearby elements.
  return (
    <div
      ref={ref}
      className={className}
      style={{ minHeight: 65 }}
    />
  )
}
