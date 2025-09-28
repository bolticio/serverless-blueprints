# Example: Todo Management App with Boltic Database SDK

Keep track of tasks with a fully hosted todo manager built on the Boltic Database SDK. This blueprint bundles a streamlined UI and REST API so you can add notes, due dates, and completion states in one place.

## 🚀 Try It Out

**Local Demo:**
1. `npm install`
2. `npm start`
3. Open [http://localhost:3000](http://localhost:3000)

The single-page app launches immediately, backed by the same `/api/todos` endpoints you deploy to Boltic.

### Todo Workspace

_Create, edit, filter, and complete todos with inline forms, due date pickers, and status badges._

### Boltic Database View

_Every change persists to your Boltic database so you can trigger automations, dashboards, or integrations._

## Why Boltic Database SDK?

Boltic SDK offers a lightweight way to interact with your cloud database. Initialize the client with an API key and you gain access to typed helpers for tables and records—perfect for serverless apps that need agility without infrastructure overhead.

## How This Example Uses Boltic SDK

The handler provisions a `todos` table (where supported), exposes CRUD routes, and serves the UI assets that call those endpoints.

```js
import { createClient } from '@boltic/sdk';

const boltic = createClient(process.env.BOLTIC_API_KEY, { environment: 'uat' });

// Mark a todo as completed
await boltic.records.updateById('todos', todoId, { completed: true, updatedAt: new Date().toISOString() });
```

## Boltic SDK Functions Used in `handler.js`

- `createClient(apiKey, options)`: Initializes the Boltic client.
- `client.tables.findByName(name)`: Checks whether the todo table exists.
- `client.tables.create(schema)`: Creates the table with columns such as `title`, `notes`, and `dueDate`.
- `client.records.findAll(table, options)`: Lists todos with optional filters (e.g. `completed=true`).
- `client.records.findOne(table, id)`: Retrieves a single todo.
- `client.records.insert(table, data)`: Adds a new todo.
- `client.records.updateById(table, id, data)`: Updates title, notes, due date, or completion status.
- `client.records.deleteById(table, id)`: Removes a todo.

## Requirements

- Node.js 18+
- Environment variables
  - `BOLTIC_API_KEY`: API token (e.g. `xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxxx`)
  - `BOLTIC_TABLE_NAME` (optional): overrides the default `todos` table name
  - `BOLTIC_ENVIRONMENT` (optional): Boltic workspace environment (`uat`, `sit`, `prod`, …)

## Install & Local Test

```bash
cd nodejs/boltic-sdk/todo-app
npm install
npm start
```

## Deploy

- Use `blueprint.yaml` for deployment.

## Deploying on Boltic Serverless

Package this folder as a Boltic Serverless blueprint and publish a collaborative task list for your team.

1. **Initialize a git repository**
   ```bash
   mkdir boltic-todo-app && cd boltic-todo-app
   git init --initial-branch=main
   git checkout -b main
   ```
2. **Add core files**
   - `handler.js`
   - `blueprint.yaml`
3. **Stage and commit files**
   ```bash
   git add handler.js blueprint.yaml
   git commit -m "Initial commit for todo app"
   ```
4. **Add the remote repository URL**
   ```bash
   git remote add origin git@ssh.git.boltic.io:<your-repo-id>/boltic-todo-app.git
   ```
5. **Push your changes**
   ```bash
   git push --set-upstream origin main
   ```
6. **Create the serverless app in Boltic Console**
   - Select "Hosted git"
   - Choose Node.js 20 and configure environment variables

## Data Model

```json
{
  "title": "Write release notes",
  "notes": "Include new pricing details",
  "completed": false,
  "dueDate": "2024-06-01T17:00:00.000Z",
  "createdAt": "2024-05-01T12:00:00.000Z",
  "updatedAt": "2024-05-01T12:00:00.000Z"
}
```

## How to Use This Example

1. Copy the handler, UI, and blueprint files.
2. Configure environment variables for your Boltic workspace.
3. Deploy or run locally to test the todo workflow.
4. Extend the schema or interface—add tags, priority levels, or user assignments as needed.

Use this blueprint whenever you need a lightweight task tracker powered by the Boltic Database SDK.
