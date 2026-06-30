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
import { useEffect, useMemo, useRef, useState } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'

/**
 * IMPORTANT: react-hook-form 7 interprets dotted `name` strings as nested
 * paths. To keep form state aligned with what zod validates and saves, we
 * model the form internally with a nested object and only flatten back to the
 * server-side `storage_setting.<key>` format right before persisting (mirrors
 * performance-section).
 */
const storageSchema = z.object({
  storage_setting: z.object({
    enabled: z.boolean(),
    capture_failed: z.boolean(),
    endpoint: z.string(),
    region: z.string(),
    bucket: z.string(),
    access_key: z.string(),
    secret_key: z.string(),
    key_prefix: z.string(),
    retention_days: z.coerce.number().min(0),
    max_body_bytes: z.coerce.number().min(0),
  }),
})

type StorageFormInput = z.input<typeof storageSchema>
type StorageFormValues = z.output<typeof storageSchema>

export type FlatStorageDefaults = {
  'storage_setting.enabled': boolean
  'storage_setting.capture_failed': boolean
  'storage_setting.endpoint': string
  'storage_setting.region': string
  'storage_setting.bucket': string
  'storage_setting.access_key': string
  'storage_setting.secret_key': string
  'storage_setting.key_prefix': string
  'storage_setting.retention_days': number
  'storage_setting.max_body_bytes': number
}

const buildFormDefaults = (defaults: FlatStorageDefaults): StorageFormInput => ({
  storage_setting: {
    enabled: defaults['storage_setting.enabled'],
    capture_failed: defaults['storage_setting.capture_failed'],
    endpoint: defaults['storage_setting.endpoint'] ?? '',
    region: defaults['storage_setting.region'] ?? '',
    bucket: defaults['storage_setting.bucket'] ?? '',
    access_key: defaults['storage_setting.access_key'] ?? '',
    secret_key: defaults['storage_setting.secret_key'] ?? '',
    key_prefix: defaults['storage_setting.key_prefix'] ?? '',
    retention_days: defaults['storage_setting.retention_days'],
    max_body_bytes: defaults['storage_setting.max_body_bytes'],
  },
})

const normalizeFormValues = (
  values: StorageFormValues
): FlatStorageDefaults => ({
  'storage_setting.enabled': values.storage_setting.enabled,
  'storage_setting.capture_failed': values.storage_setting.capture_failed,
  'storage_setting.endpoint': values.storage_setting.endpoint.trim(),
  'storage_setting.region': values.storage_setting.region.trim(),
  'storage_setting.bucket': values.storage_setting.bucket.trim(),
  'storage_setting.access_key': values.storage_setting.access_key,
  'storage_setting.secret_key': values.storage_setting.secret_key,
  'storage_setting.key_prefix': values.storage_setting.key_prefix.trim(),
  'storage_setting.retention_days': values.storage_setting.retention_days,
  'storage_setting.max_body_bytes': values.storage_setting.max_body_bytes,
})

// Secret fields are write-only: an empty value means "keep the existing
// secret", so they are only pushed when the operator typed a new value.
const SECRET_KEYS: Set<keyof FlatStorageDefaults> = new Set([
  'storage_setting.access_key',
  'storage_setting.secret_key',
])

interface Props {
  defaultValues: FlatStorageDefaults
}

