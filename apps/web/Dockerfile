FROM node:20-alpine AS base
WORKDIR /workspace
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/runner/package.json apps/runner/package.json
COPY apps/web/package.json apps/web/package.json
COPY libs ./libs
RUN npm install --no-audit --no-fund

FROM deps AS build
COPY apps/web ./apps/web
WORKDIR /workspace/apps/web
RUN npx next build

FROM base AS run
ENV NODE_ENV=production
WORKDIR /workspace/apps/web
COPY --from=build /workspace/apps/web/.next/standalone ./
COPY --from=build /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /workspace/apps/web/public ./apps/web/public
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
