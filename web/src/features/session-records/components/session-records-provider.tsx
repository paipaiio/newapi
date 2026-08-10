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
import React, { useState } from 'react'

import useDialogState from '@/hooks/use-dialog'

import type { SessionLog } from '../types'

type SessionRecordsDialogType = 'detail'

type SessionRecordsContextType = {
  open: SessionRecordsDialogType | null
  setOpen: (str: SessionRecordsDialogType | null) => void
  currentRow: SessionLog | null
  setCurrentRow: React.Dispatch<React.SetStateAction<SessionLog | null>>
}

const SessionRecordsContext =
  React.createContext<SessionRecordsContextType | null>(null)

export function SessionRecordsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useDialogState<SessionRecordsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<SessionLog | null>(null)

  return (
    <SessionRecordsContext
      value={{
        open,
        setOpen,
        currentRow,
        setCurrentRow,
      }}
    >
      {children}
    </SessionRecordsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSessionRecords = () => {
  const context = React.useContext(SessionRecordsContext)

  if (!context) {
    throw new Error(
      'useSessionRecords has to be used within <SessionRecordsContext>'
    )
  }

  return context
}
