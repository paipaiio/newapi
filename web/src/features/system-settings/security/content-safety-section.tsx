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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'

const contentSafetySchema = z.object({
  content_safety: z.object({
    enabled: z.boolean(),
    standard_mode: z.string(),
    uncensored_mode: z.string(),
    uncensored_models: z.string(),
    uncensored_groups: z.string(),
    jailbreak_scan_enabled: z.boolean(),
    redline_words: z.string(),
    guard_enabled: z.boolean(),
    guard_base_url: z.string(),
    guard_api_key: z.string(),
    guard_model: z.string(),
    guard_timeout_ms: z.coerce.number().min(0),
    guard_fail_open: z.boolean(),
    scan_output: z.boolean(),
    auto_disable_user: z.boolean(),
  }),
})

type FormInput = z.input<typeof contentSafetySchema>
type FormValues = z.output<typeof contentSafetySchema>

export type FlatContentSafetyDefaults = {
  'content_safety.enabled': boolean
  'content_safety.standard_mode': string
  'content_safety.uncensored_mode': string
  'content_safety.uncensored_models': string
  'content_safety.uncensored_groups': string
  'content_safety.jailbreak_scan_enabled': boolean
  'content_safety.redline_words': string
  'content_safety.guard_enabled': boolean
  'content_safety.guard_base_url': string
  'content_safety.guard_api_key': string
  'content_safety.guard_model': string
  'content_safety.guard_timeout_ms': number
  'content_safety.guard_fail_open': boolean
  'content_safety.scan_output': boolean
  'content_safety.auto_disable_user': boolean
}

const buildFormDefaults = (
  defaults: FlatContentSafetyDefaults
): FormInput => ({
  content_safety: {
    enabled: defaults['content_safety.enabled'],
    standard_mode: defaults['content_safety.standard_mode'] || 'async',
    uncensored_mode: defaults['content_safety.uncensored_mode'] || 'async',
    uncensored_models: defaults['content_safety.uncensored_models'] ?? '',
    uncensored_groups: defaults['content_safety.uncensored_groups'] ?? '',
    jailbreak_scan_enabled: defaults['content_safety.jailbreak_scan_enabled'],
    redline_words: defaults['content_safety.redline_words'] ?? '',
    guard_enabled: defaults['content_safety.guard_enabled'],
    guard_base_url: defaults['content_safety.guard_base_url'] ?? '',
    guard_api_key: '',
    guard_model: defaults['content_safety.guard_model'] ?? '',
    guard_timeout_ms: defaults['content_safety.guard_timeout_ms'] ?? 800,
    guard_fail_open: defaults['content_safety.guard_fail_open'],
    scan_output: defaults['content_safety.scan_output'],
    auto_disable_user: defaults['content_safety.auto_disable_user'],
  },
})

const normalizeFormValues = (
  values: FormValues
): FlatContentSafetyDefaults => ({
  'content_safety.enabled': values.content_safety.enabled,
  'content_safety.standard_mode': values.content_safety.standard_mode,
  'content_safety.uncensored_mode': values.content_safety.uncensored_mode,
  'content_safety.uncensored_models':
    values.content_safety.uncensored_models.trim(),
  'content_safety.uncensored_groups':
    values.content_safety.uncensored_groups.trim(),
  'content_safety.jailbreak_scan_enabled':
    values.content_safety.jailbreak_scan_enabled,
  'content_safety.redline_words': values.content_safety.redline_words.trim(),
  'content_safety.guard_enabled': values.content_safety.guard_enabled,
  'content_safety.guard_base_url': values.content_safety.guard_base_url.trim(),
  'content_safety.guard_api_key': values.content_safety.guard_api_key,
  'content_safety.guard_model': values.content_safety.guard_model.trim(),
  'content_safety.guard_timeout_ms': values.content_safety.guard_timeout_ms,
  'content_safety.guard_fail_open': values.content_safety.guard_fail_open,
  'content_safety.scan_output': values.content_safety.scan_output,
  'content_safety.auto_disable_user': values.content_safety.auto_disable_user,
})

const SECRET_KEYS: Set<keyof FlatContentSafetyDefaults> = new Set([
  'content_safety.guard_api_key',
])

const MODE_ITEMS = [
  { value: 'off', labelKey: 'Off (no scan)' },
  { value: 'async', labelKey: 'Async (log only)' },
  { value: 'blocking', labelKey: 'Blocking (reject request)' },
] as const

interface Props {
  defaultValues: FlatContentSafetyDefaults
}

