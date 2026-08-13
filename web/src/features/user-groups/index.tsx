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
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { getSystemOptions } from '@/features/system-settings/api'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import { safeJsonParse } from '@/features/system-settings/utils/json-parser'

const DEFAULT_GROUP_KEY = 'group_ratio_setting.user_group_default_group'
const SPECIAL_USABLE_KEY = 'group_ratio_setting.group_special_usable_group'

/** `GroupSpecialUsableGroup` 的条目键支持 `+:` / `-:` 前缀（高级规则）。
 *  本页只管无前缀条目，带前缀的原样保留，交给分组管理页的规则编辑器。 */
type SpecialUsableMap = Record<string, Record<string, string>>

type Row = {
  _id: string
  userGroup: string
  defaultModelGroup: string
  usableGroups: string[]
}

let rowSeq = 0
function nextRowId() {
  rowSeq += 1
  return `row-${rowSeq}`
}

function hasPrefix(key: string) {
  return key.startsWith('+:') || key.startsWith('-:')
}

function buildRows(defaultRaw: string, specialRaw: string): Row[] {
  const defaults = safeJsonParse<Record<string, string>>(defaultRaw, {
    fallback: {},
    silent: true,
  })
  const special = safeJsonParse<SpecialUsableMap>(specialRaw, {
    fallback: {},
    silent: true,
  })
  return Object.entries(defaults).map(([userGroup, defaultModelGroup]) => ({
    _id: nextRowId(),
    userGroup,
    defaultModelGroup: String(defaultModelGroup ?? ''),
    usableGroups: Object.keys(special[userGroup] ?? {}).filter(
      (key) => !hasPrefix(key)
    ),
  }))
}

function serializeDefaults(rows: Row[]): string {
  const map: Record<string, string> = {}
  for (const row of rows) {
    const name = row.userGroup.trim()
    const target = row.defaultModelGroup.trim()
    if (!name || !target) continue
    map[name] = target
  }
  return Object.keys(map).length === 0 ? '{}' : JSON.stringify(map, null, 2)
}

/**
 * 只重建本页管理的用户分组的无前缀条目；这些分组的 `+:`/`-:` 高级规则、以及本页
 * 未列出的其他用户分组，全部原样保留，避免两个编辑入口互相覆盖。
 */
function serializeSpecialUsable(rows: Row[], original: string): string {
  const existing = safeJsonParse<SpecialUsableMap>(original, {
    fallback: {},
    silent: true,
  })
  const next: SpecialUsableMap = { ...existing }

  for (const row of rows) {
    const name = row.userGroup.trim()
    if (!name) continue
    const prev = existing[name] ?? {}
    const merged: Record<string, string> = {}
    // 保留高级规则
    for (const [key, desc] of Object.entries(prev)) {
      if (hasPrefix(key)) merged[key] = desc
    }
    // 重建无前缀条目（沿用原描述，没有则留空）
    for (const group of row.usableGroups) {
      merged[group] = prev[group] ?? ''
    }
    if (Object.keys(merged).length === 0) {
      delete next[name]
    } else {
      next[name] = merged
    }
  }

  return Object.keys(next).length === 0 ? '{}' : JSON.stringify(next, null, 2)
}

/**
 * 「用户分组」管理页。
 *
 * 这里配置的是纯用户分组：分组名只作为用户身份标签存在，本身没有渠道。列在这里的
 * 分组走白名单模式——不继承全局公开可选分组，只能选这里勾的那几个；未指定分组的
 * 令牌路由到这里配的默认模型分组。没列在这里的分组保持原有行为。
 */
