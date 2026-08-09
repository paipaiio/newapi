import { Gift, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { formatNumber } from '@/lib/format'

import type { TopupInfo } from '../types'

interface AbusePendingBonusBannerProps {
  topupInfo: TopupInfo | null
  priceRatio?: number
}

export function AbusePendingBonusBanner({
  topupInfo,
  priceRatio = 1,
}: AbusePendingBonusBannerProps) {
  const { t } = useTranslation()

  if (!topupInfo) return null

  const pendingBonus = topupInfo.abuse_pending_bonus ?? 0
  const required = topupInfo.abuse_topup_required ?? 50
  const accumulated = topupInfo.abuse_topup_accumulated ?? 0

  if (pendingBonus <= 0) return null

  const remaining = Math.max(0, required - accumulated)
  const pct = Math.min(100, Math.round((accumulated / required) * 100))
  const bonusDisplay = formatNumber(pendingBonus / priceRatio)

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              {t('{{amount}} bonus pending unlock', { amount: bonusDisplay })}
            </p>
            {remaining <= 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                <Gift className="h-3 w-3" />
                {t('Released')}
              </span>
            ) : (
              <span className="text-xs text-amber-700 dark:text-amber-400">
                {t('Still need ¥{{amount}} CNY', { amount: remaining.toFixed(2) })}
              </span>
            )}
          </div>

          {/* progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-200 dark:bg-amber-800">
            <div
              className="h-full rounded-full bg-amber-500 transition-all dark:bg-amber-400"
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t(
              'Top up ¥{{required}} CNY total to unlock — accumulated ¥{{accumulated}}',
              {
                required: required.toFixed(0),
                accumulated: accumulated.toFixed(2),
              }
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
