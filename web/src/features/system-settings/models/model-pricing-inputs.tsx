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
import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import {
  SettingsControlGroup,
  SettingsSwitchField,
} from '../components/settings-form-layout'
import {
  emptyGroupPriceOverride,
  numericDraftRegex,
  type GroupPriceField,
  type GroupPriceOverride,
} from './model-pricing-core'

export function PriceInput(props: {
  value: string
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <InputGroup>
      <InputGroupAddon>$</InputGroupAddon>
      <InputGroupInput
        inputMode='decimal'
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <InputGroupAddon align='inline-end'>$/1M</InputGroupAddon>
    </InputGroup>
  )
}

export function GroupPriceFieldList(props: {
  field: GroupPriceField
  placeholder?: string
  suffix?: string
  groupPrices: GroupPriceOverride[]
  groupOptions: string[]
  onChange: (next: GroupPriceOverride[]) => void
}) {
  const { t } = useTranslation()
  const suffix = props.suffix ?? '$/1M'

  const updateRow = (index: number, patch: Partial<GroupPriceOverride>) => {
    props.onChange(
      props.groupPrices.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      )
    )
  }

  return (
    <div className='space-y-2'>
      {props.groupPrices.map((row, index) => (
        <div key={index} className='flex items-center gap-2'>
          <Select
            value={row.group}
            onValueChange={(value) => updateRow(index, { group: value ?? '' })}
          >
            <SelectTrigger className='w-40'>
              <SelectValue placeholder={t('Select group')} />
            </SelectTrigger>
            <SelectContent>
              {props.groupOptions.map((group) => (
                <SelectItem key={group} value={group}>
                  {group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <InputGroup className='min-w-32 flex-1'>
            <InputGroupAddon>$</InputGroupAddon>
            <InputGroupInput
              inputMode='decimal'
              placeholder={props.placeholder}
              value={row[props.field]}
              onChange={(event) => {
                const value = event.target.value
                if (!numericDraftRegex.test(value)) return
                updateRow(index, { [props.field]: value })
              }}
            />
            <InputGroupAddon align='inline-end'>{suffix}</InputGroupAddon>
          </InputGroup>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='h-8 w-8'
            onClick={() =>
              props.onChange(props.groupPrices.filter((_, i) => i !== index))
            }
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() =>
          props.onChange([...props.groupPrices, emptyGroupPriceOverride()])
        }
      >
        <Plus className='mr-1 h-4 w-4' />
        {t('Add group price')}
      </Button>
    </div>
  )
}

export function PriceLane(props: {
  title: string
  description: string
  placeholder: string
  value: string
  enabled: boolean
  disabled?: boolean
  extra?: ReactNode
  onEnabledChange: (checked: boolean) => void
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const effectiveDisabled = props.disabled || !props.enabled

  return (
    <div className='space-y-3'>
      <SettingsControlGroup
        className={cn('space-y-3', effectiveDisabled && 'opacity-75')}
        data-disabled={effectiveDisabled || undefined}
      >
        <SettingsSwitchField
          checked={props.enabled}
          disabled={props.disabled}
          onCheckedChange={props.onEnabledChange}
          label={props.title}
          description={props.description}
          aria-label={props.title}
        />
        <PriceInput
          value={props.value}
          placeholder={props.placeholder}
          disabled={effectiveDisabled}
          onChange={props.onChange}
        />
        <p className='text-muted-foreground text-xs'>
          {props.enabled
            ? t('USD price per 1M tokens.')
            : t('Disabled lanes are omitted on save.')}
        </p>
      </SettingsControlGroup>
      {props.extra}
    </div>
  )
}
