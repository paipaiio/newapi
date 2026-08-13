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
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

const USER_GROUP_DEFAULT_API_KEY =
  'group_ratio_setting.user_group_default_group'

type Row = {
  _id: string
  userGroup: string
  defaultModelGroup: string
}

let rowSeq = 0
function nextRowId() {
  rowSeq += 1
  return `row-${rowSeq}`
}

function parseRows(raw: string): Row[] {
  const map = safeJsonParse<Record<string, string>>(raw, {
    fallback: {},
    silent: true,
  })
  return Object.entries(map).map(([userGroup, defaultModelGroup]) => ({
    _id: nextRowId(),
    userGroup,
    defaultModelGroup: String(defaultModelGroup ?? ''),
  }))
}

/** 丢弃空行，后端以「有无条目」判定纯用户分组，空值等同于未配置。 */
function serializeRows(rows: Row[]): string {
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
 * 「用户分组」管理页。
 *
 * 这里配置的是纯用户分组：分组名只作为用户身份标签存在，本身没有渠道。列在这里的
 * 分组不会再出现在用户的可选模型分组里，未指定分组的令牌按这里配的默认模型分组路由。
 * 没列在这里的分组保持原有行为（分组名同时充当用户组与模型组）。
 *
 * 「该用户分组能选哪些模型分组」在分组管理页的特殊可用分组规则里配。
 */
export function UserGroups() {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const { data, isLoading } = useQuery({
    queryKey: ['system-options'],
    queryFn: getSystemOptions,
  })

  const [rows, setRows] = useState<Row[] | null>(null)
  const savedRef = useRef<string>('{}')

  useEffect(() => {
    if (!data?.success || rows) return
    const map = new Map((data.data ?? []).map((o) => [o.key, o.value]))
    const raw = map.get(USER_GROUP_DEFAULT_API_KEY) ?? '{}'
    setRows(parseRows(raw))
    savedRef.current = serializeRows(parseRows(raw))
  }, [data, rows])

  // 已知的模型分组名，取自倍率表/可选分组表，与分组管理页保持同一来源。
  const modelGroupOptions = useMemo(() => {
    const map = new Map((data?.data ?? []).map((o) => [o.key, o.value]))
    const parse = (key: string) =>
      safeJsonParse<Record<string, unknown>>(map.get(key) ?? '', {
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
  }, [data])

  const serialized = rows ? serializeRows(rows) : '{}'
  const isDirty = serialized !== savedRef.current

  const updateRow = (id: string, field: keyof Row, value: string) => {
    setRows((prev) =>
      prev
        ? prev.map((r) => (r._id === id ? { ...r, [field]: value } : r))
        : prev
    )
  }

  const handleSave = async () => {
    if (!rows) return
    const names = rows.map((r) => r.userGroup.trim()).filter(Boolean)
    if (new Set(names).size !== names.length) {
      toast.error(t('Duplicate user group'))
      return
    }
    await updateOption.mutateAsync({
      key: USER_GROUP_DEFAULT_API_KEY,
      value: serialized,
    })
    savedRef.current = serialized
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
                  'A group listed here is only an identity label and has no channels of its own: it stops being offered as a selectable model group, and tokens that pick no group route to the default model group set here. Groups not listed keep the existing behaviour. Which model groups each user group may pick is configured under Group Management.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                {rows.length === 0 ? (
                  <p className='text-muted-foreground py-6 text-center text-sm'>
                    {t('No user groups yet. Add one to get started.')}
                  </p>
                ) : (
                  <>
                    <div className='text-muted-foreground flex items-center gap-2 px-1 text-xs'>
                      <span className='flex-1'>{t('User group')}</span>
                      <span className='flex-1'>{t('Default model group')}</span>
                      <span className='w-8' />
                    </div>
                    {rows.map((row) => (
                      <div key={row._id} className='flex items-center gap-2'>
                        <Input
                          className='flex-1'
                          value={row.userGroup}
                          placeholder={t('e.g. reseller')}
                          onChange={(e) =>
                            updateRow(row._id, 'userGroup', e.target.value)
                          }
                        />
                        <div className='flex flex-1 items-center gap-2'>
                          <Select
                            value={row.defaultModelGroup || null}
                            onValueChange={(v) =>
                              typeof v === 'string' &&
                              v !== '' &&
                              updateRow(row._id, 'defaultModelGroup', v)
                            }
                          >
                            <SelectTrigger className='flex-1'>
                              <SelectValue placeholder={t('Select a group')} />
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                              <SelectGroup>
                                {(row.defaultModelGroup &&
                                !modelGroupOptions.includes(
                                  row.defaultModelGroup
                                )
                                  ? [row.defaultModelGroup, ...modelGroupOptions]
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
                        <Button
                          variant='ghost'
                          size='sm'
                          className='text-destructive h-8 w-8 shrink-0 p-0'
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
                    ))}
                  </>
                )}

                <div className='pt-2'>
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
