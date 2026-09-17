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
import { AxiosError } from 'axios'
import { Loader2, MessageCircle, Send, WifiOff, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  createSupportConversation,
  listSupportMessages,
  sendSupportMessage,
  supportRetryAfterSeconds,
} from '../api'
import { applySupportPoll, findQuotedMessage } from '../lib/apply-poll'
import type { SupportMessage } from '../types'

const POLL_INTERVAL_MS = 2000

function supportErrorMessage(
  error: unknown,
  fallback: string
): { message: string; retryAfter: number; code?: string } {
  const retryAfter = supportRetryAfterSeconds(error)
  if (error instanceof AxiosError) {
    const data = error.response?.data as
      | { message?: string; code?: string; retry_after?: number }
      | undefined
    return {
      message: data?.message || error.message || fallback,
      retryAfter: data?.retry_after || retryAfter,
      code: data?.code,
    }
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const data = error as { message?: string; code?: string; retry_after?: number }
    return {
      message: data.message || fallback,
      retryAfter: data.retry_after || retryAfter,
      code: data.code,
    }
  }
  return { message: fallback, retryAfter }
}

export function SupportWidget() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [disconnected, setDisconnected] = useState(false)
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [cursor, setCursor] = useState('')
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<SupportMessage | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef('')
  const conversationRef = useRef('')
  const messagesRef = useRef<SupportMessage[]>([])

  useEffect(() => {
    cursorRef.current = cursor
  }, [cursor])
  useEffect(() => {
    conversationRef.current = conversationId
  }, [conversationId])

  const ensureConversation = useCallback(async () => {
    if (conversationRef.current) return conversationRef.current
    setLoading(true)
    setError('')
    try {
      const res = await createSupportConversation(window.location.href)
      if (!res.success || !res.data?.conversation_id) {
        setError(res.message || t('Unable to start a support conversation.'))
        setDisconnected(true)
        return ''
      }
      conversationRef.current = res.data.conversation_id
      setConversationId(res.data.conversation_id)
      setDisconnected(false)
      return res.data.conversation_id
    } catch (err) {
      const parsed = supportErrorMessage(
        err,
        t('Unable to start a support conversation.')
      )
      setError(parsed.message)
      setDisconnected(true)
      return ''
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (!open || !user) return
    void ensureConversation()
  }, [open, user, ensureConversation])

  useEffect(() => {
    if (!open || !conversationId) return
    let cancelled = false
    let timer = 0

    const poll = async () => {
      try {
        const res = await listSupportMessages(
          conversationId,
          cursorRef.current || undefined
        )
        if (cancelled) return
        if (!res.success) {
          setDisconnected(true)
          setError(res.message || t('Lost connection to support.'))
          const delay =
            (res.retry_after && res.retry_after > 0
              ? res.retry_after
              : POLL_INTERVAL_MS / 1000) * 1000
          timer = window.setTimeout(poll, delay)
          return
        }
        setDisconnected(false)
        setError('')
        const applied = applySupportPoll(
          messagesRef.current,
          res.data?.items,
          res.data?.next_cursor
        )
        messagesRef.current = applied.messages
        setMessages(applied.messages)
        if (applied.cursor) {
          cursorRef.current = applied.cursor
          setCursor(applied.cursor)
        }
        timer = window.setTimeout(poll, POLL_INTERVAL_MS)
      } catch (err) {
        if (cancelled) return
        const parsed = supportErrorMessage(err, t('Lost connection to support.'))
        setDisconnected(true)
        setError(parsed.message)
        const delay =
          parsed.retryAfter > 0 ? parsed.retryAfter * 1000 : POLL_INTERVAL_MS
        timer = window.setTimeout(poll, delay)
      }
    }

    void poll()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, conversationId, t])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, open])

  if (!user) return null

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || sending) return
    const id = await ensureConversation()
    if (!id) return
    setSending(true)
    try {
      const res = await sendSupportMessage(id, text, replyTo?.id)
      if (!res.success) {
        setError(res.message || t('Failed to send message.'))
        return
      }
      if (res.data?.id) {
        const applied = applySupportPoll(
          messagesRef.current,
          [res.data],
          cursorRef.current
        )
        messagesRef.current = applied.messages
        setMessages(applied.messages)
      }
      setDraft('')
      setReplyTo(null)
      setError('')
      setDisconnected(false)
    } catch (err) {
      const parsed = supportErrorMessage(err, t('Failed to send message.'))
      setError(parsed.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button
        type='button'
        size='icon-lg'
        className='fixed right-4 bottom-4 z-40 shadow-none md:right-6 md:bottom-6'
        aria-label={t('Open customer support')}
        onClick={() => setOpen(true)}
      >
        <MessageCircle />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side='right'
          className='w-full gap-0 p-0 sm:max-w-md'
          showCloseButton
        >
          <SheetHeader className='border-border border-b'>
            <SheetTitle>{t('Customer support')}</SheetTitle>
            <SheetDescription>
              {disconnected
                ? t('Trying to reconnect to support…')
                : t('Chat with the support team.')}
            </SheetDescription>
          </SheetHeader>

          {disconnected ? (
            <div
              role='status'
              className='bg-destructive/10 text-destructive flex items-center gap-2 px-4 py-2 text-xs'
            >
              <WifiOff className='size-3.5' />
              <span>{error || t('Lost connection to support.')}</span>
            </div>
          ) : null}

          <ScrollArea className='min-h-0 flex-1'>
            <div className='flex flex-col gap-3 p-4'>
              {loading && messages.length === 0 ? (
                <div
                  className='text-muted-foreground flex items-center gap-2 text-sm'
                  aria-busy='true'
                >
                  <Loader2 className='size-4 animate-spin' />
                  {t('Connecting to support...')}
                </div>
              ) : null}
              {!loading && messages.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  {t('No messages yet. Send a message to start.')}
                </p>
              ) : null}
              {messages.map((message) => {
                const quoted = findQuotedMessage(
                  messages,
                  message.reply_to_message_id
                )
                const isCustomer = message.direction === 'customer'
                return (
                  <button
                    key={message.id}
                    type='button'
                    className={cn(
                      'flex max-w-[85%] flex-col gap-1 text-left',
                      isCustomer ? 'self-end' : 'self-start'
                    )}
                    onClick={() => setReplyTo(message)}
                    aria-label={t('Quote this message')}
                  >
                    {!isCustomer ? (
                      <span className='text-muted-foreground px-1 text-xs'>
                        {t('Human support')}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        'rounded-lg px-3 py-2 text-sm',
                        isCustomer
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      )}
                    >
                      {quoted ? (
                        <span className='mb-1 block border-l-2 border-current/30 pl-2 text-xs opacity-80'>
                          {quoted.text}
                        </span>
                      ) : null}
                      {message.text}
                    </span>
                  </button>
                )
              })}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className='border-border flex flex-col gap-2 border-t p-3'>
            {replyTo ? (
              <div className='bg-muted flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-xs'>
                <div className='min-w-0'>
                  <div className='text-muted-foreground mb-0.5'>
                    {t('Replying to')}
                  </div>
                  <div className='truncate'>{replyTo.text}</div>
                </div>
                <Button
                  type='button'
                  size='icon-xs'
                  variant='ghost'
                  aria-label={t('Cancel quote')}
                  onClick={() => setReplyTo(null)}
                >
                  <X />
                </Button>
              </div>
            ) : null}
            {error && !disconnected ? (
              <p className='text-destructive text-xs'>{error}</p>
            ) : null}
            <div className='flex items-end gap-2'>
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('Type a message...')}
                className='min-h-11 max-h-32'
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
              />
              <Button
                type='button'
                size='icon'
                disabled={sending || !draft.trim()}
                aria-label={t('Send')}
                onClick={() => void handleSend()}
              >
                {sending ? (
                  <Loader2 className='animate-spin' />
                ) : (
                  <Send />
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
