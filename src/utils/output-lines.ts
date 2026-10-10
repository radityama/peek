/**
 * Characters retained for an output line that has not been terminated yet.
 * Framework banners and tunnel log lines that Peek inspects are far shorter,
 * so keeping the tail preserves port and URL detection while bounding memory
 * against a stream that never emits a newline.
 */
export const MAX_BUFFERED_LINE = 8_192

export interface ConsumedOutput {
  /** Complete lines, in order, without their terminators. */
  lines: string[]
  /** Unterminated tail, bounded to `MAX_BUFFERED_LINE` characters. */
  pending: string
}

/**
 * Split `chunk` plus any buffered text into complete lines and a bounded
 * unterminated tail. Complete lines are returned in full; only the trailing
 * fragment that has not seen a newline is capped.
 */
export function consumeOutputLines(
  buffer: string,
  chunk: string,
): ConsumedOutput {
  const parts = (buffer + chunk).split(/[\r\n]+/)
  const tail = parts.pop() ?? ''
  return {
    lines: parts,
    pending:
      tail.length > MAX_BUFFERED_LINE
        ? tail.slice(tail.length - MAX_BUFFERED_LINE)
        : tail,
  }
}
