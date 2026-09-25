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
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatTimestampRelative, formatTimestampToDate } from '@/lib/format'

import {
  clearInviteAbuseFlag,
  getFlaggedInviteAbuseUsers,
  type FlaggedUser,
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
    </div>
  )
}

function InviteAbuseReviewContent() {
  const { t } = useTranslation()
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['invite-abuse-flagged'],
    queryFn: getFlaggedInviteAbuseUsers,
  })

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
      ) : (
        <div className='space-y-3'>
          {data.map((u) => (
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
