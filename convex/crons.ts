import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'expire stale credit holds',
  { minutes: 5 },
  internal.billing.expireActiveHolds,
  {},
)

export default crons
