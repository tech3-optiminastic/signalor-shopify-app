FROM node:20-alpine AS base

# Install openssl for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production=false

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy app source
COPY . .

# Build the Remix app
RUN npm run build

# Production stage
FROM node:20-alpine AS production
RUN apk add --no-cache openssl
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/build ./build
COPY --from=base /app/public ./public
COPY --from=base /app/package.json ./
COPY --from=base /app/prisma ./prisma

# Run migrations and start
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
