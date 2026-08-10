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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { createOtherService, updateOtherService } from '../api'
import { EMPTY_SERVICE, type OtherServiceInput } from '../types'

interface ServiceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: OtherServiceInput | null
  onSaved: () => void
}

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  onSaved,
}: ServiceFormDialogProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<OtherServiceInput>(EMPTY_SERVICE)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(service ? { ...service } : { ...EMPTY_SERVICE })
  }, [open, service])

  const isEdit = !!form.id

  const update = (patch: Partial<OtherServiceInput>) =>
    setForm((prev) => ({ ...prev, ...patch }))

  const handleSave = async () => {
    const name = form.name.trim()
    const url = form.url.trim()
    if (!name) {
      toast.error(t('Service name is required'))
      return
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast.error(t('Service URL must start with http:// or https://'))
      return
    }
    const payload: OtherServiceInput = {
      ...form,
      name,
      url,
      icon: form.icon.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      sort_order: Number(form.sort_order) || 0,
    }
    setSaving(true)
    try {
      const res = isEdit
        ? await updateOtherService(payload)
        : await createOtherService(payload)
      if (res.success) {
        toast.success(t('Saved successfully'))
        onOpenChange(false)
        onSaved()
      } else {
        toast.error(res.message || t('Save failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t('Edit service') : t('Add service')}
      contentClassName='sm:max-w-lg'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <div className='flex justify-end gap-2'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {t('Save')}
          </Button>
        </div>
      }
    >
      <div className='space-y-1.5'>
        <Label>{t('Service name')}</Label>
        <Input
          value={form.name}
          placeholder={t('e.g. Monitoring dashboard')}
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>
      <div className='space-y-1.5'>
        <Label>{t('Service URL')}</Label>
        <Input
          value={form.url}
          placeholder='https://example.com'
          onChange={(e) => update({ url: e.target.value })}
        />
      </div>
      <div className='space-y-1.5'>
        <Label>{t('Description')}</Label>
        <Textarea
          value={form.description}
          placeholder={t('Short description of this service (optional)')}
          maxLength={512}
          onChange={(e) => update({ description: e.target.value })}
        />
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <div className='space-y-1.5'>
          <Label>{t('Icon')}</Label>
          <Input
            value={form.icon}
            placeholder={t('Emoji or image URL')}
            onChange={(e) => update({ icon: e.target.value })}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>{t('Category')}</Label>
          <Input
            value={form.category}
            placeholder={t('For grouping, optional')}
            onChange={(e) => update({ category: e.target.value })}
          />
        </div>
      </div>
      <div className='space-y-1.5'>
        <Label>{t('Sort order')}</Label>
        <Input
          type='number'
          min={0}
          value={String(form.sort_order)}
          onChange={(e) => update({ sort_order: Number(e.target.value) })}
        />
      </div>
      <div className='flex items-center gap-8 pt-1'>
        <div className='flex items-center gap-2'>
          <Switch
            checked={form.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
          <Label>{t('Enabled')}</Label>
        </div>
        <div className='flex items-center gap-2'>
          <Switch
            checked={form.open_in_new_tab}
            onCheckedChange={(v) => update({ open_in_new_tab: v })}
          />
          <Label>{t('Open in new tab')}</Label>
        </div>
      </div>
    </Dialog>
  )
}
