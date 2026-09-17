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
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'

import { getContentSafetyStats } from './api'
import { ContentSafetyTable } from './components/content-safety-table'

export function ContentSafetyPage() {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['content-safety-stats'],
    queryFn: getContentSafetyStats,
  })
  const stats = data?.data

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>
        {t('Content Safety Review')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mb-3 flex flex-wrap gap-2'>
          <StatusBadge variant='warning' copyable={false}>
            {t('Pending')}: {stats?.pending ?? 0}
          </StatusBadge>
          <StatusBadge variant='danger' copyable={false}>
            {t('Blocked')}: {stats?.blocked ?? 0}
          </StatusBadge>
          <StatusBadge variant='info' copyable={false}>
            {t('For review')}: {stats?.review ?? 0}
          </StatusBadge>
        </div>
        <ContentSafetyTable />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
