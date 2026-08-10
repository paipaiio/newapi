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
import { useTranslation } from 'react-i18next'

import { getStatus } from '@/lib/api'

const POLL_MS = 60_000

/**
 * 版本检测横幅：页面加载时把 /api/status 的 version 记为基线，之后每 60s 轮询
 * 并在窗口重新聚焦时复查。一旦线上 version 变了（说明有新部署），提示用户刷新，
 * 避免旧 shell 去加载已失效的异步 chunk —— 这是「部署后跨页白屏/500」的根因。
 */
export function VersionUpdateBanner() {
  const { t } = useTranslation()
  const baselineRef = useRef<string | null>(null)
  const [newVersion, setNewVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let stopped = false

    const check = async () => {
      try {
        const data = await getStatus()
        const v = (data?.version as string | undefined) || null
        if (!v || stopped) return
        if (baselineRef.current === null) {
          baselineRef.current = v // 首次：记录基线版本
          return
        }
        if (v !== baselineRef.current) {
          setNewVersion(v) // 发现新版本
        }
      } catch {
        // 网络异常忽略，下个周期再试
      }
    }

    check()
    const timer = setInterval(check, POLL_MS)
    const onFocus = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)

    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  if (!newVersion || dismissed) return null

  return (
    <div className='fixed inset-x-0 top-0 z-[100] flex justify-center p-2'>
      <div className='flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm shadow-md dark:border-amber-700 dark:bg-amber-950'>
        <span className='text-amber-900 dark:text-amber-100'>
          {t('New version {{version}} detected, please refresh for the latest.', {
            version: newVersion,
          })}
        </span>
        <button
          onClick={() => window.location.reload()}
          className='rounded bg-amber-600 px-3 py-1 whitespace-nowrap text-white transition-colors hover:bg-amber-700'
        >
          {t('Refresh now')}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label={t('Dismiss')}
          className='text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100'
        >
          ✕
        </button>
      </div>
    </div>
  )
}
