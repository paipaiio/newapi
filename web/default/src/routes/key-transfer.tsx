import { createFileRoute } from '@tanstack/react-router'
import { KeyTransfer } from '@/features/key-transfer'

export const Route = createFileRoute('/key-transfer')({
  component: KeyTransfer,
})
