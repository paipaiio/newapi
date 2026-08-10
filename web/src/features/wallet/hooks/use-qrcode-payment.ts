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
import i18next from 'i18next'
import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import {
  requestAlipayPayment,
  requestWechatPayPayment,
  queryAlipayOrder,
  queryWechatPayOrder,
  isApiSuccess,
} from '../api'
import { isAlipayPayment } from '../lib'

export interface QRCodePaymentState {
  open: boolean
  tradeNo: string
  /** QR code content string (for wechat native) */
  qrContent: string
  /** Redirect URL to open in new tab, or iframe URL for embedded Alipay QR */
  payUrl: string
  paymentType: string
  /** 'qrcode' = render QR locally; 'iframe_qr' = embed Alipay QR page; 'redirect' = opened in new tab */
  mode: 'qrcode' | 'iframe_qr' | 'redirect'
  status: 'pending' | 'success' | 'failed'
}

const EMPTY_STATE: QRCodePaymentState = {
  open: false,
  tradeNo: '',
  qrContent: '',
  payUrl: '',
  paymentType: '',
  mode: 'qrcode',
  status: 'pending',
}

const POLL_INTERVAL = 3000
const MAX_POLLS = 100

export function useQRCodePayment(onSuccess: () => void) {
  const [state, setState] = useState<QRCodePaymentState>(EMPTY_STATE)
  const [loading, setLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollCount = useRef(0)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const pollStatus = useCallback(
    (tradeNo: string, paymentType: string) => {
      stopPolling()
      pollCount.current = 0

      const tick = async () => {
        if (pollCount.current >= MAX_POLLS) {
          setState((s) => ({ ...s, status: 'failed' }))
          toast.error(i18next.t('Payment timed out'))
          return
        }
        pollCount.current++

        try {
          const res = isAlipayPayment(paymentType)
            ? await queryAlipayOrder(tradeNo)
            : await queryWechatPayOrder(tradeNo)

          if (isApiSuccess(res) && res.data === 'success') {
            setState((s) => ({ ...s, status: 'success' }))
            toast.success(i18next.t('Payment successful'))
            onSuccess()
            return
          }
          if (isApiSuccess(res) && res.data === 'failed') {
            setState((s) => ({ ...s, status: 'failed' }))
            toast.error(i18next.t('Payment failed'))
            return
          }
        } catch {
          // network error – keep polling
        }
        pollRef.current = setTimeout(tick, POLL_INTERVAL)
      }
      pollRef.current = setTimeout(tick, POLL_INTERVAL)
    },
    [onSuccess, stopPolling]
  )

  const startQRCodePayment = useCallback(
    async (amount: number, paymentType: string) => {
      setLoading(true)
      try {
        const res = isAlipayPayment(paymentType)
          ? await requestAlipayPayment({ amount })
          : await requestWechatPayPayment({ amount })

        if (!isApiSuccess(res) || !res.data) {
          toast.error(
            (res as { message?: string }).message ||
              i18next.t('Payment request failed')
          )
          return
        }

        const data = res.data as {
          trade_no: string
          qr_code?: string
          code_url?: string
          pay_type?: string
          pay_url?: string
        }
        const tradeNo = data.trade_no

        if (data.pay_type === 'redirect_self' && data.pay_url) {
          // wap.pay (mobile): navigate in the same window so the Alipay app can take over
          window.location.href = data.pay_url
          return
        }

        if (data.pay_type === 'iframe_qr' && data.pay_url) {
          // page.pay with qr_pay_mode=4: embed Alipay's official QR page in an iframe
          setState({
            open: true,
            tradeNo,
            qrContent: '',
            payUrl: data.pay_url,
            paymentType,
            mode: 'iframe_qr',
            status: 'pending',
          })
        } else if (data.pay_type === 'redirect' && data.pay_url) {
          // page.pay (PC): open Alipay checkout in new tab
          window.open(data.pay_url, '_blank', 'noopener')
          setState({
            open: true,
            tradeNo,
            qrContent: '',
            payUrl: data.pay_url,
            paymentType,
            mode: 'redirect',
            status: 'pending',
          })
        } else {
          // precreate or wechat native: show QR code dialog
          const qrContent = data.qr_code || data.code_url || ''
          setState({
            open: true,
            tradeNo,
            qrContent,
            payUrl: '',
            paymentType,
            mode: 'qrcode',
            status: 'pending',
          })
        }

        pollStatus(tradeNo, paymentType)
      } catch {
        toast.error(i18next.t('Payment request failed'))
      } finally {
        setLoading(false)
      }
    },
    [pollStatus]
  )

  const closeDialog = useCallback(() => {
    stopPolling()
    setState(EMPTY_STATE)
  }, [stopPolling])

  return { state, loading, startQRCodePayment, closeDialog }
}
