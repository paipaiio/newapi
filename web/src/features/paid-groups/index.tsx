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

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { getSystemOptions } from '@/features/system-settings/api'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'

/** Parse an option value as a JSON object, returning its keys. */
function jsonKeys(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.keys(parsed as Record<string, unknown>)
    }
  } catch {
    // ignore malformed JSON, treat as no groups
  }
  return []
}

/** Parse the PaidGroups option (JSON array of group names). */
function jsonArray(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    // ignore malformed JSON
  }
  return []
}

/**
 * Visual paid-group management: one switch per defined group instead of a raw
 * JSON textarea. Group names come from the union of GroupRatio and
 * UserUsableGroups keys, mirroring how the rest of the admin UI enumerates
 * groups.
 */
export function PaidGroupsPage() {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const { data, isLoading } = useQuery({
    queryKey: ['system-options'],
    queryFn: getSystemOptions,
  })

  const [paid, setPaid] = useState<Set<string> | null>(null)
  const savedRef = useRef<Set<string> | null>(null)

  const groupNames = useMemo(() => {
    const options = data?.success ? (data.data ?? []) : []
    const map = new Map(options.map((o) => [o.key, o.value]))
    const names = new Set<string>([
      ...jsonKeys(map.get('GroupRatio')),
      ...jsonKeys(map.get('UserUsableGroups')),
    ])
    names.delete('auto')
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [data])

  // Initialize editing state once options arrive; later refetches must not
  // clobber in-progress edits.
  useEffect(() => {
    if (!data?.success || paid) return
    const options = data.data ?? []
    const raw = options.find((o) => o.key === 'PaidGroups')?.value
    const initial = new Set(jsonArray(raw))
    setPaid(initial)
    savedRef.current = new Set(initial)
  }, [data, paid])

  const isDirty = useMemo(() => {
    if (!paid || !savedRef.current) return false
    if (paid.size !== savedRef.current.size) return true
    for (const name of paid) {
      if (!savedRef.current.has(name)) return true
    }
    return false
  }, [paid])

  const handleSave = async () => {
    if (!paid || !savedRef.current) return
    const selected = [...paid].sort((a, b) => a.localeCompare(b))
    await updateOption.mutateAsync({
      key: 'PaidGroups',
      value: JSON.stringify(selected),
    })
    savedRef.current = new Set(selected)
  }

  if (isLoading || !paid) {
    return (
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Paid groups')}</SectionPageLayout.Title>
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
      <SectionPageLayout.Title>{t('Paid groups')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-6'>
          <div className='flex items-center justify-between gap-4'>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Toggle the groups that require any successful top-up before use. Free users (users without a successful top-up) still see these groups marked as paid, but API requests using them are rejected until the user completes any top-up. Admins are exempt.'
              )}
            </p>
            <Button
              size='sm'
              onClick={handleSave}
              disabled={updateOption.isPending || !isDirty}
            >
              {updateOption.isPending ? t('Saving...') : t('Save')}
            </Button>
          </div>

          {groupNames.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('No groups defined yet.')}
            </p>
          ) : (
            <div className='divide-border rounded-lg border divide-y'>
              {groupNames.map((name) => (
                <div
                  key={name}
                  className='flex items-center justify-between gap-4 px-4 py-3'
                >
                  <div className='flex min-w-0 items-center gap-2'>
                    <Label className='truncate font-medium'>{name}</Label>
                    {paid.has(name) && (
                      <Badge variant='secondary'>{t('Paid')}</Badge>
                    )}
                  </div>
                  <Switch
                    checked={paid.has(name)}
                    onCheckedChange={(checked) =>
                      setPaid((prev) => {
                        const next = new Set(prev ?? [])
                        if (checked) {
                          next.add(name)
                        } else {
                          next.delete(name)
                        }
                        return next
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
