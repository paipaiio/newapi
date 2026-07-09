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
import { Check, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/dialog'

interface CredentialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientSecret: string
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  return (
    <div className='space-y-1.5'>
      <Label className='text-sm font-semibold'>{label}</Label>
      <div className='bg-muted/50 flex items-center gap-2 rounded-md border p-2'>
        <code className='flex-1 overflow-x-auto text-xs break-all'>
          {value || '-'}
        </code>
        <Button
          variant='ghost'
          size='icon'
          className='size-7 shrink-0'
          onClick={() => copyToClipboard(value)}
        >
          {copiedText === value ? (
            <Check className='size-4 text-green-600' />
          ) : (
            <Copy className='size-4' />
          )}
        </Button>
      </div>
    </div>
  )
}

export function CredentialDialog({
  open,
  onOpenChange,
  clientId,
  clientSecret,
}: CredentialDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Client credentials')}
      description={t(
        'The client secret is shown only once. Store it somewhere safe now.'
      )}
      contentClassName='sm:max-w-lg'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <div className='flex justify-end'>
          <Button onClick={() => onOpenChange(false)}>{t('Done')}</Button>
        </div>
      }
    >
      <CopyableField label='Client ID' value={clientId} />
      <CopyableField label='Client Secret' value={clientSecret} />
      <p className='text-xs text-amber-600 dark:text-amber-400'>
        {t(
          'This secret cannot be retrieved again. If lost, rotate the secret to generate a new one.'
        )}
      </p>
    </Dialog>
  )
}
