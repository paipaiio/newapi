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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatTimestampRelative, formatTimestampToDate } from '@/lib/format'

import {
  batchDisableUsers,
  clearInviteAbuseFlag,
  getFlaggedInviteAbuseUsers,
  getRelatedAccounts,
  type FlaggedUser,
  type RelatedAccount,
  type RequestIPRecord,
} from './api'

function IPList(props: {
  records: RequestIPRecord[]
  highlight?: Set<string>
}) {
  const { t } = useTranslation()
  if (props.records.length === 0) {
    return (
      <p className='text-muted-foreground text-xs'>
        {t('No recorded request IPs')}
      </p>
    )
  }
  return (
    <ul className='flex flex-col gap-1'>
      {props.records.map((r) => {
        const hit = props.highlight?.has(r.ip)
        const item = (
          <span className='flex items-center justify-between gap-3'>
            <span
              className={
                hit
                  ? 'text-warning font-mono text-xs font-medium'
                  : 'font-mono text-xs'
              }
            >
              {r.ip}
            </span>
            <span
              className='text-muted-foreground shrink-0 text-xs'
              title={formatTimestampToDate(r.last_seen)}
            >
              {formatTimestampRelative(r.last_seen)}
            </span>
          </span>
        )
        return (
          <li key={r.ip}>
            {hit ? (
              <Tooltip>
                <TooltipTrigger className='block w-full text-left'>
                  {item}
                </TooltipTrigger>
                <TooltipContent>
                  <p className='text-xs'>{t('Matches inviter')}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              item
            )}
          </li>
        )
      })}
    </ul>
  )
}

