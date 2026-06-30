# Database Migrations (dbmate)

This project uses [dbmate](https://github.com/amacneil/dbmate) to manage database migrations, making it easy to keep the database schema in sync across development, testing, and production environments.

## Directory Structure

All migration files are located in this directory (`supabase/migrations/`) and follow the `dbmate` format.

Each migration file is named with a timestamp prefix (e.g. `20250413153258_init.sql`) and contains two sections:

- `-- migrate:up`: SQL statements to apply the migration.
- `-- migrate:down`: SQL statements to revert the migration.

## How to use `dbmate` with Docker Compose

A `docker-compose.yml` file is provided in this directory to allow you to run migrations easily without installing the `dbmate` CLI globally.

### 1. Set the Database URL

Make sure you have your database URL ready. `dbmate` uses the `DATABASE_URL` environment variable.
For a local Supabase PostgreSQL instance, it usually looks like this:
`postgres://postgres:postgres@host.docker.internal:54322/postgres?sslmode=disable`

### 2. Run Migrations (Up)

To apply all pending migrations:

```bash
DATABASE_URL="postgres://postgres:postgres@host.docker.internal:54322/postgres?sslmode=disable" docker-compose run --rm dbmate up
```

### 3. Revert Migrations (Down)

To rollback the most recent migration:

```bash
DATABASE_URL="postgres://postgres:postgres@host.docker.internal:54322/postgres?sslmode=disable" docker-compose run --rm dbmate down
```

### 4. Create a New Migration

To generate a new timestamped migration file:

```bash
docker-compose run --rm dbmate new my_new_migration_name
```

This will create a new file like `20260701123456_my_new_migration_name.sql` in this directory.

### 5. Check Migration Status

To see which migrations have been applied and which are pending:

```bash
DATABASE_URL="postgres://postgres:postgres@host.docker.internal:54322/postgres?sslmode=disable" docker-compose run --rm dbmate status
```

## Note on Supabase CLI

If you are using the Supabase CLI (`supabase start`), Supabase natively runs all `.sql` files in this directory on startup. It ignores the `-- migrate:up` / `-- migrate:down` annotations and just executes the whole file by default, so ensure your SQL is compatible with both systems if you run both concurrently.
