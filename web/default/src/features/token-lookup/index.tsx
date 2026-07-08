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
import { Copy, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatTimestamp } from '@/lib/format'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { lookupTokens } from './api'
import { RateLimitDialog } from './components/rate-limit-dialog'
import type { TokenLookupRow } from './types'

const QUOTA_PER_UNIT = 500000

function fmtQuota(q: number | undefined): string {
  if (q == null) return '-'
  return `$${(q / QUOTA_PER_UNIT).toFixed(4)}`
}

function TokenLookupContent() {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard({ notify: false })
  const [keyword, setKeyword] = useState('')
  const [rows, setRows] = useState<TokenLookupRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [rlToken, setRlToken] = useState<TokenLookupRow | null>(null)
  const [rlOpen, setRlOpen] = useState(false)

  const search = async () => {
    if (!keyword.trim()) {
      toast.error(t('Enter an API key, username, or batch id'))
      return
    }
    setLoading(true)
    try {
      const res = await lookupTokens(keyword.trim())
      if (res.success) {
        setRows(res.data?.items || [])
      } else {
        toast.error(res.message || t('Lookup failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  const openRateLimit = (row: TokenLookupRow) => {
    setRlToken(row)
    setRlOpen(true)
  }

  const handleCopyKey = async (fullKey: string) => {
    await copyToClipboard(fullKey)
    toast.success(t('Full key copied'))
  }

  return (
    <div className='mx-auto max-w-[1200px]'>
      <p className='text-muted-foreground mb-4 text-sm'>
        {t(
          'Enter an API key, username, or batch id to find the owning account. Useful for recovering accounts when an export sheet is lost.'
        )}
      </p>

      <div className='flex gap-2'>
        <div className='relative flex-1'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
          <Input
            className='pl-8'
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder={t('API key / username / batch id (fuzzy)')}
          />
        </div>
        <Button onClick={search} disabled={loading}>
          {t('Search')}
        </Button>
      </div>

      {searched && (
        <div className='mt-4 rounded-lg border'>
          {rows.length === 0 ? (
            <p className='text-muted-foreground py-10 text-center text-sm'>
              {t('No matching tokens found')}
            </p>
          ) : (
            <>
              <div className='text-muted-foreground px-4 py-2 text-xs'>
                {t('{{n}} results', { n: rows.length })}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Username')}</TableHead>
                    <TableHead>{t('Email')}</TableHead>
                    <TableHead>API Key</TableHead>
                    <TableHead>{t('Batch')}</TableHead>
                    <TableHead>{t('Group')}</TableHead>
                    <TableHead>{t('Used')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead>RPM/TPM</TableHead>
                    <TableHead>{t('Created at')}</TableHead>
                    <TableHead className='text-right'>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className='font-medium'>
                        {r.username || `ID:${r.user_id}`}
                      </TableCell>
                      <TableCell className='text-muted-foreground'>
                        {r.email || '-'}
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-1'>
                          <span className='font-mono text-xs'>{r.key}</span>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='size-6'
                            onClick={() => handleCopyKey(r.full_key)}
                          >
                            <Copy className='size-3.5' />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.batch_id ? (
                          <Badge
                            variant='outline'
                            className='rounded-full border-violet-500/40 text-violet-600 dark:text-violet-300'
                          >
                            {r.batch_id}
                          </Badge>
                        ) : (
                          <span className='text-muted-foreground'>-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant='secondary' className='rounded-full'>
                          {r.group || 'default'}
                        </Badge>
                      </TableCell>
                      <TableCell className='tabular-nums'>
                        {fmtQuota(r.used_quota)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          variant={r.status === 1 ? 'success' : 'danger'}
                          copyable={false}
                        >
                          {r.status === 1 ? t('Enabled') : t('Disabled')}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className='text-muted-foreground tabular-nums text-sm'>
                        {r.rpm || 0} / {r.tpm || 0}
                      </TableCell>
                      <TableCell className='text-muted-foreground text-sm'>
                        {r.created_time ? formatTimestamp(r.created_time) : '-'}
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => openRateLimit(r)}
                        >
                          {t('Set rate limit')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </div>
      )}

      <RateLimitDialog
        token={rlToken}
        open={rlOpen}
        onOpenChange={setRlOpen}
        onSaved={(tokenId, rpm, tpm) =>
          setRows((prev) =>
            prev.map((r) => (r.id === tokenId ? { ...r, rpm, tpm } : r))
          )
        }
      />
    </div>
  )
}

export function TokenLookup() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Token Lookup')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <TokenLookupContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
