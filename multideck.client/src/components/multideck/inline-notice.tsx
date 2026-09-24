import type { ComponentProps, ReactNode } from 'react'
import { AlertTriangle, CircleAlert, CircleCheck, Info } from '@/components/icons/hugeicons'
import { cn } from '@/lib/utils'
import './inline-notice.css'

type InlineNoticeProps = Omit<ComponentProps<'div'>, 'title'> & {
  tone?: 'error' | 'warning' | 'success' | 'info'
  title?: ReactNode
  action?: ReactNode
}

/** Persistent feedback. Keep recovery actions available until the issue is resolved. */
export function InlineNotice({ tone = 'info', title, children, action, className, role, ...props }: InlineNoticeProps) {
  const Icon = { error: CircleAlert, warning: AlertTriangle, success: CircleCheck, info: Info }[tone]
  return (
    <div {...props} className={cn('md-inline-notice', className)} data-tone={tone} role={role ?? (tone === 'error' ? 'alert' : 'status')}>
      <span className="md-inline-notice__icon" aria-hidden="true"><Icon /></span>
      <div className="md-inline-notice__body">
        {title && <p className="md-inline-notice__title">{title}</p>}
        {children && <div className="md-inline-notice__description">{children}</div>}
        {action && <div className="md-inline-notice__action">{action}</div>}
      </div>
    </div>
  )
}
