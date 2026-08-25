# Payments Edge Function

This is the Payments Edge Function for the Bayeu project. It handles all payment integrations (Stripe, Midtrans), invoicing, and webhook processing. 

This module has been heavily refactored to follow **Clean Architecture** principles, enforcing strict separation of concerns, decoupling from external dependencies, and ensuring 100% testability.

## Architecture Overview

The codebase is split into four distinct layers (from inner to outer):

### 1. Domain (`src/domain/`)
The core of the application. It contains business rules, entities, and interface contracts.
- **`entities/`**: Core data models (Order, Transaction, Product, Tenant).
- **`gateways/`**: Interfaces defining how the app interacts with Payment Providers (Stripe, Midtrans).
- **`repositories/`**: Interfaces defining how the app reads/writes data to the database.
- **`services/`**: Interfaces for external services (like the Outpost webhook publisher).

*Note: The Domain layer depends on NOTHING. It contains zero imports from other layers.*

### 2. Use Cases (`src/use_cases/`)
Application-specific business rules. Each file here represents a single, testable action (e.g., `InitiatePaymentUseCase`, `GetOrderUseCase`).
- They orchestrate the flow of data to and from the entities.
- They rely entirely on Dependency Injection (interfaces from the Domain layer). They do not know about HTTP requests, Supabase, or Hono.

### 3. Presentation (`src/presentation/`)
The entry point for HTTP requests.
- **`controllers/`**: Receives Hono HTTP Context, extracts payloads, passes them to Use Cases, and formats the output.
- **`dtos/`**: Data Transfer Objects defining expected request/response schemas.

### 4. Infrastructure (`src/infrastructure/`)
The implementation details and external integrations.
- **`gateways/`**: Concrete implementations of Payment Providers (Stripe, Midtrans).
- **`repositories/`**: Supabase specific data access layer (implementing `IOrderRepository`, etc.).
- **`services/`**: Concrete implementations of external services (Outpost webhook sender).
- **`mappers/`**: Translates raw database/gateway responses into strict Domain entities.

## Testing

Because of Clean Architecture, all business logic (Use Cases) can be tested instantly without needing a real database connection or API keys. We use dependency injection to pass mock Repositories and Gateways to the Use Cases.

### Running Tests

To run the test suite and generate coverage reports, run the following from the `supabase/functions/` directory:

```bash
# Requires mock ENV variables for legacy shared tests to start up
SUPABASE_URL="https://mock.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="mock_key" \
SUPABASE_ANON_KEY="mock_key" \
EIMUNISASI_SUPABASE_URL="https://mock.supabase.co" \
EIMUNISASI_SUPABASE_SERVICE_ROLE_KEY="mock_key" \
EIMUNISASI_SUPABASE_ANON_KEY="mock_key" \
deno test -A --coverage=cov_profile

# View the coverage report
deno coverage cov_profile
```

**Current Coverage:** ~96.9% across all business logic (Use Cases).

## Adding a New Payment Gateway

1. Create a new provider file in `src/infrastructure/gateways/providers/my_new_gateway.ts`.
2. Implement the `IPaymentGateway` interface (from `src/domain/gateways/interfaces.ts`).
3. Register your new gateway inside `src/infrastructure/gateways/GatewayAdapter.ts`.
4. The rest of the application (Use Cases, Controllers) will automatically support it without any code changes!
