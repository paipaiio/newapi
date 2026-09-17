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
import { Gift, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TokenRedeemCardProps {
  value: string
  onChange: (value: string) => void
  onRedeem: () => void
  redeeming: boolean
}

export function TokenRedeemCard(props: TokenRedeemCardProps) {
  const { t } = useTranslation()

  return (
    <div className='space-y-3 rounded-lg border p-4 sm:p-5'>
      <div className='flex items-center gap-2'>
        <IconBadge tone='warning' size='xs'>
          <Gift />
        </IconBadge>
        <Label
          htmlFor='account-api-key'
          className='text-muted-foreground text-xs font-medium tracking-wider uppercase'
        >
          {t("Redeem another account's API key")}
        </Label>
      </div>
      <p className='text-muted-foreground text-sm'>
        {t(
          "Paste another account's API key to transfer its entire balance here. That account will be disabled."
        )}
      </p>
      <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
        <Input
          id='account-api-key'
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={t("Paste an API key from another account")}
          autoComplete='off'
          className='h-9 min-w-0'
        />
        <Button
          onClick={props.onRedeem}
          disabled={props.redeeming || !props.value.trim()}
          variant='outline'
          className='h-9 px-4'
        >
          {props.redeeming && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {t('Redeem')}
        </Button>
      </div>
    </div>
  )
}
