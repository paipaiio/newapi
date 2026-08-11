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
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ConversationGroupsView } from './components/conversation-groups-view'
import { SessionDetailDialog } from './components/dialogs/session-detail-dialog'
import {
  SessionRecordsProvider,
  useSessionRecords,
} from './components/session-records-provider'
import { SessionRecordsTable } from './components/session-records-table'

const route = getRouteApi('/_authenticated/session-records/')

function SessionRecordsContent() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow } = useSessionRecords()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const tab = search.tab ?? 'requests'

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Session Records')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='mb-3'>
            <Tabs
              value={tab}
              onValueChange={(value) =>
                navigate({
                  search: {
                    tab: value as 'requests' | 'conversations',
                    page: 1,
                  },
                })
              }
            >
              <TabsList>
                <TabsTrigger value='requests'>
                  {t('Request records')}
                </TabsTrigger>
                <TabsTrigger value='conversations'>
                  {t('Conversation groups')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {tab === 'conversations' ? (
            <ConversationGroupsView />
          ) : (
            <SessionRecordsTable />
          )}
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <SessionDetailDialog
        record={currentRow}
        open={open === 'detail'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        keyword={search.keyword || undefined}
      />
    </>
  )
}

export function SessionRecords() {
  return (
    <SessionRecordsProvider>
      <SessionRecordsContent />
    </SessionRecordsProvider>
  )
}