export function StorageSettingsSection(props: Props) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [testing, setTesting] = useState(false)

  const formDefaults = useMemo(
    () => buildFormDefaults(props.defaultValues),
    [props.defaultValues]
  )

  const form = useForm<StorageFormInput, unknown, StorageFormValues>({
    resolver: zodResolver(storageSchema),
    defaultValues: formDefaults,
  })

  const baselineRef = useRef<FlatStorageDefaults>(props.defaultValues)
  const baselineSerializedRef = useRef<string>(
    JSON.stringify(props.defaultValues)
  )

  useEffect(() => {
    const serialized = JSON.stringify(props.defaultValues)
    if (serialized === baselineSerializedRef.current) return
    baselineRef.current = props.defaultValues
    baselineSerializedRef.current = serialized
    form.reset(buildFormDefaults(props.defaultValues))
  }, [props.defaultValues, form])

  const onSubmit = async (values: StorageFormValues) => {
    const normalized = normalizeFormValues(values)
    const changedKeys = (
      Object.keys(normalized) as Array<keyof FlatStorageDefaults>
    ).filter((key) => {
      // Secrets only push when a new non-empty value is entered.
      if (SECRET_KEYS.has(key)) {
        return normalized[key] !== '' && normalized[key] !== baselineRef.current[key]
      }
      return normalized[key] !== baselineRef.current[key]
    })

    if (changedKeys.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const key of changedKeys) {
      await updateOption.mutateAsync({ key, value: normalized[key] })
    }

    // Persist non-secret changes into the baseline; secrets stay write-only so
    // we never echo them back into form state.
    const nextBaseline: FlatStorageDefaults = { ...baselineRef.current }
    for (const key of changedKeys) {
      if (!SECRET_KEYS.has(key)) {
        ;(nextBaseline[key] as FlatStorageDefaults[typeof key]) =
          normalized[key]
      }
    }
    baselineRef.current = nextBaseline
    baselineSerializedRef.current = JSON.stringify(nextBaseline)
    form.reset(buildFormDefaults(nextBaseline))
  }

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      const res = await api.post('/api/session_log/test_connection')
      if (res.data.success) {
        toast.success(res.data.message || t('Connection successful'))
      } else {
        toast.error(res.data.message || t('Connection failed'))
      }
    } catch {
      toast.error(t('Connection failed'))
    } finally {
      setTesting(false)
    }
  }

  return (
    <SettingsSection title={t('Session Storage (R2)')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save storage settings'
          />

          <p className='text-muted-foreground text-xs'>
            {t(
              'Capture conversation request/response bodies and store them in an S3-compatible bucket (such as Cloudflare R2).'
            )}
          </p>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='storage_setting.enabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Enable session storage')}</FormLabel>
                    <FormDescription>
                      {t('Persist conversation bodies to object storage.')}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
            <FormField
              control={form.control}
              name='storage_setting.capture_failed'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Capture failed requests')}</FormLabel>
                    <FormDescription>
                      {t('Also store records for requests that failed.')}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name='storage_setting.endpoint'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Endpoint')}</FormLabel>
                <FormControl>
                  <Input
                    type='url'
                    inputMode='url'
                    placeholder={t(
                      'https://<account>.r2.cloudflarestorage.com'
                    )}
                    autoComplete='off'
                    {...field}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                </FormControl>
                <FormDescription>
                  {t('S3-compatible endpoint URL for the storage provider.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='storage_setting.region'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Region')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='auto'
                      autoComplete='off'
                      {...field}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Use "auto" for Cloudflare R2.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='storage_setting.bucket'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Bucket')}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete='off'
                      {...field}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Name of the bucket to store records in.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='storage_setting.access_key'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Access Key ID')}</FormLabel>
                  <FormControl>
                    <Input
                      type='password'
                      placeholder={t('Enter new value to update')}
                      autoComplete='new-password'
                      {...field}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Leave blank to keep the existing value.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='storage_setting.secret_key'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Secret Access Key')}</FormLabel>
                  <FormControl>
                    <Input
                      type='password'
                      placeholder={t('Enter new value to update')}
                      autoComplete='new-password'
                      {...field}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Leave blank to keep the existing value.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name='storage_setting.key_prefix'
            render={({ field }) => (
              <FormItem className='max-w-md'>
                <FormLabel>{t('Key prefix')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder='conv'
                    autoComplete='off'
                    {...field}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                </FormControl>
                <FormDescription>
                  {t('Object key prefix used when storing records.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='storage_setting.retention_days'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Retention days')}</FormLabel>
                  <FormControl>
                    <Input type='number' min={0} step={1} {...safeNumberFieldProps(field)} />
                  </FormControl>
                  <FormDescription>
                    {t('0 means records are kept permanently.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='storage_setting.max_body_bytes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Max body bytes')}</FormLabel>
                  <FormControl>
                    <Input type='number' min={0} step={1} {...safeNumberFieldProps(field)} />
                  </FormControl>
                  <FormDescription>
                    {t('Bodies larger than this size are truncated before storage.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </SettingsForm>
      </Form>

      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground text-xs'>
          {t('Save your changes before testing the connection.')}
        </p>
        <div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing ? t('Testing...') : t('Test Connection')}
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
