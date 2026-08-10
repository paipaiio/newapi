import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { SettingsSwitchField } from '../components/settings-form-layout'

export interface WechatPaySettingsValues {
  WechatPayEnabled: boolean
  WechatPayMchId: string
  WechatPayAppId: string
  WechatPayApiV3Key: string
  WechatPaySerialNo: string
  WechatPayPrivateKey: string
  WechatPayNotifyUrl: string
  WechatPayUnitPrice: number
  WechatPayMinTopUp: number
}

type WechatPayFieldValues = WechatPaySettingsValues

interface Props {
  values: WechatPaySettingsValues
  onValueChange: <K extends keyof WechatPayFieldValues>(
    key: K,
    value: WechatPayFieldValues[K]
  ) => void
}

export function WechatPaySettingsSection({ values, onValueChange }: Props) {
  const { t } = useTranslation()
  const [showApiV3Key, setShowApiV3Key] = useState(false)
  const [showPrivateKey, setShowPrivateKey] = useState(false)

  return (
    <div className='space-y-4'>
      <SettingsSwitchField
        label={t('Enable WeChat Pay')}
        description={t('Enable official WeChat Pay (v3 API) for top-ups')}
        checked={values.WechatPayEnabled}
        onCheckedChange={(v) => onValueChange('WechatPayEnabled', v)}
      />

      {values.WechatPayEnabled && (
        <>
          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-1.5'>
              <Label>{t('Merchant ID (MchId)')}</Label>
              <Input
                placeholder='1234567890'
                value={values.WechatPayMchId}
                onChange={(e) =>
                  onValueChange('WechatPayMchId', e.target.value)
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t('WeChat Pay merchant ID (商户号)')}
              </p>
            </div>
            <div className='space-y-1.5'>
              <Label>{t('AppID (optional)')}</Label>
              <Input
                placeholder='wx...'
                value={values.WechatPayAppId}
                onChange={(e) =>
                  onValueChange('WechatPayAppId', e.target.value)
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t('Required for JSAPI/Mini-program; leave blank for H5')}
              </p>
            </div>
          </div>

          <div className='space-y-1.5'>
            <div className='flex items-center justify-between'>
              <Label>{t('APIv3 key')}</Label>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-6 w-6'
                onClick={() => setShowApiV3Key((v) => !v)}
              >
                {showApiV3Key ? (
                  <EyeOff className='h-3.5 w-3.5' />
                ) : (
                  <Eye className='h-3.5 w-3.5' />
                )}
              </Button>
            </div>
            <Input
              placeholder={
                showApiV3Key
                  ? 'Your 32-char APIv3 key'
                  : values.WechatPayApiV3Key
                    ? '••••••••'
                    : ''
              }
              type={showApiV3Key ? 'text' : 'password'}
              value={
                showApiV3Key
                  ? values.WechatPayApiV3Key
                  : values.WechatPayApiV3Key
                    ? '••••••••'
                    : ''
              }
              onChange={(e) =>
                onValueChange('WechatPayApiV3Key', e.target.value)
              }
              onFocus={() => setShowApiV3Key(true)}
              onBlur={() => setShowApiV3Key(false)}
              className='font-mono'
            />
            <p className='text-muted-foreground text-xs'>
              {t('32-character APIv3 key. Leave blank to keep existing.')}
            </p>
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Certificate serial number')}</Label>
            <Input
              placeholder='Hexadecimal serial number'
              value={values.WechatPaySerialNo}
              onChange={(e) =>
                onValueChange('WechatPaySerialNo', e.target.value)
              }
              className='font-mono text-xs'
            />
            <p className='text-muted-foreground text-xs'>
              {t('Serial number of your merchant API certificate (证书序列号)')}
            </p>
          </div>

          <div className='space-y-1.5'>
            <div className='flex items-center justify-between'>
              <Label>{t('Merchant private key (PEM)')}</Label>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-6 w-6'
                onClick={() => setShowPrivateKey((v) => !v)}
              >
                {showPrivateKey ? (
                  <EyeOff className='h-3.5 w-3.5' />
                ) : (
                  <Eye className='h-3.5 w-3.5' />
                )}
              </Button>
            </div>
            <Textarea
              rows={4}
              placeholder='-----BEGIN PRIVATE KEY-----'
              value={
                showPrivateKey
                  ? values.WechatPayPrivateKey
                  : values.WechatPayPrivateKey
                    ? '••••••••'
                    : ''
              }
              onChange={(e) =>
                onValueChange('WechatPayPrivateKey', e.target.value)
              }
              onFocus={() => setShowPrivateKey(true)}
              onBlur={() => setShowPrivateKey(false)}
              className='font-mono text-xs'
            />
            <p className='text-muted-foreground text-xs'>
              {t('Content of apiclient_key.pem. Leave blank to keep existing.')}
            </p>
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Callback URL (optional)')}</Label>
            <Input
              placeholder='https://your-domain.com/api/notify/wechatpay'
              value={values.WechatPayNotifyUrl}
              onChange={(e) =>
                onValueChange('WechatPayNotifyUrl', e.target.value)
              }
            />
            <p className='text-muted-foreground text-xs'>
              {t('Leave blank to auto-generate from system address')}
            </p>
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-1.5'>
              <Label>{t('Unit price (CNY per USD)')}</Label>
              <Input
                type='number'
                min={0}
                step={0.01}
                value={values.WechatPayUnitPrice}
                onChange={(e) =>
                  onValueChange(
                    'WechatPayUnitPrice',
                    parseFloat(e.target.value) || 0
                  )
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
                value={values.WechatPayMinTopUp}
                onChange={(e) =>
                  onValueChange(
                    'WechatPayMinTopUp',
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
