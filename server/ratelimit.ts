type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** Sliding-window counter. Returns true when the request is allowed. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  bucket.count += 1
  return bucket.count <= max
}

const sweeper = setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}, 60_000)
sweeper.unref()
