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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  deleteOtherService,
  getAllOtherServices,
  updateOtherService,
} from './api'
import { ServiceFormDialog } from './components/service-form-dialog'
import type { OtherService, OtherServiceInput } from './types'

function isImageUrl(icon: string): boolean {
  return (
    typeof icon === 'string' &&
    (icon.startsWith('http://') ||
      icon.startsWith('https://') ||
      icon.startsWith('/'))
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={5} className='text-muted-foreground py-8 text-center'>
        {children}
      </TableCell>
    </TableRow>
  )
}

interface ServiceRowProps {
  service: OtherService
  onEdit: (service: OtherService) => void
  onDelete: (service: OtherService) => void
  onToggle: (service: OtherService) => void
}

function ServiceRow({ service, onEdit, onDelete, onToggle }: ServiceRowProps) {
  return (
    <TableRow>
      <TableCell className='text-muted-foreground'>
        {service.sort_order}
      </TableCell>
      <TableCell>
        <div className='flex items-center gap-3'>
          {isImageUrl(service.icon) ? (
            <img
              src={service.icon}
              alt={service.name}
              className='size-8 rounded-lg object-cover'
            />
          ) : (
            <div className='bg-muted flex size-8 items-center justify-center rounded-lg text-lg'>
              {service.icon || '🔗'}
            </div>
          )}
          <div className='min-w-0'>
            <div className='truncate font-medium'>{service.name}</div>
            <a
              href={service.url}
              target='_blank'
              rel='noopener noreferrer'
              className='text-muted-foreground block max-w-[280px] truncate text-xs hover:underline'
              onClick={(e) => e.stopPropagation()}
            >
              {service.url}
            </a>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {service.category ? (
          <Badge variant='secondary' className='rounded-full'>
            {service.category}
          </Badge>
        ) : (
          <span className='text-muted-foreground'>—</span>
        )}
      </TableCell>
      <TableCell>
        <Switch
          checked={service.enabled}
          onCheckedChange={() => onToggle(service)}
        />
      </TableCell>
      <TableCell className='text-right'>
        <div className='flex justify-end gap-1'>
          <Button variant='ghost' size='icon' onClick={() => onEdit(service)}>
            <Pencil className='size-4' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className='text-destructive'
            onClick={() => onDelete(service)}
          >
            <Trash2 className='size-4' />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function ServiceManagementContent() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<OtherServiceInput | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OtherService | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['other-services-all'],
    queryFn: async () => {
      const res = await getAllOtherServices()
      return res.success ? res.data || [] : []
    },
  })

  const services = data || []

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['other-services-all'] })

  const handleToggle = async (service: OtherService) => {
    const res = await updateOtherService({
      ...service,
      enabled: !service.enabled,
    })
    if (res.success) {
      toast.success(t('Updated'))
      refresh()
      queryClient.invalidateQueries({ queryKey: ['other-services'] })
    } else {
      toast.error(res.message || t('Operation failed'))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await deleteOtherService(deleteTarget.id)
      if (res.success) {
        toast.success(t('Deleted'))
        setDeleteTarget(null)
        refresh()
      } else {
        toast.error(res.message || t('Delete failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setDeleting(false)
    }
  }

  const openEdit = (service: OtherService) => {
    setEditing(service)
    setFormOpen(true)
  }

  let bodyRows: React.ReactNode
  if (isLoading) {
    bodyRows = <EmptyRow>{t('Loading...')}</EmptyRow>
  } else if (services.length === 0) {
    bodyRows = (
      <EmptyRow>
        {t('No services yet. Click "Add service" in the top right.')}
      </EmptyRow>
    )
  } else {
    bodyRows = services.map((service) => (
      <ServiceRow
        key={service.id}
        service={service}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        onToggle={handleToggle}
      />
    ))
  }

  return (
    <div className='mx-auto max-w-[1100px]'>
      <div className='mb-4 flex items-center justify-between'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Manage the service entries shown on the Other Services page. All signed-in users can see enabled services.'
          )}
        </p>
        <Button
          size='sm'
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus data-icon='inline-start' />
          {t('Add service')}
        </Button>
      </div>

      <div className='rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-16'>{t('Sort')}</TableHead>
              <TableHead>{t('Service')}</TableHead>
              <TableHead className='w-28'>{t('Category')}</TableHead>
              <TableHead className='w-24'>{t('Status')}</TableHead>
              <TableHead className='w-28 text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{bodyRows}</TableBody>
        </Table>
      </div>

      <ServiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        service={editing}
        onSaved={() => {
          refresh()
          queryClient.invalidateQueries({ queryKey: ['other-services'] })
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('Delete service')}
        desc={t(
          'Are you sure you want to delete "{{name}}"? This cannot be undone.',
          {
            name: deleteTarget?.name ?? '',
          }
        )}
        confirmText={t('Delete')}
        destructive
        isLoading={deleting}
        handleConfirm={handleDelete}
      />
    </div>
  )
}

export function ServiceManagement() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Service Management')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <ServiceManagementContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
