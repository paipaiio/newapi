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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { api } from '@/lib/api'
import { formatTimestampRelative, formatTimestampToDate } from '@/lib/format'

interface RequestIPRecord {
  ip: string
  last_seen: number
}

interface RequestIPsData {
  user: { id: number; username: string; records: RequestIPRecord[] }
  inviter: { id: number; username: string; records: RequestIPRecord[] } | null
}

function IPRecordList(props: { records: RequestIPRecord[] }) {
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
      {props.records.map((r) => (
        <li key={r.ip} className='flex items-center justify-between gap-3'>
          <span className='font-mono text-xs'>{r.ip}</span>
          <span
            className='text-muted-foreground shrink-0 text-xs'
            title={formatTimestampToDate(r.last_seen)}
          >
            {formatTimestampRelative(r.last_seen)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function AbuseReviewBadge(props: {
  userId: number
  reason?: string
}) {
  const { t } = useTranslation()
  const [data, setData] = useState<RequestIPsData | null>(null)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    if (loaded || failed) return
    try {
      const res = await api.get(`/api/user/${props.userId}/request_ips`)
      if (res.data?.success) {
        setData(res.data.data as RequestIPsData)
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setLoaded(true)
    }
  }

  return (
    <Popover onOpenChange={(open) => open && load()}>
      <PopoverTrigger
        render={<StatusBadge variant='warning' copyable={false} />}
      >
        {t('Abuse?')}
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-80 max-w-[calc(100vw-2rem)]'
      >
        <div className='flex flex-col gap-2.5'>
          <p className='text-xs'>{props.reason || t('Suspected invite abuse')}</p>
          <div className='flex flex-col gap-1'>
            <p className='text-muted-foreground text-xs font-medium'>
              {t('Recent API request IPs')}
            </p>
            {failed ? (
              <p className='text-muted-foreground text-xs'>
                {t('Failed to load request IPs')}
              </p>
            ) : !data ? (
              <p className='text-muted-foreground text-xs'>{t('Loading')}</p>
            ) : (
              <IPRecordList records={data.user.records} />
            )}
          </div>
          {data?.inviter && (
            <div className='flex flex-col gap-1'>
              <p className='text-muted-foreground text-xs font-medium'>
                {t('Inviter')}: {data.inviter.username} (#{data.inviter.id})
              </p>
              <IPRecordList records={data.inviter.records} />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
