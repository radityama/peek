import { motion, useReducedMotion } from 'motion/react'

export function ConnectionPath() {
  const reduceMotion = useReducedMotion()

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 40"
      preserveAspectRatio="none"
      className="hidden h-10 w-full text-line lg:block"
    >
      <line
        x1="0"
        y1="20"
        x2="200"
        y2="20"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="3 5"
      />
      {reduceMotion ? (
        <circle cx="100" cy="20" r="3" className="fill-accent" />
      ) : (
        <motion.circle
          cy="20"
          r="3"
          className="fill-accent"
          initial={{ cx: 0 }}
          animate={{ cx: 200 }}
          transition={{
            duration: 2.4,
            repeat: Number.POSITIVE_INFINITY,
            ease: 'linear',
          }}
        />
      )}
    </svg>
  )
}
