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
import { ArrowRight, Wallet, Search, Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatQuota } from '@/lib/format'
import { useSystemConfigStore } from '@/stores/system-config-store'

interface TransferResult {
  transfer_amount: number
  target_remain: number
  target_name: string
  target_unlimited: boolean
}

async function transferBalance(
  targetKey: string,
  sourceKey: string
): Promise<{ success: boolean; message?: string; data?: TransferResult }> {
  const res = await fetch('/api/public/key-transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_key: targetKey, source_key: sourceKey }),
  })
  return res.json()
}

export function KeyTransfer() {
  const { t } = useTranslation()
  const { config } = useSystemConfigStore()

  const [targetKey, setTargetKey] = useState('')
  const [sourceKey, setSourceKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TransferResult | null>(null)
  const [error, setError] = useState('')

  const handleTransfer = async () => {
    const target = targetKey.trim()
    const source = sourceKey.trim()
    if (!target || !source) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await transferBalance(target, source)
      if (res.success && res.data) {
        setResult(res.data)
      } else {
        setError(res.message || t('Transfer failed'))
      }
    } catch {
      setError(t('Request failed'))
    }
    setLoading(false)
  }

  return (
    <div className='bg-background flex min-h-screen flex-col'>
      {/* Top bar */}
      <header className='border-b px-4 py-3 sm:px-6'>
        <div className='mx-auto flex max-w-2xl items-center justify-between'>
          <div className='flex items-center gap-2.5'>
            <img
              src={config.logo}
              alt={config.systemName}
              className='h-7 w-7 object-contain'
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
            <span className='text-base font-semibold'>{config.systemName}</span>
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              render={<a href='/key-balance' />}
            >
              <Search className='mr-1 h-4 w-4' />
              {t('Key Balance Query')}
            </Button>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className='flex flex-1 items-start justify-center p-4 pt-10 sm:pt-16'>
        <div className='w-full max-w-2xl space-y-6'>
          {/* Page title */}
          <div className='space-y-1 text-center'>
            <h1 className='text-2xl font-semibold'>{t('Balance Transfer')}</h1>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Move the balance of one key onto another, so you can keep using a single key'
              )}
            </p>
          </div>

          {/* Explanation */}
          <div className='bg-muted/40 space-y-2 rounded-lg border p-4'>
            <div className='flex items-center gap-2 text-sm font-medium'>
              <Info className='h-4 w-4 shrink-0' />
              {t('How balance transfer works')}
            </div>
            <ul className='text-muted-foreground ml-6 list-disc space-y-1 text-sm'>
              <li>
                {t(
                  "The source key's remaining balance is added to the target key."
                )}
              </li>
              <li>
                {t(
                  'After the transfer, the source key is emptied and can no longer be used.'
                )}
              </li>
              <li>
                {t(
                  'This cannot be undone. Please double-check both keys before transferring.'
                )}
              </li>
            </ul>
          </div>

          {/* Input card */}
          <div className='bg-card space-y-4 rounded-lg border p-6'>
            <div className='space-y-2'>
              <Label htmlFor='target-input'>{t('Target key (keep)')}</Label>
              <Input
                id='target-input'
                value={targetKey}
                onChange={(e) => setTargetKey(e.target.value)}
                placeholder='sk-...'
                className='font-mono text-sm'
              />
              <p className='text-muted-foreground text-xs'>
                {t('The key you want to keep using; balance is added here')}
              </p>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='source-input'>{t('Source key (drain)')}</Label>
              <Input
                id='source-input'
                value={sourceKey}
                onChange={(e) => setSourceKey(e.target.value)}
                placeholder='sk-...'
                className='font-mono text-sm'
              />
              <p className='text-muted-foreground text-xs'>
                {t('The key to move balance from; it will be emptied')}
              </p>
            </div>
            <Button
              onClick={handleTransfer}
              disabled={loading || !targetKey.trim() || !sourceKey.trim()}
              className='w-full'
            >
              <ArrowRight className='mr-1 h-4 w-4' />
              {loading ? t('Transferring...') : t('Transfer balance')}
            </Button>
            {error && (
              <div className='bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm'>
                {error}
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div className='bg-card space-y-4 rounded-lg border p-6'>
              <div className='flex items-center gap-2 text-sm font-medium text-green-600'>
                <Wallet className='h-4 w-4' />
                {t('Transfer successful')}
              </div>
              <div className='divide-border/40 divide-y text-sm'>
                <div className='flex items-center justify-between py-2.5'>
                  <span className='text-muted-foreground'>
                    {t('Amount transferred')}
                  </span>
                  <span className='font-semibold'>
                    {formatQuota(result.transfer_amount)}
                  </span>
                </div>
                <div className='flex items-center justify-between py-2.5'>
                  <span className='text-muted-foreground'>
                    {t('Target key')}
                  </span>
                  <span className='font-medium'>{result.target_name}</span>
                </div>
                <div className='flex items-center justify-between py-2.5'>
                  <span className='text-muted-foreground'>
                    {t('Target new balance')}
                  </span>
                  <span className='font-semibold'>
                    {formatQuota(result.target_remain)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