export function UserGroups() {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const { data, isLoading } = useQuery({
    queryKey: ['system-options'],
    queryFn: getSystemOptions,
  })

  const [rows, setRows] = useState<Row[] | null>(null)
  const originalSpecialRef = useRef<string>('{}')
  const savedRef = useRef<{ defaults: string; special: string }>({
    defaults: '{}',
    special: '{}',
  })

  const optionMap = useMemo(
    () => new Map((data?.data ?? []).map((o) => [o.key, o.value])),
    [data]
  )

  useEffect(() => {
    if (!data?.success || rows) return
    const defaultRaw = optionMap.get(DEFAULT_GROUP_KEY) ?? '{}'
    const specialRaw = optionMap.get(SPECIAL_USABLE_KEY) ?? '{}'
    const built = buildRows(defaultRaw, specialRaw)
    originalSpecialRef.current = specialRaw
    setRows(built)
    savedRef.current = {
      defaults: serializeDefaults(built),
      special: serializeSpecialUsable(built, specialRaw),
    }
  }, [data, rows, optionMap])

  // 已知模型分组名，与分组管理页取同一来源。
  const modelGroupOptions = useMemo(() => {
    const parse = (key: string) =>
      safeJsonParse<Record<string, unknown>>(optionMap.get(key) ?? '', {
        fallback: {},
        silent: true,
      })
    return [
      ...new Set([
        ...Object.keys(parse('GroupRatio')),
        ...Object.keys(parse('UserUsableGroups')),
        ...Object.keys(parse('TopupGroupRatio')),
      ]),
    ]
  }, [optionMap])

  const selectOptions = useMemo(
    () => modelGroupOptions.map((name) => ({ label: name, value: name })),
    [modelGroupOptions]
  )

  const nextDefaults = rows ? serializeDefaults(rows) : '{}'
  const nextSpecial = rows
    ? serializeSpecialUsable(rows, originalSpecialRef.current)
    : '{}'
  const isDirty =
    nextDefaults !== savedRef.current.defaults ||
    nextSpecial !== savedRef.current.special

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((prev) =>
      prev ? prev.map((r) => (r._id === id ? { ...r, ...patch } : r)) : prev
    )
  }

  const handleSave = async () => {
    if (!rows) return
    const names = rows.map((r) => r.userGroup.trim()).filter(Boolean)
    if (new Set(names).size !== names.length) {
      toast.error(t('Duplicate user group'))
      return
    }
    if (nextDefaults !== savedRef.current.defaults) {
      await updateOption.mutateAsync({
        key: DEFAULT_GROUP_KEY,
        value: nextDefaults,
      })
    }
    if (nextSpecial !== savedRef.current.special) {
      await updateOption.mutateAsync({
        key: SPECIAL_USABLE_KEY,
        value: nextSpecial,
      })
    }
    originalSpecialRef.current = nextSpecial
    savedRef.current = { defaults: nextDefaults, special: nextSpecial }
  }

  if (isLoading || !rows) {
    return (
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('User Groups')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='space-y-4'>
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-64 w-full' />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('User Groups')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-4'>
          <div className='flex items-center justify-end'>
            <Button
              size='sm'
              onClick={handleSave}
              disabled={updateOption.isPending || !isDirty}
            >
              {updateOption.isPending ? t('Saving...') : t('Save')}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('Pure user groups')}</CardTitle>
              <CardDescription>
                {t(
                  'A group listed here is only an identity label and has no channels of its own. It uses whitelist mode: it does NOT inherit the globally selectable groups, and its users can only pick the model groups selected below. Tokens that pick no group route to the default model group, which is always usable. Groups not listed here keep the existing behaviour.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                {rows.length === 0 ? (
                  <p className='text-muted-foreground py-6 text-center text-sm'>
                    {t('No user groups yet. Add one to get started.')}
                  </p>
                ) : (
                  rows.map((row) => (
                    <div
                      key={row._id}
                      className='space-y-3 rounded-lg border p-3'
                    >
                      <div className='flex items-center gap-2'>
                        <div className='flex-1 space-y-1'>
                          <Label className='text-xs'>{t('User group')}</Label>
                          <Input
                            value={row.userGroup}
                            placeholder={t('e.g. reseller')}
                            onChange={(e) =>
                              updateRow(row._id, { userGroup: e.target.value })
                            }
                          />
                        </div>
                        <div className='flex-1 space-y-1'>
                          <Label className='text-xs'>
                            {t('Default model group')}
                          </Label>
                          <div className='flex items-center gap-2'>
                            <Select
                              value={row.defaultModelGroup || null}
                              onValueChange={(v) =>
                                typeof v === 'string' &&
                                v !== '' &&
                                updateRow(row._id, { defaultModelGroup: v })
                              }
                            >
                              <SelectTrigger className='flex-1'>
                                <SelectValue
                                  placeholder={t('Select a group')}
                                />
                              </SelectTrigger>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectGroup>
                                  {(row.defaultModelGroup &&
                                  !modelGroupOptions.includes(
                                    row.defaultModelGroup
                                  )
                                    ? [
                                        row.defaultModelGroup,
                                        ...modelGroupOptions,
                                      ]
                                    : modelGroupOptions
                                  ).map((name) => (
                                    <SelectItem key={name} value={name}>
                                      {name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            {row.defaultModelGroup &&
                              !modelGroupOptions.includes(
                                row.defaultModelGroup
                              ) && (
                                <AlertTriangle
                                  className='text-destructive h-4 w-4 shrink-0'
                                  aria-label={t('Not in pricing table')}
                                />
                              )}
                          </div>
                        </div>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='text-destructive mt-5 h-8 w-8 shrink-0 p-0'
                          onClick={() =>
                            setRows((prev) =>
                              prev
                                ? prev.filter((r) => r._id !== row._id)
                                : prev
                            )
                          }
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>

                      <div className='space-y-1'>
                        <Label className='text-xs'>
                          {t('Selectable model groups')}
                        </Label>
                        <MultiSelect
                          options={selectOptions}
                          selected={row.usableGroups}
                          onChange={(values) =>
                            updateRow(row._id, { usableGroups: values })
                          }
                          placeholder={t('Select model groups...')}
                        />
                        <p className='text-muted-foreground text-xs'>
                          {t(
                            'The default model group is always usable even if not selected here. Advanced +:/-: rules stay in Group Management and are preserved.'
                          )}
                        </p>
                      </div>
                    </div>
                  ))
                )}

                <div className='pt-1'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setRows((prev) => [
                        ...(prev ?? []),
                        {
                          _id: nextRowId(),
                          userGroup: '',
                          defaultModelGroup: '',
                          usableGroups: [],
                        },
                      ])
                    }
                  >
                    <Plus className='mr-2 h-4 w-4' />
                    {t('Add user group')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
