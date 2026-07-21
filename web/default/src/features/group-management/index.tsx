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
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { GroupExclusiveContent } from '@/features/group-exclusive'

import { GroupOptionsEditor } from './components/group-options-editor'
import { UserPerspectivePreview } from './components/user-perspective-preview'

/**
 * Unified admin page for everything group-related:
 *  - Group Configuration: ratios, top-up ratios, selectable groups,
 *    auto groups, inter-group overrides, special usable rules
 *  - Exclusive Groups: per-group user authorization
 *  - User Perspective: preview any user's visible groups + ratios
 */
export function GroupManagement() {
  const { t } = useTranslation()

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Group Management')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <Tabs defaultValue='groups' className='space-y-6'>
          <TabsList>
            <TabsTrigger value='groups'>
              {t('Group Configuration')}
            </TabsTrigger>
            <TabsTrigger value='exclusive'>
              {t('Exclusive Groups')}
            </TabsTrigger>
            <TabsTrigger value='perspective'>
              {t('User Perspective')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value='groups'>
            <GroupOptionsEditor />
          </TabsContent>
          <TabsContent value='exclusive'>
            <GroupExclusiveContent />
          </TabsContent>
          <TabsContent value='perspective'>
            <UserPerspectivePreview />
          </TabsContent>
        </Tabs>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
