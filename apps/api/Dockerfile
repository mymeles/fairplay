FROM node:20-alpine AS base
WORKDIR /workspace
RUN apk add --no-cache openssl libc6-compat

FROM base AS deps
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/runner/package.json apps/runner/package.json
COPY apps/web/package.json apps/web/package.json
COPY libs ./libs
RUN npm install --no-audit --no-fund

FROM deps AS build
COPY apps/api ./apps/api
# Compile workspace libs first so their dist/ exists before the api build —
# api code does `require('@fairplay/shared-utils')` which resolves to the
# lib's package.json `main` (dist/index.js) at runtime.
RUN npx tsc -p libs/shared-types/tsconfig.json
RUN npx tsc -p libs/shared-utils/tsconfig.json
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npx tsc -p apps/api/tsconfig.build.json

FROM base AS run
ENV NODE_ENV=production
# Copy node_modules from the build stage so the generated Prisma client
# (node_modules/.prisma/client/) is included — the deps stage doesn't have it.
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist/apps/api ./dist
COPY --from=build /workspace/apps/api/prisma ./prisma
# Copy libs from the build stage so the compiled dist/ is included (the host
# .dockerignore excludes dist/ from a plain `COPY libs ./libs`).
COPY --from=build /workspace/libs ./libs
COPY tsconfig.base.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
