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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatTimestamp } from '@/lib/format'

import { reviewContentSafetyEvent } from '../api'
import type { ContentSafetyEvent } from '../types'

interface Props {
  record: ContentSafetyEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onReviewed: () => void
}

export function ContentSafetyDetailDialog({
  record,
  open,
  onOpenChange,
  onReviewed,
}: Props) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (status: string) => {
    if (!record) return
    setSaving(true)
    try {
      const res = await reviewContentSafetyEvent(record.id, status, note)
      if (!res.success) {
        toast.error(res.message || t('Failed to update review'))
        return
      }
      toast.success(t('Review updated'))
      setNote('')
      onReviewed()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Safety event')}
      contentClassName='sm:max-w-2xl'
    >
      {record ? (
        <div className='space-y-4'>
          <dl className='grid grid-cols-1 gap-3 text-sm sm:grid-cols-2'>
            <div>
              <dt className='text-muted-foreground'>{t('Time')}</dt>
              <dd>{formatTimestamp(record.created_at)}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('Username')}</dt>
              <dd>{record.username || '-'}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('Model')}</dt>
              <dd>{record.model_name || '-'}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('Request ID')}</dt>
              <dd className='break-all'>{record.request_id || '-'}</dd>
            </div>
            <div className='flex items-center gap-2'>
              <dt className='text-muted-foreground'>{t('Policy')}</dt>
              <dd>
                <StatusBadge
                  variant={record.policy === 'uncensored' ? 'purple' : 'info'}
                  copyable={false}
                >
                  {record.policy}
                </StatusBadge>
              </dd>
            </div>
            <div className='flex items-center gap-2'>
              <dt className='text-muted-foreground'>{t('Action')}</dt>
              <dd>
                <StatusBadge
                  variant={record.action === 'block' ? 'danger' : 'warning'}
                  copyable={false}
                >
                  {record.action}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('Category')}</dt>
              <dd>{record.categories || record.category || '-'}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('Source')}</dt>
              <dd>{record.source || '-'}</dd>
            </div>
          </dl>

          <div>
            <p className='text-muted-foreground mb-1 text-sm'>{t('Snippet')}</p>
            <p className='bg-muted/40 rounded-md p-3 text-sm whitespace-pre-wrap'>
              {record.snippet || '-'}
            </p>
          </div>

          {record.matched ? (
            <div>
              <p className='text-muted-foreground mb-1 text-sm'>
                {t('Matched signal')}
              </p>
              <p className='text-sm'>{record.matched}</p>
            </div>
          ) : null}

          <div>
            <label className='text-muted-foreground mb-1 block text-sm' htmlFor='review-note'>
              {t('Review note')}
            </label>
            <Textarea
              id='review-note'
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className='flex flex-wrap justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={saving}
              onClick={() => submit('dismissed')}
            >
              {t('Dismiss')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={saving}
              onClick={() => submit('reviewed')}
            >
              {t('Mark reviewed')}
            </Button>
            <Button
              type='button'
              variant='destructive'
              disabled={saving}
              onClick={() => submit('banned')}
            >
              {t('Ban user')}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
