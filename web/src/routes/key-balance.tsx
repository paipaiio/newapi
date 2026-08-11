import { createFileRoute } from '@tanstack/react-router'

import { KeyBalance } from '@/features/key-balance'

export const Route = createFileRoute('/key-balance')({
  component: KeyBalance,
})
