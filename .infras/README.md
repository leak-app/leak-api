# Infrastructure

## PostgreSQL (Docker)

From project root:

```bash
docker compose -f docker-compose.yml up -d
```

Then set in `.env`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/leak?schema=public"
```

Stop:

```bash
docker compose -f docker-compose.yml down
```
