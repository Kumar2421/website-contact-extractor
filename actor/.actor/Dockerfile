# Build context is the actor/ folder. src/engine must already be synced (npm run sync-engine) before `apify push`.
FROM apify/actor-node:22 AS builder
COPY package*.json ./
RUN npm ci --include=dev --audit=false
COPY . ./
RUN npx esbuild src/main.ts --bundle --platform=node --format=esm --packages=external --target=node22 --outfile=dist/main.js

FROM apify/actor-node:22
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --audit=false && rm -rf ~/.npm
COPY --from=builder /usr/src/app/dist ./dist
COPY . ./
# Node cannot see the container's memory limit, so without a heap cap it lets garbage pile up until the
# container is killed. Cap the old-space heap at 60% of the run's memory so it collects in time.
CMD ["sh", "-c", "exec node --max-old-space-size=$(( ${ACTOR_MEMORY_MBYTES:-512} * 6 / 10 )) dist/main.js"]
