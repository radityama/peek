import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'

interface RevealProps {
  readonly children: ReactNode
  readonly delay?: number
  readonly className?: string
}

/**
 * Fades and lifts content into view once.
 *
 * The hidden state is applied only after hydration, so the prerendered HTML
 * ships every section fully visible: with JavaScript disabled, or before the
 * bundle runs, nothing is waiting on an animation to appear.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const reduceMotion = useReducedMotion()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => setHydrated(true), [])

  if (!hydrated || reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.42, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  )
}
