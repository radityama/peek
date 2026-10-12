import { Link } from '@tanstack/react-router'
import type { LinkItem } from '../content/site'

interface NavLinkProps {
  readonly item: LinkItem
  readonly className?: string
}

/**
 * Site content is plain data, so `to` is a string rather than a route literal.
 * The cast keeps content declarative; route definitions still enforce what
 * exists.
 */
export function NavLink({ item, className }: NavLinkProps) {
  if (item.external) {
    return (
      <a href={item.to} className={className} target="_blank" rel="noreferrer">
        {item.label}
      </a>
    )
  }
  return (
    <Link to={item.to as never} className={className}>
      {item.label}
    </Link>
  )
}
