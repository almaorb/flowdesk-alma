#!/bin/sh
set -e

echo "› applying database migrations"
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

if [ "${SEED_ON_BOOT}" = "true" ]; then
  # The seed is idempotent: it deletes and rebuilds only the two demo
  # organizations, so restarting the stack never duplicates data.
  echo "› seeding demo data"
  node apps/api/dist/seed.js
fi

exec "$@"
