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

// 声明 Cap 脚本注册的自定义元素 <cap-widget>
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'cap-widget': React.JSX.IntrinsicElements['div'] & {
        'data-cap-api-endpoint'?: string
      }
    }
  }
}

interface CapWidgetProps {
  /** widget 的 api endpoint（.../<siteKey>/，widget 自动拼 challenge/redeem） */
  endpoint: string
  /** widget.js 脚本地址（经反代自托管，含 wasm） */
  scriptUrl: string
  onVerify: (token: string) => void
  onExpire?: () => void
  className?: string
}

let scriptPromise: Promise<void> | null = null
let loadedUrl = ''

/**
 * 加载 Cap widget 脚本一次并共享 Promise（避免多实例重复插入 <script>）。
 * 脚本注册了 <cap-widget> 自定义元素；URL 变化时重新加载。
 */
function loadCapScript(scriptUrl: string): Promise<void> {
  if (scriptPromise && loadedUrl === scriptUrl) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = scriptUrl
    s.async = true
    s.onload = () => {
      loadedUrl = scriptUrl
      resolve()
    }
    s.onerror = () => {
      scriptPromise = null
      reject(new Error('cap widget script load failed'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export function CapWidget({
  endpoint,
  scriptUrl,
  onVerify,
  onExpire,
  className,
}: CapWidgetProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const onVerifyRef = useRef(onVerify)
  const onExpireRef = useRef(onExpire)
  onVerifyRef.current = onVerify
  onExpireRef.current = onExpire

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onSolve = (e: Event) => {
      const token = (e as CustomEvent<{ token: string }>).detail?.token
      if (token) {
        onVerifyRef.current(`cap_token=${encodeURIComponent(token)}`)
      }
    }
    const onError = () => onExpireRef.current?.()

    el.addEventListener('solve', onSolve as EventListener)
    el.addEventListener('error', onError)

    loadCapScript(scriptUrl).catch(() => onExpireRef.current?.())

    return () => {
      el.removeEventListener('solve', onSolve as EventListener)
      el.removeEventListener('error', onError)
    }
  }, [endpoint, scriptUrl])

  // cap-widget 渲染后自动取挑战并跑 PoW。预留高度避免脚本加载期布局塌陷。
  return (
    <cap-widget
      ref={ref}
      className={className}
      style={{ minHeight: 65, display: 'block' }}
      data-cap-api-endpoint={endpoint}
    />
  )
}
