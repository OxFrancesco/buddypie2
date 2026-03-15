import type { ComponentProps } from 'react'
import logoSvg from '~/assets/logo.svg?raw'

export function Logo({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: logoSvg }}
      {...props}
    />
  )
}
