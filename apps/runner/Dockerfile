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
COPY apps/runner ./apps/runner
RUN npx tsc -p apps/runner/tsconfig.build.json

FROM base AS run
ENV NODE_ENV=production
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist/apps/runner ./dist
COPY libs ./libs
COPY tsconfig.base.json ./
CMD ["node", "dist/main.js"]
