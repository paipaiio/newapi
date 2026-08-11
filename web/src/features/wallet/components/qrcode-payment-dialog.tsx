import { CheckCircle, Loader2, XCircle, X, ExternalLink } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { QRCodePaymentState } from '../hooks/use-qrcode-payment'

interface QRCodePaymentDialogProps {
  state: QRCodePaymentState
  onClose: () => void
}

export function QRCodePaymentDialog({
  state,
  onClose,
}: QRCodePaymentDialogProps) {
  const { t } = useTranslation()
  const isAlipay = state.paymentType === 'alipay'
  const name = isAlipay ? t('Alipay') : t('WeChat Pay')
  const color = isAlipay ? '#1677FF' : '#07C160'

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <span style={{ color }}>{name}</span>
            <span className='text-muted-foreground text-sm font-normal'>
              {state.mode === 'redirect'
                ? `— ${t('Checkout opened')}`
                : `— ${t('Scan to pay')}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className='flex flex-col items-center gap-4 py-2'>
          {state.status === 'success' ? (
            <div className='flex flex-col items-center gap-3 py-6'>
              <CheckCircle className='h-16 w-16 text-green-500' />
              <p className='text-lg font-semibold'>{t('Payment successful')}</p>
            </div>
          ) : state.status === 'failed' ? (
            <div className='flex flex-col items-center gap-3 py-6'>
              <XCircle className='h-16 w-16 text-red-500' />
              <p className='text-lg font-semibold'>{t('Payment failed')}</p>
            </div>
          ) : state.mode === 'iframe_qr' ? (
            <>
              {/* 支付宝 qr_pay_mode=4 返回页面 body 自带 8px 默认边距，二维码不居中；
                  用固定窗口 + 负偏移裁掉边距，只露出 200px 的二维码本体 */}
              <div className='relative h-[200px] w-[200px] overflow-hidden rounded-lg border bg-white shadow-sm'>
                <iframe
                  src={state.payUrl}
                  title='Alipay QR'
                  width={300}
                  height={300}
                  style={{
                    border: 0,
                    position: 'absolute',
                    top: -8,
                    left: -8,
                  }}
                  scrolling='no'
                />
              </div>
              <div className='text-muted-foreground flex items-center gap-2 text-sm'>
                <Loader2 className='h-4 w-4 animate-spin' />
                {t('Waiting for payment...')}
              </div>
            </>
          ) : state.mode === 'redirect' ? (
            <>
              <div className='bg-muted/30 w-full space-y-3 rounded-lg border p-4 text-center'>
                <p className='text-sm font-medium'>
                  {t('Alipay checkout opened in a new tab')}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Complete payment in the new tab, then return here. This page will update automatically.'
                  )}
                </p>
                {state.payUrl && (
                  <Button
                    variant='outline'
                    size='sm'
                    className='gap-1.5 text-xs'
                    onClick={() =>
                      window.open(state.payUrl, '_blank', 'noopener')
                    }
                  >
                    <ExternalLink className='h-3 w-3' />
                    {t('Reopen payment page')}
                  </Button>
                )}
              </div>
              <div className='text-muted-foreground flex items-center gap-2 text-sm'>
                <Loader2 className='h-4 w-4 animate-spin' />
                {t('Waiting for payment...')}
              </div>
            </>
          ) : (
            <>
              {state.qrContent && (
                <div className='rounded-lg border bg-white p-3 shadow-sm'>
                  <QRCodeSVG
                    value={state.qrContent}
                    size={240}
                    level='M'
                    marginSize={2}
                  />
                </div>
              )}
              <div className='text-muted-foreground flex items-center gap-2 text-sm'>
                <Loader2 className='h-4 w-4 animate-spin' />
                {t('Waiting for payment...')}
              </div>
            </>
          )}
        </div>

        <div className='flex justify-end border-t pt-4'>
          <Button
            variant='outline'
            size='sm'
            onClick={onClose}
            className='gap-1.5'
          >
            <X className='h-3.5 w-3.5' />
            {state.status === 'success' ? t('Done') : t('Cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
