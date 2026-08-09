import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { SettingsSwitchField } from '../components/settings-form-layout'

export interface AlipaySettingsValues {
  AlipayEnabled: boolean
  AlipayAppId: string
  AlipayPrivateKey: string
  AlipayPublicKey: string
  AlipaySandbox: boolean
  AlipayUnitPrice: number
  AlipayMinTopUp: number
}

type AlipayFieldValues = AlipaySettingsValues

interface Props {
  values: AlipaySettingsValues
  onValueChange: <K extends keyof AlipayFieldValues>(
    key: K,
    value: AlipayFieldValues[K]
  ) => void
}

export function AlipaySettingsSection({ values, onValueChange }: Props) {
  const { t } = useTranslation()
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [showPublicKey, setShowPublicKey] = useState(false)

  return (
    <div className='space-y-4'>
      <SettingsSwitchField
        label={t('Enable Alipay')}
        description={t('Enable official Alipay payment for top-ups')}
        checked={values.AlipayEnabled}
        onCheckedChange={(v) => onValueChange('AlipayEnabled', v)}
      />

      {values.AlipayEnabled && (
        <>
          <div className='space-y-1.5'>
            <Label>{t('App ID')}</Label>
            <Input
              placeholder='2021XXXXXXXXXXXX'
              value={values.AlipayAppId}
              onChange={(e) => onValueChange('AlipayAppId', e.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              {t('Alipay App ID from the Open Platform console')}
            </p>
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Application private key (RSA2)')}</Label>
            <div className='relative'>
              <Textarea
                rows={4}
                placeholder='-----BEGIN RSA PRIVATE KEY-----'
                value={showPrivateKey ? values.AlipayPrivateKey : values.AlipayPrivateKey ? '••••••••' : ''}
                onChange={(e) =>
                  onValueChange('AlipayPrivateKey', e.target.value)
                }
                onFocus={() => setShowPrivateKey(true)}
                onBlur={() => setShowPrivateKey(false)}
                className='font-mono text-xs'
              />
            </div>
            <p className='text-muted-foreground text-xs'>
              {t('Your application private key (RSA2). Leave blank to keep existing.')}
            </p>
          </div>

          <div className='space-y-1.5'>
            <div className='flex items-center justify-between'>
              <Label>{t('Alipay public key')}</Label>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-6 w-6'
                onClick={() => setShowPublicKey((v) => !v)}
              >
                {showPublicKey ? (
                  <EyeOff className='h-3.5 w-3.5' />
                ) : (
                  <Eye className='h-3.5 w-3.5' />
                )}
              </Button>
            </div>
            <Textarea
              rows={4}
              placeholder='MIIBIjANBgkqhkiG9w0B...'
              value={
                showPublicKey
                  ? values.AlipayPublicKey
                  : values.AlipayPublicKey
                  ? '••••••••'
                  : ''
              }
              onChange={(e) =>
                onValueChange('AlipayPublicKey', e.target.value)
              }
              onFocus={() => setShowPublicKey(true)}
              onBlur={() => setShowPublicKey(false)}
              className='font-mono text-xs'
            />
            <p className='text-muted-foreground text-xs'>
              {t('Alipay public key for signature verification. Leave blank to keep existing.')}
            </p>
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-1.5'>
              <Label>{t('Unit price (CNY per USD)')}</Label>
              <Input
                type='number'
                min={0}
                step={0.01}
                value={values.AlipayUnitPrice}
                onChange={(e) =>
                  onValueChange('AlipayUnitPrice', parseFloat(e.target.value) || 0)
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t('CNY per 1 USD of quota')}
              </p>
            </div>
            <div className='space-y-1.5'>
              <Label>{t('Minimum top-up (CNY)')}</Label>
              <Input
                type='number'
                min={0}
                step={0.01}
                value={values.AlipayMinTopUp}
                onChange={(e) =>
                  onValueChange('AlipayMinTopUp', parseFloat(e.target.value) || 0)
                }
              />
            </div>
          </div>

          <div className='flex items-center gap-3 rounded-md border p-3'>
            <Switch
              checked={values.AlipaySandbox}
              onCheckedChange={(v) => onValueChange('AlipaySandbox', v)}
            />
            <div>
              <p className='text-sm font-medium'>{t('Sandbox mode')}</p>
              <p className='text-muted-foreground text-xs'>
                {t('Use Alipay sandbox environment for testing')}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
