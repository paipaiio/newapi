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
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/dialog'
import { setTokenRateLimit } from '../api'
import type { TokenLookupRow } from '../types'

interface RateLimitDialogProps {
  token: TokenLookupRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (tokenId: number, rpm: number, tpm: number) => void
}

export function RateLimitDialog({
  token,
  open,
  onOpenChange,
  onSaved,
}: RateLimitDialogProps) {
  const { t } = useTranslation()
  const [rpm, setRpm] = useState(0)
  const [tpm, setTpm] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && token) {
      setRpm(token.rpm || 0)
      setTpm(token.tpm || 0)
    }
  }, [open, token])

  const handleSave = async () => {
    if (!token) return
    setSaving(true)
    try {
      const res = await setTokenRateLimit(token.id, rpm || 0, tpm || 0)
      if (res.success) {
        toast.success(t('Rate limit saved'))
        onSaved(token.id, rpm || 0, tpm || 0)
        onOpenChange(false)
      } else {
        toast.error(res.message || t('Save failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        token
          ? `${t('Set rate limit')}: ${token.username || token.key}`
          : t('Set rate limit')
      }
      contentClassName='sm:max-w-md'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <div className='flex justify-end gap-2'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {t('Save')}
          </Button>
        </div>
      }
    >
      <div className='space-y-1.5'>
        <Label>{t('RPM (requests per minute, 0 = unlimited)')}</Label>
        <Input
          type='number'
          min={0}
          value={String(rpm)}
          onChange={(e) => setRpm(Number(e.target.value))}
        />
      </div>
      <div className='space-y-1.5'>
        <Label>{t('TPM (tokens per minute, 0 = unlimited)')}</Label>
        <Input
          type='number'
          min={0}
          value={String(tpm)}
          onChange={(e) => setTpm(Number(e.target.value))}
        />
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'This is a per-API-key limit. It stacks with user- and channel-level limits; the strictest applies.'
        )}
      </p>
    </Dialog>
  )
}
