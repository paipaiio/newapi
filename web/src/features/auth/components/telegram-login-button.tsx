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

export type TelegramAuthUser = Record<string, string | number>

interface TelegramLoginButtonProps {
  botName: string
  onAuth: (user: TelegramAuthUser) => void
  buttonSize?: 'large' | 'medium' | 'small'
  cornerRadius?: number
  requestAccess?: boolean
}

/**
 * Renders the official Telegram login widget. The widget injects an iframe
 * button; on successful auth it invokes a global callback with signed user
 * data, which we forward to `onAuth`.
 */
export function TelegramLoginButton({
  botName,
  onAuth,
  buttonSize = 'large',
  cornerRadius = 8,
  requestAccess = true,
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onAuthRef = useRef(onAuth)
  onAuthRef.current = onAuth

  useEffect(() => {
    if (!botName || !containerRef.current) return

    // The widget calls window.TelegramLoginWidget.dataOnauth(user).
    const w = window as unknown as {
      TelegramLoginWidget?: { dataOnauth: (user: TelegramAuthUser) => void }
    }
    w.TelegramLoginWidget = { dataOnauth: (user) => onAuthRef.current(user) }

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', botName)
    script.setAttribute('data-size', buttonSize)
    script.setAttribute('data-radius', String(cornerRadius))
    if (requestAccess) script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-onauth', 'TelegramLoginWidget.dataOnauth(user)')

    const container = containerRef.current
    container.innerHTML = ''
    container.append(script)

    return () => {
      container.innerHTML = ''
    }
  }, [botName, buttonSize, cornerRadius, requestAccess])

  return <div ref={containerRef} className='flex justify-center' />
}
