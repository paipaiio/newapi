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
import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    initGeetest4?: (
      config: {
        captchaId: string
        product?: string
      },
      callback: (captcha: GeeTestCaptcha) => void
    ) => void
  }
}

interface GeeTestCaptcha {
  showBox: () => void
  onReady: (cb: () => void) => void
  onSuccess: (cb: () => void) => void
  onError: (cb: () => void) => void
  getValidate: () => {
    lot_number: string
    captcha_output: string
    pass_token: string
    gen_time: string
  } | false
}

interface GeeTestProps {
  siteKey: string
  onVerify: (result: string) => void
  onExpire?: () => void
  className?: string
}

export function GeeTest({ siteKey, onVerify, onExpire, className }: GeeTestProps) {
  const ref = useRef<HTMLDivElement>(null)
  const onVerifyRef = useRef(onVerify)
  const onExpireRef = useRef(onExpire)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    onVerifyRef.current = onVerify
    onExpireRef.current = onExpire
  }, [onVerify, onExpire])

  useEffect(() => {
    let cancelled = false
    let captchaInstance: GeeTestCaptcha | null = null

    const loadGeeTestScript = (): Promise<void> => {
      if (window.initGeetest4) return Promise.resolve()

      return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://static.geetest.com/v4/gt4.js'
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('GeeTest script load failed'))
        document.head.appendChild(script)
      })
    }

    const render = () => {
      if (cancelled || !ref.current || !window.initGeetest4) return

      window.initGeetest4(
        {
          captchaId: siteKey,
          product: 'bind', // 'bind' 为按钮式，'float' 为浮动式
        },
        (captcha) => {
          if (cancelled) return

          captchaInstance = captcha

          captcha.onReady(() => {
            if (cancelled) return
            setIsLoading(false)
            // 自动弹出验证框
            captcha.showBox()
          })

          captcha.onSuccess(() => {
            if (cancelled) return
            const result = captcha.getValidate()
            if (result) {
              // 将验证结果拼接成query string格式传给后端
              const params = new URLSearchParams({
                lot_number: result.lot_number,
                captcha_output: result.captcha_output,
                pass_token: result.pass_token,
                gen_time: result.gen_time,
              }).toString()
              onVerifyRef.current(params)
            }
          })

          captcha.onError(() => {
            if (cancelled) return
            onExpireRef.current?.()
          })

          // 将验证按钮挂载到指定DOM
          if (ref.current) {
            ref.current.appendChild(document.querySelector('.geetest_holder') || document.createElement('div'))
          }
        }
      )
    }

    loadGeeTestScript().then(render).catch(() => {
      setIsLoading(false)
    })

    return () => {
      cancelled = true
      captchaInstance = null
    }
  }, [siteKey])

  return (
    <div ref={ref} className={className} style={{ minHeight: 65 }}>
      {isLoading && <div className="text-sm text-muted-foreground">加载验证组件...</div>}
    </div>
  )
}
