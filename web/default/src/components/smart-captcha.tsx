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
import { useEffect, useState } from 'react'
import { GeeTest } from './geetest'
import { Turnstile } from './turnstile'
import { CapWidget } from './cap-widget'

interface CaptchaConfig {
  type: 'turnstile' | 'geetest' | 'cap' | 'none'
  siteKey: string
  /** Cap: widget 的 api endpoint */
  endpoint?: string
  /** Cap: widget.js 脚本地址 */
  script_url?: string
  enabled: boolean
  region: 'CN' | 'overseas'
}

interface SmartCaptchaProps {
  onVerify: (token: string) => void
  onExpire?: () => void
  className?: string
}

/**
 * SmartCaptcha - 智能验证组件
 * 根据用户IP地域自动加载对应的验证组件：
 * - 国内IP → 极验GeeTest
 * - 境外IP → Cloudflare Turnstile
 */
export function SmartCaptcha({ onVerify, onExpire, className }: SmartCaptchaProps) {
  const [config, setConfig] = useState<CaptchaConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 从后端获取验证配置
    fetch('/api/captcha/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setConfig(data.data)
        } else {
          setError('获取验证配置失败')
        }
      })
      .catch(() => {
        setError('网络错误')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className={className} style={{ minHeight: 65 }}>
        <div className="text-sm text-muted-foreground">加载验证组件...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={className} style={{ minHeight: 65 }}>
        <div className="text-sm text-destructive">{error}</div>
      </div>
    )
  }

  if (!config || !config.enabled || config.type === 'none') {
    // 验证未启用，不渲染任何组件
    return null
  }

  // Normalize each provider's result into a URL query fragment that callers can
  // append verbatim to a request URL. Turnstile yields a bare token (needs the
  // `turnstile=` key + encoding); GeeTest already yields an encoded
  // `lot_number=..&captcha_output=..&pass_token=..&gen_time=..` string, so it
  // passes through unchanged. Cap yields `cap_token=<token>`. Sending GeeTest's
  // 4 params bundled under a single `turnstile=` value was the bug: the backend
  // reads them as top-level query params, so they must travel as top-level params.
  if (config.type === 'cap') {
    if (!config.endpoint || !config.script_url) return null
    return (
      <CapWidget
        endpoint={config.endpoint}
        scriptUrl={config.script_url}
        onVerify={onVerify}
        onExpire={onExpire}
        className={className}
      />
    )
  }

  if (config.type === 'geetest') {
    return (
      <GeeTest
        siteKey={config.siteKey}
        onVerify={onVerify}
        onExpire={onExpire}
        className={className}
      />
    )
  }

  if (config.type === 'turnstile') {
    return (
      <Turnstile
        siteKey={config.siteKey}
        onVerify={(token) => onVerify(`turnstile=${encodeURIComponent(token)}`)}
        onExpire={onExpire}
        className={className}
      />
    )
  }

  return null
}
