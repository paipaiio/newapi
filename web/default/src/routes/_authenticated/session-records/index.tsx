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
import z from "zod";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE } from "@/lib/roles";
import { SessionRecords } from "@/features/session-records";

const sessionRecordsSearchSchema = z.object({
  tab: z.enum(["requests", "conversations"]).optional().catch("requests"),
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(undefined),
  user_id: z.string().optional().catch(""),
  username: z.string().optional().catch(""),
  model_name: z.string().optional().catch(""),
  request_id: z.string().optional().catch(""),
  keyword: z.string().optional().catch(""),
  only_failed: z.boolean().optional().catch(false),
  only_media: z.boolean().optional().catch(false),
  start_timestamp: z.number().optional().catch(undefined),
  end_timestamp: z.number().optional().catch(undefined),
  // conversation groups tab
  date_from: z.string().optional().catch(""),
  date_to: z.string().optional().catch(""),
});

export const Route = createFileRoute("/_authenticated/session-records/")({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState();

    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({
        to: "/403",
      });
    }
  },
  validateSearch: sessionRecordsSearchSchema,
  component: SessionRecords,
});
