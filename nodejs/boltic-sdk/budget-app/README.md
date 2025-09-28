# Example: Budget Planner App with Boltic Database SDK

Track income and expenses with a lightweight budgeting experience on top of the Boltic Database SDK. This blueprint delivers a responsive UI, summary insights, and REST endpoints so you can log financial activity from any device.

## 🚀 Try It Out

**Local Demo:**
1. `npm install`
2. `npm start`
3. Head to [http://localhost:3000](http://localhost:3000)

Capture budget entries immediately—the frontend and backend ship together and communicate through `/api/budget` routes.

### Budget Dashboard

_Add recurring bills, one-off expenses, and income items while watching totals update in real time._

### Boltic Database View

_Each entry writes directly to your Boltic database, enabling downstream reporting or automations._

## Why Boltic Database SDK?

Boltic SDK abstracts the heavy lifting of database access. Initialize with your API key, and you can create tables, insert records, and run queries with concise method calls. Combine that power with Boltic Serverless to publish production-ready finance tools in record time.

## How This Example Uses Boltic SDK

The handler sets up a `budget_items` table (when allowed), hosts the budgeting UI, and exposes endpoints for inserting entries and fetching rollups.

```js
import { createClient } from '@boltic/sdk';

const boltic = createClient(process.env.BOLTIC_API_KEY, { environment: 'sit' });

// Record an expense
await boltic.records.insert('budget_items', {
  category: 'Marketing subscription',
  entryType: 'expense',
  amount: 125,
  dueDate: new Date('2024-05-31').toISOString(),
});
```

## Boltic SDK Functions Used in `handler.js`

- `createClient(apiKey, options)`: Initializes the SDK client.
- `client.tables.findByName(name)`: Detects whether the budget table already exists.
- `client.tables.create(schema)`: Creates the table with category, amount, entry type, due date, and notes columns.
- `client.records.insert(table, data)`: Stores income or expense entries.
- `client.records.findAll(table, options)`: Returns paginated entries along with server-side summaries.

## Requirements

- Node.js 18+
- Environment variables
  - `BOLTIC_API_KEY`: API token (e.g. `xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxxx`)
  - `BOLTIC_BUDGET_TABLE` (optional): overrides the default `budget_items` table name
  - `BOLTIC_ENVIRONMENT` (optional): Boltic workspace environment (`sit`, `uat`, `prod`, …)

## Install & Local Test

```bash
cd nodejs/boltic-sdk/budget-app
npm install
npm start
```

## Deploy

- Use `blueprint.yaml` for deployment.

## Deploying on Boltic Serverless

Publish your own budgeting blueprint by following the standard Boltic Serverless workflow.

1. **Initialize a git repository**
   ```bash
   mkdir boltic-budget-app && cd boltic-budget-app
   git init --initial-branch=main
   git checkout -b main
   ```
2. **Add core files**
   - `handler.js`
   - `blueprint.yaml`
3. **Stage and commit files**
   ```bash
   git add handler.js blueprint.yaml
   git commit -m "Initial commit for budget app"
   ```
4. **Add the remote repository URL**
   ```bash
   git remote add origin git@ssh.git.boltic.io:<your-repo-id>/boltic-budget-app.git
   ```
5. **Push your changes**
   ```bash
   git push --set-upstream origin main
   ```
6. **Create the serverless app in Boltic Console**
   - Select "Hosted git"
   - Choose Node.js 20, set environment variables, and deploy

## Data Model

```json
{
  "category": "Marketing subscription",
  "entryType": "expense",
  "amount": 125,
  "dueDate": "2024-05-31T00:00:00.000Z",
  "notes": "Annual plan billed in May",
  "createdAt": "2024-05-12T09:30:00.000Z",
  "updatedAt": "2024-05-12T09:30:00.000Z"
}
```

## How to Use This Example

1. Copy the handler, static assets, and blueprint configuration.
2. Configure your Boltic API key (and optional environment/table overrides).
3. Run locally or deploy to Boltic Serverless to share the budgeting UI.
4. Extend the schema or UI—add tags, recurring reminders, or export features as needed.

Leverage this template whenever you need a fast, data-driven budgeting workflow on top of the Boltic Database SDK.