function RelatedAccounts(props: { user: FlaggedUser }) {
  const { t } = useTranslation()
  const { user } = props
  const [show, setShow] = useState(false)
  const [confirmBan, setConfirmBan] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invite-abuse-related', user.id],
    queryFn: () => getRelatedAccounts(user.id),
    enabled: show,
  })

  const banMutation = useMutation({
    mutationFn: (ids: number[]) => batchDisableUsers(ids),
    onSuccess: (ok) => {
      setConfirmBan(false)
      if (ok) {
        toast.success(t('Accounts banned'))
        queryClient.invalidateQueries({ queryKey: ['invite-abuse-flagged'] })
        queryClient.invalidateQueries({
          queryKey: ['invite-abuse-related', user.id],
        })
      } else {
        toast.error(t('Operation failed'))
      }
    },
    onError: () => {
      setConfirmBan(false)
      toast.error(t('Operation failed'))
    },
  })

  // 封禁目标：排除 root（role >= 100）与已封禁账号
  const banTargets = (data || []).filter((a) => a.role < 100 && a.status !== 2)

  // 与邀请人重合的请求 IP 高亮
  const inviter = data?.find((a) => a.id === user.inviter_id)
  const inviterIPs = new Set<string>()
  if (inviter) {
    if (inviter.register_ip) inviterIPs.add(inviter.register_ip)
    for (const r of inviter.request_ips) inviterIPs.add(r.ip)
  }

  const relationOf = (a: RelatedAccount): string => {
    if (a.id === user.id) return t('This user')
    if (a.id === user.inviter_id) return t('Inviter')
    return t('Sibling invitee')
  }

  return (
    <div className='space-y-2'>
      <Button variant='outline' size='sm' onClick={() => setShow((s) => !s)}>
        {show ? t('Hide related accounts') : t('List involved accounts')}
      </Button>

      {show && (
        <div className='space-y-2 rounded-md border p-3'>
          {isLoading ? (
            <p className='text-muted-foreground text-xs'>{t('Loading')}</p>
          ) : isError ? (
            <p className='text-destructive text-xs'>
              {t('Failed to load related accounts')}
            </p>
          ) : (
            <>
              <div className='flex items-center justify-between gap-3'>
                <p className='text-muted-foreground text-xs'>
                  {t('{{count}} involved accounts', {
                    count: data?.length ?? 0,
                  })}
                </p>
                {banTargets.length > 0 && (
                  <Button
                    variant='destructive'
                    size='sm'
                    onClick={() => setConfirmBan(true)}
                  >
                    {t('Ban all involved accounts')}
                  </Button>
                )}
              </div>
              <ul className='space-y-2'>
                {(data || []).map((a) => (
                  <li key={a.id} className='space-y-1.5 rounded border p-2'>
                    <div className='flex flex-wrap items-center gap-2 text-xs'>
                      <span className='font-medium'>
                        {a.username}
                        <span className='text-muted-foreground'> #{a.id}</span>
                      </span>
                      <StatusBadge variant='info' copyable={false}>
                        {relationOf(a)}
                      </StatusBadge>
                      {a.status === 2 ? (
                        <StatusBadge variant='neutral' copyable={false}>
                          {t('Disabled')}
                        </StatusBadge>
                      ) : (
                        <StatusBadge variant='success' copyable={false}>
                          {t('Enabled')}
                        </StatusBadge>
                      )}
                      {a.invite_abuse_flagged && (
                        <StatusBadge variant='warning' copyable={false}>
                          {t('Abuse?')}
                        </StatusBadge>
                      )}
                      {a.invite_abuse_reason && (
                        <span className='text-muted-foreground'>
                          {a.invite_abuse_reason}
                        </span>
                      )}
                    </div>
                    <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs'>
                      <span>
                        {t('Register IP')}:{' '}
                        <span className='font-mono'>{a.register_ip || '-'}</span>
                      </span>
                      {a.register_fingerprint && (
                        <span>
                          {t('Fingerprint')}:{' '}
                          <span className='font-mono'>
                            {a.register_fingerprint.slice(0, 12)}…
                          </span>
                        </span>
                      )}
                      <span>
                        {t('Registered at')}:{' '}
                        {formatTimestampToDate(a.created_at)}
                      </span>
                    </div>
                    <IPList records={a.request_ips} highlight={inviterIPs} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmBan}
        onOpenChange={setConfirmBan}
        destructive
        title={t('Ban all involved accounts?')}
        desc={t(
          'This will ban {{count}} accounts (the inviter and all invitees under them). Their API keys and logins stop working immediately.',
          { count: banTargets.length }
        )}
        confirmText={t('Ban')}
        isLoading={banMutation.isPending}
        handleConfirm={() => banMutation.mutate(banTargets.map((a) => a.id))}
      />
    </div>
  )
}

function FlaggedUserCard(props: { user: FlaggedUser }) {
  const { t } = useTranslation()
  const { user } = props
  const queryClient = useQueryClient()

  const clearMutation = useMutation({
    mutationFn: () => clearInviteAbuseFlag(user.id),
    onSuccess: (ok) => {
      if (ok) {
        toast.success(t('Invite-abuse flag cleared'))
        queryClient.invalidateQueries({ queryKey: ['invite-abuse-flagged'] })
      } else {
        toast.error(t('Operation failed'))
      }
    },
    onError: () => toast.error(t('Operation failed')),
  })

  // 与邀请人重合的 IP 高亮：邀请人的请求 IP + 注册 IP
  const inviterIPs = new Set<string>()
  if (user.inviter) {
    if (user.inviter.register_ip) inviterIPs.add(user.inviter.register_ip)
    for (const r of user.inviter.request_ips) inviterIPs.add(r.ip)
  }

  return (
    <div className='space-y-3 rounded-lg border p-4'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <span className='text-sm font-medium'>
            {user.username}
            <span className='text-muted-foreground'> #{user.id}</span>
          </span>
          <StatusBadge variant='warning' copyable={false}>
            {t('Abuse?')}
          </StatusBadge>
        </div>
        <Button
          variant='outline'
          size='sm'
          disabled={clearMutation.isPending}
          onClick={() => clearMutation.mutate()}
        >
          {t('Clear flag')}
        </Button>
      </div>

      <p className='text-muted-foreground text-xs'>
        <span className='font-medium'>{t('Reason')}:</span>{' '}
        {user.reason || t('Suspected invite abuse')}
      </p>

      <div className='flex flex-wrap gap-x-6 gap-y-1 text-xs'>
        {user.email && (
          <span>
            <span className='text-muted-foreground'>Email: </span>
            {user.email}
          </span>
        )}
        <span>
          <span className='text-muted-foreground'>{t('Group')}: </span>
          {user.group}
        </span>
        <span>
          <span className='text-muted-foreground'>{t('Registered at')}: </span>
          {formatTimestampToDate(user.created_at)}
        </span>
        <span>
          <span className='text-muted-foreground'>{t('Register IP')}: </span>
          <span className='font-mono'>{user.register_ip || '-'}</span>
        </span>
        {user.register_fingerprint && (
          <span>
            <span className='text-muted-foreground'>{t('Fingerprint')}: </span>
            <span className='font-mono'>
              {user.register_fingerprint.slice(0, 12)}…
            </span>
          </span>
        )}
      </div>

      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-1'>
          <p className='text-muted-foreground text-xs font-medium'>
            {t('Recent API request IPs')}
          </p>
          <IPList records={user.request_ips} highlight={inviterIPs} />
        </div>
        {user.inviter && (
          <div className='space-y-1'>
            <p className='text-muted-foreground text-xs font-medium'>
              {t('Inviter')}: {user.inviter.username} (#{user.inviter.id})
            </p>
            <p className='text-muted-foreground text-xs'>
              {t('Register IP')}:{' '}
              <span className='font-mono'>
                {user.inviter.register_ip || '-'}
              </span>
            </p>
            <IPList records={user.inviter.request_ips} />
          </div>
        )}
      </div>

      <RelatedAccounts user={user} />
    </div>
  )
}

function InviteAbuseReviewContent() {
  const { t } = useTranslation()
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['invite-abuse-flagged'],
    queryFn: getFlaggedInviteAbuseUsers,
  })

  const [search, setSearch] = useState('')
  const [reasonFilter, setReasonFilter] = useState('all')
  const [groupByInviter, setGroupByInviter] = useState(false)
  const [hideBanned, setHideBanned] = useState(false)

  const filtered = (data || []).filter((u) => {
    if (hideBanned && u.status === 2) return false
    if (reasonFilter !== 'all' && u.reason !== reasonFilter) return false
    if (search && !u.username.toLowerCase().includes(search.toLowerCase()))
      return false
    return true
  })

  const reasons = Array.from(
    new Set((data || []).map((u) => u.reason).filter(Boolean))
  )

  // 按邀请人聚合（无邀请人的归到「无邀请人」组）
  const groups = new Map<string, { label: string; users: FlaggedUser[] }>()
  if (groupByInviter) {
    for (const u of filtered) {
      const key = u.inviter ? String(u.inviter.id) : 'none'
      const label = u.inviter
        ? `${u.inviter.username} (#${u.inviter.id})`
        : t('No inviter')
      if (!groups.has(key)) groups.set(key, { label, users: [] })
      groups.get(key)!.users.push(u)
    }
  }

  return (
    <div className='mx-auto max-w-[800px]'>
      <div className='mb-4 flex items-center justify-between gap-3'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Users flagged as suspected invite abuse. Review the request-IP evidence below and clear the flag if the account looks legitimate.'
          )}
        </p>
        <Button
          variant='outline'
          size='sm'
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {t('Refresh')}
        </Button>
      </div>

      {!isLoading && !isError && data && data.length > 0 && (
        <div className='mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-3'>
          <Input
            className='w-44'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search username')}
          />
          {reasons.length > 0 && (
            <Select
              value={reasonFilter}
              onValueChange={(v) => setReasonFilter(v ?? 'all')}
            >
              <SelectTrigger className='w-56'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All reasons')}</SelectItem>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <label className='flex items-center gap-2 text-sm'>
            <Switch
              checked={groupByInviter}
              onCheckedChange={setGroupByInviter}
            />
            {t('Group by inviter')}
          </label>
          <label className='flex items-center gap-2 text-sm'>
            <Switch checked={hideBanned} onCheckedChange={setHideBanned} />
            {t('Hide banned')}
          </label>
        </div>
      )}

      {isLoading ? (
        <p className='text-muted-foreground text-sm'>{t('Loading')}</p>
      ) : isError ? (
        <p className='text-destructive text-sm'>
          {t('Failed to load flagged users')}
        </p>
      ) : !data || data.length === 0 ? (
        <div className='text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm'>
          <ShieldAlert className='size-4' />
          {t('No flagged users')}
        </div>
      ) : filtered.length === 0 ? (
        <div className='text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm'>
          <ShieldAlert className='size-4' />
          {t('No flagged users match the current filters')}
        </div>
      ) : groupByInviter ? (
        <div className='space-y-4'>
          {Array.from(groups.entries()).map(([key, g]) => (
            <div key={key} className='space-y-2'>
              <p className='text-muted-foreground text-sm'>
                <span className='font-medium'>{g.label}</span>{' '}
                {t('{{count}} flagged accounts', { count: g.users.length })}
              </p>
              {g.users.map((u) => (
                <FlaggedUserCard key={u.id} user={u} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className='space-y-3'>
          {filtered.map((u) => (
            <FlaggedUserCard key={u.id} user={u} />
          ))}
        </div>
      )}
    </div>
  )
}

export function InviteAbuseReviewPage() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Abuse Review')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <InviteAbuseReviewContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