export function ContentSafetySection(props: Props) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const formDefaults = useMemo(
    () => buildFormDefaults(props.defaultValues),
    [props.defaultValues]
  )
  const baselineRef = useRef(props.defaultValues)

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(contentSafetySchema),
    defaultValues: formDefaults,
  })

  useEffect(() => {
    baselineRef.current = props.defaultValues
    form.reset(buildFormDefaults(props.defaultValues))
  }, [form, props.defaultValues])

  const onSubmit = async (values: FormValues) => {
    const normalized = normalizeFormValues(values)
    const changedKeys = (
      Object.keys(normalized) as Array<keyof FlatContentSafetyDefaults>
    ).filter((key) => {
      if (SECRET_KEYS.has(key)) {
        return (
          normalized[key] !== '' && normalized[key] !== baselineRef.current[key]
        )
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

    const nextBaseline: FlatContentSafetyDefaults = { ...baselineRef.current }
    for (const key of changedKeys) {
      if (!SECRET_KEYS.has(key)) {
        ;(nextBaseline[key] as FlatContentSafetyDefaults[typeof key]) =
          normalized[key]
      }
    }
    baselineRef.current = nextBaseline
    form.reset(buildFormDefaults(nextBaseline))
  }

  return (
    <SettingsSection title={t('Content Safety')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save content safety settings'
          />

          <p className='text-muted-foreground text-xs'>
            {t(
              'Detect jailbreak attempts on standard models and review traffic on uncensored models. Default is off. Hard illegal content is always blocked when the feature is enabled.'
            )}
          </p>

          <FormField
            control={form.control}
            name='content_safety.enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable content safety')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Master switch. Leave off until you have reviewed the policy modes below.'
                    )}
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
            name='content_safety.standard_mode'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Standard model mode')}</FormLabel>
                <Select
                  items={MODE_ITEMS.map((item) => ({
                    value: item.value,
                    label: t(item.labelKey),
                  }))}
                  value={field.value}
                  onValueChange={(value) => value && field.onChange(value)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {MODE_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {t(item.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {t(
                    'Applied to models that are not in the uncensored list. Blocking rejects jailbreak and policy violations before upstream.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='content_safety.uncensored_mode'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Uncensored model mode')}</FormLabel>
                <Select
                  items={MODE_ITEMS.map((item) => ({
                    value: item.value,
                    label: t(item.labelKey),
                  }))}
                  value={field.value}
                  onValueChange={(value) => value && field.onChange(value)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {MODE_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {t(item.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {t(
                    'Jailbreak and adult content are logged for review, not blocked. Hard illegal content is still blocked.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='content_safety.uncensored_models'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Uncensored model matchers')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder='*uncensored*'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'One matcher per line. Supports * ? globs or substrings, matched against the requested model name.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='content_safety.uncensored_groups'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Uncensored group matchers')}</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder='nsfw' {...field} />
                </FormControl>
                <FormDescription>
                  {t(
                    'Optional. One matcher per line, applied to the request group.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='content_safety.jailbreak_scan_enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Scan for jailbreak prompts')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Detects instruction-override attempts on the latest user message.'
                    )}
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
            name='content_safety.redline_words'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Extra hard-block keywords')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={6}
                    placeholder={t('Enter one keyword per line')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Always blocked on every model, including uncensored. Built-in illegal-content markers still apply even if this list is empty.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='content_safety.scan_output'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Scan model output')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Asynchronously review assistant replies after the response is sent. Needed to see what uncensored models produced.'
                    )}
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
            name='content_safety.auto_disable_user'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Disable user on hard block')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Automatically disable the account after a hard-block finding. Admins are never auto-disabled.'
                    )}
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
            name='content_safety.guard_enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable Guard model')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Optional semantic classifier via an OpenAI-compatible /v1/chat/completions endpoint (for example Qwen3Guard).'
                    )}
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
            name='content_safety.guard_base_url'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Guard base URL')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder='http://127.0.0.1:11434'
                    autoComplete='off'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'OpenAI-compatible base URL. /v1/chat/completions is appended automatically.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='content_safety.guard_model'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Guard model')}</FormLabel>
                <FormControl>
                  <Input placeholder='qwen3guard' autoComplete='off' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='content_safety.guard_api_key'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Guard API key')}</FormLabel>
                <FormControl>
                  <Input
                    type='password'
                    placeholder={t('Leave blank to keep the current key')}
                    autoComplete='new-password'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='content_safety.guard_timeout_ms'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Guard timeout (ms)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={0}
                    {...safeNumberFieldProps(field)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='content_safety.guard_fail_open'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Fail open if Guard is unavailable')}</FormLabel>
                  <FormDescription>
                    {t(
                      'When on, a Guard timeout or error will not block the request. Hard-block keywords still apply.'
                    )}
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
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
