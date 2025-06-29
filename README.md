# Bayeu Project

This project is built with [Supabase](https://supabase.io/), an open-source Firebase alternative.

## Project Structure

- `supabase/`: This directory contains all the Supabase-related configurations.
  - `config.toml`: The main configuration file for your Supabase project.
  - `functions/`: This directory holds the serverless Edge Functions.
    - `_shared/`: Shared code between functions.
    - `payments/`: Functions related to payments.
    - ... other function directories
  - `migrations/`: Contains database schema migrations.
  - `seeds/`: Contains SQL seed files for populating the database with initial data.

## Getting Started

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Deno](https://deno.land/)

### Local Development

1. **Start Supabase services:**

   ```bash
   supabase start
   ```

2. **Deploy functions:**

   ```bash
   supabase functions deploy --all
   ```

3. **Run tests:**

   ```bash
   cd supabase/functions
   deno task test
   ```

4. **Generate coverage stored as a .lcov:**

   ```bash
   deno task lcov
   ```

## Database

The database schema is managed through migrations in the `supabase/migrations` directory. To apply new migrations, run:

```bash
supabase db push
```

## Environment Variables

Create a `.env` file in the root of the project and add the necessary environment variables. You can use the `.env.example` as a template.

```bash
cp .env.example .env
```

## Deployment to our Base Repository

Base Repository: [Go Here]("https://github.com/peltops/base")

To deploy this project to the base repository, follow these steps:

1. *Copy these folders base repository:*
   - `supabase/functions/`
   - `supabase/migrations/`
   - `supabase/seeds/`

2. *Paste the copied folders into the base repository.*
   - `ansible/roles/payment/files/payment/volumes/`
  
  The repository structure should look like this:

   ``` bash
   ansible/
     roles/
       payment/
         files/
           payment/
             volumes/
               functions/
               db/
                  migrations/
                  seeds/
   ```

Example commands to copy the folders:

   ```bash
      cp -r supabase/functions/ /path/to/base/repository/ansible/roles/payment/files/payment/volumes/functions/
      cp -r supabase/migrations/ /path/to/base/repository/ansible/roles/payment/files/payment/volumes/db/migrations/
      cp -r supabase/seeds/ /path/to/base/repository/ansible/roles/payment/files/payment/volumes/db/seeds/
   ```
