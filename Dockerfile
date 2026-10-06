# Stage 1: Build the NestJS application
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Copy package descriptors
COPY package.json yarn.lock ./

# Install all dependencies (including devDependencies)
RUN yarn install --frozen-lockfile --network-timeout 600000

# Copy source code and Prisma configuration
COPY . .

# Set a safe dummy variable so Prisma validation passes during the image build
ENV DATABASE_URL="postgresql://placeholder_user:placeholder_pass@localhost:5432/placeholder_db"

# Generate Prisma Client types
RUN npx prisma generate

# Build the production NestJS application
RUN npm run build

# Migration stage: reuses the builder (Prisma CLI + migrations) and applies
# pending migrations once; used by the one-shot `migrate` service in compose.
FROM builder AS migrator

CMD ["npx", "prisma", "migrate", "deploy"]

# Stage 2: Install production dependencies only
FROM node:22-alpine AS dependencies

WORKDIR /usr/src/app

COPY package.json yarn.lock ./

RUN yarn install --production --frozen-lockfile --network-timeout 600000

# Stage 3: Run the production image
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy production node_modules and built NestJS assets
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
# Copy the generated Prisma client code since NestJS references it relatively
COPY --from=builder /usr/src/app/src/generated/prisma ./src/generated/prisma
COPY --from=builder /usr/src/app/package.json ./package.json

EXPOSE 3000

# Start the NestJS application
CMD ["node", "dist/main"]
