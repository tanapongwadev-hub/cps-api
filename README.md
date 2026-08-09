# CPS API

ระบบ API สำหรับ CPS Access Control & Material Management — ระบบจัดการสิทธิ์ผู้ใช้งาน (RBAC) และจัดการวัตถุดิบ

## Tech Stack

- **Framework**: NestJS 11.x
- **Language**: TypeScript
- **ORM**: TypeORM 0.3.x
- **Database**: PostgreSQL 14+
- **Authentication**: JWT + Passport
- **Password Hashing**: Argon2
- **API Documentation**: Swagger/OpenAPI

## Project Structure

```
cps-api/
├── src/
│   ├── modules/                    # Feature modules
│   │   ├── access-control/         # Cross-cutting permission calculation
│   │   ├── audit-logs/             # Audit logging
│   │   ├── auth/                   # Authentication & session management
│   │   ├── categories/              # Material categories
│   │   ├── delivery-types/         # Delivery types
│   │   ├── departments/            # Department management
│   │   ├── goods-receipts/         # Goods receipt transactions
│   │   ├── loading-points/         # Loading/unloading points
│   │   ├── material-models/         # Material models
│   │   ├── materials/              # Material master data
│   │   ├── menus/                  # Menu hierarchy management
│   │   ├── organizations/           # Organization master data
│   │   ├── permissions/            # Permission read-only
│   │   ├── reject-reasons/         # Rejection reasons
│   │   ├── roles/                  # Role management
│   │   ├── sessions/               # Session management
│   │   ├── status-items/           # Status items
│   │   ├── suppliers/              # Supplier master data
│   │   ├── units/                  # Unit of measure
│   │   └── users/                  # User management
│   ├── entities/
│   │   ├── iam/                    # Identity & Access Management (12 tables)
│   │   ├── master/                 # Master data (13 tables)
│   │   └── inventory/              # Transaction data (4 tables)
│   ├── database/
│   │   ├── migrations/             # TypeORM migrations
│   │   └── seeds/                  # Seed scripts
│   ├── config/                     # Configuration utilities
│   └── common/                     # Shared utilities, guards, decorators
├── API_ENDPOINTS.md                # API documentation
└── PROJECT-WIKI.md                # Project wiki & conventions
```

## Setup

### 1. ติดตั้ง dependencies

```bash
pnpm install
```

### 2. ตั้งค่า Environment

คัดลอก `.env.example` เป็น `.env` และปรับค่าให้เหมาะสม:

```bash
cp .env.example .env
```

### 3. รัน Migrations

```bash
pnpm run migration:run
```

### 4. Seed Super Admin (ถ้ายังไม่มี)

```bash
pnpm run seed:run
```

## Commands

```bash
# Development
pnpm run start:dev

# Production
pnpm run start:prod

# Build
pnpm run build

# Tests
pnpm run test

# Migrations
pnpm run migration:generate <name>   # Generate new migration
pnpm run migration:run              # Run migrations
pnpm run migration:revert           # Revert last migration

# Database
pnpm run seed:run                   # Seed data
pnpm run db:reset                   # Reset database (dev only!)
```

## API Documentation

หลังจากรัน development server แล้ว เปิด Swagger UI ที่:

```
http://localhost:3000/api/docs
```

## Authentication

### Login

```bash
POST /auth/login
{
  "username": "superadmin",
  "password": "your-password"
}
```

### Refresh Token

```bash
POST /auth/refresh
{
  "refreshToken": "..."
}
```

## Project Conventions

- Controllers บางเบา วาง business logic ใน Services
- ใช้ DTO + `class-validator` สำหรับ request validation
- ใช้ custom exceptions จาก `src/common/exceptions/custom-exceptions.ts`
- ใช้ `getEnv`, `getEnvNumber`, `getEnvBoolean` จาก `src/config/env.utils.ts` เมื่ออ่าน environment variable
- ห้าม hardcode secrets / credentials ใน source code

ดูรายละเอียดเพิ่มเติมใน [PROJECT-WIKI.md](./PROJECT-WIKI.md)
