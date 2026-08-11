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
import { Copy, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import {
  type CreateClientResult,
  deleteOAuthClient,
  getAllOAuthClients,
  getProviderEnabled,
  rotateOAuthClientSecret,
  setProviderEnabled,
  updateOAuthClient,
} from './api'
import { ClientFormDialog } from './components/client-form-dialog'
import { CredentialDialog } from './components/credential-dialog'
import type { OAuthClient, OAuthClientInput } from './types'

function toInput(client: OAuthClient): OAuthClientInput {
  return {
    id: client.id,
    name: client.name,
    logo: client.logo,
    redirect_uris: client.redirect_uris,
    scopes: client.scopes ? client.scopes.split(/\s+/).filter(Boolean) : [],
    is_public: client.is_public,
    auto_approve: client.auto_approve,
    enabled: client.enabled,
  }
}

function toPayload(client: OAuthClient, enabled: boolean) {
  return {
    name: client.name,
    logo: client.logo,
    redirect_uris: client.redirect_uris
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    scopes: client.scopes ? client.scopes.split(/\s+/).filter(Boolean) : [],
    is_public: client.is_public,
    auto_approve: client.auto_approve,
    enabled,
  }
}

function EndpointsCard() {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard({ notify: false })
  const origin = window.location.origin
  const endpoints = [
    {
      label: t('Discovery (Issuer)'),
      value: `${origin}/.well-known/openid-configuration`,
    },
    { label: t('Authorization endpoint'), value: `${origin}/oauth2/authorize` },
    { label: t('Token endpoint'), value: `${origin}/oauth2/token` },
    { label: t('Userinfo endpoint'), value: `${origin}/oauth2/userinfo` },
    { label: 'JWKS', value: `${origin}/.well-known/jwks.json` },
  ]
  return (
    <div className='mt-4 rounded-lg border p-4'>
      <div className='mb-2 font-medium'>{t('OIDC endpoints')}</div>
      <div className='space-y-1.5'>
        {endpoints.map((e) => (
          <div key={e.label} className='flex items-center gap-2 text-sm'>
            <span className='text-muted-foreground w-40 shrink-0'>
              {e.label}
            </span>
            <code className='flex-1 overflow-x-auto text-xs break-all'>
              {e.value}
            </code>
            <Button
              variant='ghost'
              size='icon'
              className='size-6 shrink-0'
              onClick={() => {
                copyToClipboard(e.value)
                toast.success(t('Copied'))
              }}
            >
              <Copy className='size-3.5' />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

type PendingAction =
  | { type: 'delete'; client: OAuthClient }
  | { type: 'rotate'; client: OAuthClient }
  | null

function OAuthAppsContent() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<OAuthClientInput | null>(null)
  const [credOpen, setCredOpen] = useState(false)
  const [cred, setCred] = useState({ client_id: '', client_secret: '' })
  const [action, setAction] = useState<PendingAction>(null)
  const [busy, setBusy] = useState(false)

  const { data: clients = [] } = useQuery({
    queryKey: ['oauth-clients'],
    queryFn: async () => {
      const res = await getAllOAuthClients()
      return res.success ? res.data || [] : []
    },
  })

  const { data: providerEnabled = false } = useQuery({
    queryKey: ['oauth-provider-enabled'],
    queryFn: getProviderEnabled,
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['oauth-clients'] })

  const showCredentials = (result: CreateClientResult) => {
    setCred({
      client_id: result.client?.client_id || '',
      client_secret: result.client_secret,
    })
    setCredOpen(true)
  }

  const handleToggleProvider = async (checked: boolean) => {
    const res = await setProviderEnabled(checked)
    if (res.success) {
      toast.success(t('Updated'))
      queryClient.invalidateQueries({ queryKey: ['oauth-provider-enabled'] })
    } else {
      toast.error(res.message || t('Operation failed'))
    }
  }

  const handleToggleClient = async (client: OAuthClient) => {
    const res = await updateOAuthClient(
      client.id,
      toPayload(client, !client.enabled)
    )
    if (res.success) {
      toast.success(t('Updated'))
      refresh()
    } else {
      toast.error(res.message || t('Operation failed'))
    }
  }

  const handleConfirmAction = async () => {
    if (!action) return
    setBusy(true)
    try {
      if (action.type === 'delete') {
        const res = await deleteOAuthClient(action.client.id)
        if (res.success) {
          toast.success(t('Deleted'))
          setAction(null)
          refresh()
        } else {
          toast.error(res.message || t('Delete failed'))
        }
      } else {
        const res = await rotateOAuthClientSecret(action.client.id)
        if (res.success && res.data) {
          setAction(null)
          showCredentials({
            client: action.client,
            client_secret: res.data.client_secret,
          })
        } else {
          toast.error(res.message || t('Operation failed'))
        }
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='mx-auto max-w-[1100px]'>
      <p className='text-muted-foreground mb-4 text-sm'>
        {t(
          'Let third-party sites/apps sign in with this site via “Login with” (OpenID Connect identity provider).'
        )}
      </p>

      <div className='flex items-center justify-between rounded-lg border p-4'>
        <div>
          <div className='font-medium'>{t('Enable OAuth login service')}</div>
          <div className='text-muted-foreground text-sm'>
            {t('Master switch for the identity provider.')}
          </div>
        </div>
        <Switch
          checked={providerEnabled}
          onCheckedChange={handleToggleProvider}
        />
      </div>

      <EndpointsCard />

      <div className='mt-4 flex items-center justify-between'>
        <span className='font-medium'>{t('Applications')}</span>
        <Button
          size='sm'
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus data-icon='inline-start' />
          {t('Add application')}
        </Button>
      </div>

      <div className='mt-2 rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Application')}</TableHead>
              <TableHead>{t('Redirect URIs')}</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead className='w-20'>{t('Status')}</TableHead>
              <TableHead className='w-32 text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className='text-muted-foreground py-8 text-center'
                >
                  {t('No applications yet')}
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium'>{client.name}</span>
                      {client.is_public && (
                        <Badge variant='outline' className='text-[10px]'>
                          PKCE
                        </Badge>
                      )}
                      {client.auto_approve && (
                        <Badge
                          variant='outline'
                          className='border-emerald-500/40 text-[10px] text-emerald-600 dark:text-emerald-300'
                        >
                          {t('No consent')}
                        </Badge>
                      )}
                    </div>
                    <code className='text-muted-foreground text-xs'>
                      {client.client_id}
                    </code>
                  </TableCell>
                  <TableCell className='text-muted-foreground max-w-[220px] text-xs whitespace-pre-line'>
                    {client.redirect_uris}
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      {(client.scopes ? client.scopes.split(/\s+/) : [])
                        .filter(Boolean)
                        .map((s) => (
                          <Badge
                            key={s}
                            variant='secondary'
                            className='text-[10px]'
                          >
                            {s}
                          </Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={client.enabled}
                      onCheckedChange={() => handleToggleClient(client)}
                    />
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => {
                          setEditing(toInput(client))
                          setFormOpen(true)
                        }}
                      >
                        <Pencil className='size-4' />
                      </Button>
                      {!client.is_public && (
                        <Button
                          variant='ghost'
                          size='icon'
                          onClick={() => setAction({ type: 'rotate', client })}
                          title={t('Rotate secret')}
                        >
                          <KeyRound className='size-4' />
                        </Button>
                      )}
                      <Button
                        variant='ghost'
                        size='icon'
                        className='text-destructive'
                        onClick={() => setAction({ type: 'delete', client })}
                      >
                        <Trash2 className='size-4' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editing}
        onSaved={refresh}
        onCredentials={showCredentials}
      />

      <CredentialDialog
        open={credOpen}
        onOpenChange={setCredOpen}
        clientId={cred.client_id}
        clientSecret={cred.client_secret}
      />

      <ConfirmDialog
        open={!!action}
        onOpenChange={(open) => !open && setAction(null)}
        title={
          action?.type === 'delete'
            ? t('Delete application')
            : t('Rotate secret')
        }
        desc={
          action?.type === 'delete'
            ? t('Delete application "{{name}}"? This cannot be undone.', {
                name: action?.client.name ?? '',
              })
            : t(
                'Generate a new secret for "{{name}}"? The old secret is invalidated immediately.',
                { name: action?.client.name ?? '' }
              )
        }
        confirmText={
          action?.type === 'delete' ? t('Delete') : t('Rotate secret')
        }
        destructive={action?.type === 'delete'}
        isLoading={busy}
        handleConfirm={handleConfirmAction}
      />
    </div>
  )
}

export function OAuthApps() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('OAuth Applications')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <OAuthAppsContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
