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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { getSystemOptions } from '@/features/system-settings/api'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import { GroupRatioVisualEditor } from '@/features/system-settings/models/group-ratio-visual-editor'
import type { GroupSettingsSection } from '@/features/system-settings/models/group-ratio-visual-editor'
import { normalizeJsonString } from '@/features/system-settings/models/utils'

/** API key for the special usable-group rules (differs from the form field name). */
const SPECIAL_USABLE_API_KEY = 'group_ratio_setting.group_special_usable_group'

type GroupOptionValues = {
  GroupRatio: string
  TopupGroupRatio: string
  UserUsableGroups: string
  GroupGroupRatio: string
  AutoGroups: string
  GroupSpecialUsableGroup: string
  DefaultUseAutoGroup: boolean
}

const JSON_FIELD_KEYS = [
  'GroupRatio',
  'TopupGroupRatio',
  'UserUsableGroups',
  'GroupGroupRatio',
  'AutoGroups',
  'GroupSpecialUsableGroup',
] as const

function extractValues(
  options: { key: string; value: string }[]
): GroupOptionValues {
  const map = new Map(options.map((o) => [o.key, o.value]))
  const get = (key: string) => map.get(key) ?? ''
  return {
    GroupRatio: get('GroupRatio'),
    TopupGroupRatio: get('TopupGroupRatio'),
    UserUsableGroups: get('UserUsableGroups'),
    GroupGroupRatio: get('GroupGroupRatio'),
    AutoGroups: get('AutoGroups'),
    GroupSpecialUsableGroup: get(SPECIAL_USABLE_API_KEY),
    DefaultUseAutoGroup: get('DefaultUseAutoGroup') === 'true',
  }
}

function normalizeValues(values: GroupOptionValues): GroupOptionValues {
  return {
    ...values,
    GroupRatio: normalizeJsonString(values.GroupRatio),
    TopupGroupRatio: normalizeJsonString(values.TopupGroupRatio),
    UserUsableGroups: normalizeJsonString(values.UserUsableGroups),
    GroupGroupRatio: normalizeJsonString(values.GroupGroupRatio),
    AutoGroups: normalizeJsonString(values.AutoGroups),
    GroupSpecialUsableGroup: normalizeJsonString(
      values.GroupSpecialUsableGroup
    ),
  }
}

/**
 * Editor for all option-backed group settings. Reuses the visual editor from
 * system-settings with its own data loading / save flow so the page works
 * outside the SettingsPage form context.
 */
export function GroupOptionsEditor() {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const { data, isLoading } = useQuery({
    queryKey: ['system-options'],
    queryFn: getSystemOptions,
  })

  const [values, setValues] = useState<GroupOptionValues | null>(null)
  const [section, setSection] = useState<GroupSettingsSection>('pricing')
  const savedRef = useRef<GroupOptionValues | null>(null)

  // Initialize editing state once options arrive; later refetches must not
  // clobber in-progress edits.
  useEffect(() => {
    if (!data?.success || values) return
    const extracted = extractValues(data.data ?? [])
    setValues(extracted)
    savedRef.current = normalizeValues(extracted)
  }, [data, values])

  const isDirty = useMemo(() => {
    if (!values || !savedRef.current) return false
    const normalized = normalizeValues(values)
    return JSON.stringify(normalized) !== JSON.stringify(savedRef.current)
  }, [values])

  const handleChange = (field: string, value: string) => {
    setValues((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleSave = async () => {
    if (!values || !savedRef.current) return

    // Guard against invalid JSON before touching the backend.
    for (const key of JSON_FIELD_KEYS) {
      const raw = values[key].trim()
      if (!raw) continue
      try {
        JSON.parse(raw)
      } catch {
        toast.error(t('Invalid JSON in {{field}}', { field: key }))
        return
      }
    }

    const normalized = normalizeValues(values)
    const dirtyKeys = (
      Object.keys(normalized) as Array<keyof GroupOptionValues>
    ).filter((key) => normalized[key] !== savedRef.current?.[key])

    if (dirtyKeys.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const key of dirtyKeys) {
      const apiKey =
        key === 'GroupSpecialUsableGroup' ? SPECIAL_USABLE_API_KEY : key
      await updateOption.mutateAsync({ key: apiKey, value: normalized[key] })
    }
    savedRef.current = normalized
  }

  if (isLoading || !values) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-64 w-full' />
        <Skeleton className='h-40 w-full' />
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between gap-4'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Groups are defined by their billing ratio. Configure ratios, top-up ratios, selectable groups and auto assignment here.'
          )}
        </p>
        <Button
          size='sm'
          onClick={handleSave}
          disabled={updateOption.isPending || !isDirty}
        >
          {updateOption.isPending ? t('Saving...') : t('Save group ratios')}
        </Button>
      </div>

      <GroupRatioVisualEditor
        section={section}
        onSectionChange={setSection}
        defaultUseAutoGroupField={
          <div className='flex items-center justify-between gap-4 rounded-lg border p-4'>
            <div className='space-y-1'>
              <Label htmlFor='default-use-auto-group'>
                {t('Default to auto groups')}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'When enabled, newly created tokens start in the first auto group.'
                )}
              </p>
            </div>
            <Switch
              id='default-use-auto-group'
              checked={values.DefaultUseAutoGroup}
              onCheckedChange={(checked) =>
                setValues((prev) =>
                  prev ? { ...prev, DefaultUseAutoGroup: checked } : prev
                )
              }
            />
          </div>
        }
        groupRatio={values.GroupRatio}
        topupGroupRatio={values.TopupGroupRatio}
        userUsableGroups={values.UserUsableGroups}
        groupGroupRatio={values.GroupGroupRatio}
        autoGroups={values.AutoGroups}
        groupSpecialUsableGroup={values.GroupSpecialUsableGroup}
        onChange={handleChange}
      />
    </div>
  )
}
