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
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { Wallet } from '@/features/wallet'

const walletSearchSchema = z.object({
  show_history: z.boolean().optional(),
})

export const Route = createFileRoute('/_authenticated/wallet/')({
  component: RouteComponent,
  validateSearch: walletSearchSchema,
})

// 合规站保留本页：余额与账单是用户查询自己资产的入口，不属于支付功能。
// 页面内部按 site_mode 隐藏充值/订阅等支付 UI（见 features/wallet）。
function RouteComponent() {
  const { show_history } = Route.useSearch()

  return <Wallet initialShowHistory={show_history} />
}
