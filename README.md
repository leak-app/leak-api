# 💧 Leak API: Precision Personal Finance

*“We spend so much time figuring out how to make money, but rarely apply optimal engineering to how we keep it. The Leak API is the answer.”*

Leak API is a high-performance, strictly-typed backend engine designed to power the Leak App, a modern personal finance management system. Built with NestJS, PostgreSQL, and Prisma, it's engineered from the ground up for absolute data integrity, atomic financial transactions, and rapid analytical insights.

## 🛠 Why Build This?

The core motivation is simple: I needed a bespoke application tailored entirely to my own needs to track my money and definitively answer the question, *"where did my money go?"* Off-the-shelf personal finance tools either fail to capture nuanced data, lack true reliability, or are painfully slow. As a software engineer, I set out to solve my own problem by building a system designed to find these financial "leaks" that is fast, mathematically sound, and deeply integrated. Leak API tackles this by:

1. **Plugging the Leaks (Atomic Transactions):** Financial data requires absolute consistency. We utilize Prisma transactions to ensure that wallets and their underlying transaction records are perpetually in sync. No more phantom money or lost transactions.
2. **Prioritizing Precision:** Built entirely around robust `Decimal` types. Floating-point math errors and rounding discrepancies have no place when tracking personal wealth.
3. **Optimized for Actionable Insights:** Providing complex, aggregated endpoints (like our "Hydrated" `/overview`) to effortlessly serve our React 19 "Midnight Emerald" frontend in under 100ms—giving immediate, snappy visual clarity on exactly where your cash is flowing.

## 🏗 Architecture & Stack

Leak API follows a **Modular Monolith** design rooted in Clean Architecture principles, ensuring thin controllers, thick domain services, and highly testable modules.

* **Core Framework:** NestJS (v11)
* **Language:** TypeScript (Strict mode—zero `any` tolerance)
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Validation:** Class-validator & Class-transformer

## 🚀 Key Capabilities

* **Reconciliation Engine:** Track balances across Bank, Cash, and E-Wallets with precise calculation and sync logic.
* **Audit & Transaction Engine:** Categorize and track all money movement with atomic logging and strict Type safety.
* **Investment Tracking:** Backend-computed Return on Investment (ROI) parsing initial vs. current values.
* **Savings Goals:** Track progress toward financial independence milestones with calculated completion percentages.

## 📚 Technical Documentation

Dive deeper into the engineering logic, schema designs, and our rollout plan:

* [Architecture Overview](./docs/architecture.md) - Module structure, schema boundaries, and API contracts.
* [Backend Specification](./docs/spec.md) - Functional requirements, performance targets, and security.
* [Development Roadmap](./docs/roadmap.md) - Phase 1 to Phase 5 delivery timeline.
* [Task Management](./docs/tasks.md) - Active technical issues and implementation checklists.

## 💻 Getting Started

### Prerequisites
* Node.js (v20+)
* PostgreSQL database instance
* Yarn package manager

### Base Setup

```bash
# Clone the repository
git clone <repository-url>
cd leak-api

# Install dependencies
yarn install
```

### Environment Configuration

Create a `.env` file at the root:
```env
# Example Database Configuration
DATABASE_URL="postgresql://postgres:password@localhost:5432/leak_app?schema=public"

# Additional JWT / Security secrets per Phase 4 Roadmap
```

### Booting the Engine

```bash
# Generate Prisma Client & Run Migrations
npx prisma generate
npx prisma db push 

# Start in Development mode with hot-reload
yarn run start:dev

# Build and Start in Production mode
yarn run build
yarn run start:prod
```

### Testing Suite

```bash
# Run unit tests
yarn run test

# Run e2e tests
yarn run test:e2e
```

---
*Built with focus, engineered for precision. Apply the same rigor to your finances as you do to your code.*
