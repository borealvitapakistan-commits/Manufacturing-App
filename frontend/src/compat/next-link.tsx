import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string
  children: ReactNode
}

export default function Link({ href, children, ...props }: Props) {
  return (
    <RouterLink to={href} {...props}>
      {children}
    </RouterLink>
  )
}
