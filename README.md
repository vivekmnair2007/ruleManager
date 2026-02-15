# Rule Management Portal (Foundation)

This repository contains the **foundation scaffolding** for a Rule Management Portal:

- `apps/backend`: Node.js + TypeScript + Express API, Prisma ORM, Postgres migrations, and seed script.
- `apps/frontend`: React + TypeScript + Vite starter UI.

## 1) Prerequisites

- Node.js 20+
- npm 10+
- Postgres 14+

## 2) Setup

```bash
cp .env.example .env
npm install
```

## 3) Database

Run migrations:

```bash
npm --workspace apps/backend run prisma:migrate
```

Generate Prisma client:

```bash
npm --workspace apps/backend run prisma:generate
```

Seed demo data (1 ruleset + 2 rules + draft versions):

```bash
npm --workspace apps/backend run seed
```

## 4) Run locally

Backend:

```bash
npm run dev:backend
```

Frontend:

```bash
npm run dev:frontend
```

## 5) What is included

- DB schema + SQL migration for:
  - `rule`
  - `rule_version`
  - `ruleset`
  - `ruleset_version`
  - `ruleset_entry`
  - `audit_event`
- Indexes and constraints, including:
  - one `ACTIVE` ruleset version per ruleset (partial unique index)
  - sequential ordering uniqueness and non-null enforcement
  - immutability guards via DB triggers
- Prisma ORM models matching the schema.
- Auth stub in backend with a hardcoded demo user + roles.

## 6) Fixing `npm install` 403 in restricted environments

Use your organization's internal npm registry and token-based auth.

### Step A: configure env vars

```bash
export NPM_REGISTRY_URL="https://<your-internal-registry>/"
export NPM_REGISTRY_HOST="<your-internal-registry-host-and-path>/"
export NPM_TOKEN="<your-token-if-required>"
```

### Step B: generate `.npmrc` from env vars

```bash
npm run setup:npmrc
```

(Alternative: copy `.npmrc.example` to `.npmrc` and fill values manually.)

### Step C: run preflight check

```bash
npm run preflight:npm
```

### Step D: install dependencies

```bash
npm install
```

If your internal registry uses a private CA, install that CA in the runner trust store rather than setting `strict-ssl=false`.
# ruleManager

A fresh Python starter for building a rule management library/application.

## Quickstart

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Run

```bash
python -m rule_manager
```

## Test

```bash
python -m unittest discover -s tests -p 'test_*.py'
```
