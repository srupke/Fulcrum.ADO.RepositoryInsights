# Fulcrum Repository Insights

An Azure DevOps extension that adds a **Repo Insights** hub to the Repos section. It shows every repository in the selected project with language breakdown, lines of code, commit and branch metrics, open pull request counts, and up to 10 team-defined custom metadata columns.

---

## Features

### Repository Table

Select a project from the dropdown (or configure a multi-project scope in the admin hub) and a sortable table loads automatically. Every repository appears with the following columns:

| Column | Notes |
|---|---|
| **Repository** | Hyperlink to the repository |
| **Default Branch** | Name of the default branch |
| **Last Commit** | Date and author of the most recent commit on the default branch |
| **Branches** | Total branch count |
| **Open PRs** | Count of active pull requests — click to open the PR list |
| **Languages** | GitHub-style colour bar with per-language percentages |
| **Lines of Code** | Estimated LOC, computed from the file tree and cached for 24 hours |
| **Custom columns** | Up to 10 team-defined columns (see below) |

All columns are sortable by clicking the column header. Custom picklist columns also support filtering via the filter bar above the table. A summary card above the table aggregates repository count, total lines of code, and a combined language breakdown bar across all repositories.

![The Repository Insights hub showing 9 repositories with language colour bars, lines of code, last commit details, and custom metadata columns for Department, Business Domain, and Team Owner. A summary card above the table shows 9 repositories, 138,060 total lines of code, and an aggregate language breakdown.](images/insights-hub.png)

### Language Summary

The **Languages** column renders a proportional colour bar matching GitHub's Linguist palette. Hover segments to see exact percentages. Language data is derived from the repository file tree using a file-extension to language mapping; no repository content is downloaded to compute percentages. Lines of code are computed by fetching code files in batches (up to 100 per repo) and counting newlines. Both values are cached for 24 hours in the ADO extension data service to minimize API calls.

### Custom Columns

Administrators define up to 10 custom metadata columns in the **Repo Insights Admin** page under Project Settings. Each column has a name, a type, and optional configuration:

| Type | Behaviour |
|---|---|
| **Picklist** | Renders as a dropdown with a fixed list of allowed values |
| **Freeform** | Free-text input, accepts any string |
| **Date** | Date picker, stored as YYYY-MM-DD |

Column order, enabled state, and allowed picklist values are configurable at any time. Values are stored per-repository in the extension data service and persist across sessions.

Depending on the edit permission setting, values can be edited inline directly in the hub table — click any custom column cell to open an edit popover.

### Export

Click **Export CSV** to download the full table — including all custom column values — as a UTF-8 CSV file named `repo-insights-YYYY-MM-DD.csv`.

### Administration (Project Settings → Repo Insights Admin)

Project administrators access the admin hub under **Project Settings** to configure three areas:

**Custom Columns** — Define, reorder, enable or disable columns. Set the column name, type, and for picklist columns the list of allowed values. Maximum 10 columns.

**Edit Permissions** — Choose who can edit custom column values:
- **All contributors** — any user with hub access can click a cell and edit the value in place.
- **Admins only** — values can only be set from this admin page.

**Repository Scope** — Restrict the hub to specific projects and repositories. When a scope is configured the hub loads those repositories automatically. When no scope is set, the user selects a project from a dropdown each visit. Per-project options:
- **All repositories (default)** — every repository in the project is shown.
- **Select specific repositories** — pick individual repositories from a searchable, filterable list.

![The Repository Insights Administration page showing three defined custom columns (Department, Business Domain, Team Owner), the Edit Permissions section with All contributors selected, and the Repository Scope section listing MyProject, AnotherProject, and DevOps.](images/admin-hub.png)

---

## Local Development

### Prerequisites

```
node >= 18
npm >= 9
```

Install dependencies once:

```bash
npm install
```

### Run with Mock Data (F5 in VS Code)

The project ships with a local mock that replaces the Azure DevOps SDK and API with realistic stub data, so you can develop without a live organization.

Press **F5** in VS Code (or run `npm run dev` in a terminal). The hub opens automatically at `http://localhost:3000/hub/hub.html`. To view the admin page navigate to `http://localhost:3000/admin/admin.html`.

The mock includes:

- **9 repositories** with realistic names, branches, commit history, and open PR counts
- **Pre-computed language and LOC data** (cache always reads as fresh so background computation never runs in dev mode)
- **3 pre-defined custom columns** — Department (picklist), Business Domain (picklist), Team Owner (freeform)
- **Pre-populated custom column values** across all 9 repositories
- In-memory extension data storage so admin saves and column edits persist during a dev session

To start the dev server manually:

```bash
npm run dev          # kills any process on port 3000, then starts webpack-dev-server with mock data
npm start            # equivalent, without the port-kill step
```

### Build

```bash
npm run build        # production build → dist/
npm run build:dev    # development build with source maps → dist/
npm run watch        # development build, rebuild on file change
```

---

## Publishing to the Marketplace

### Prerequisites

**1. Visual Studio Marketplace publisher account**

Create a publisher at [https://marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage). The publisher ID in `vss-extension.json` is `ScottRupke` — it must match the ID you register exactly.

**2. Personal Access Token (PAT)**

In Azure DevOps, create a PAT with the following scope:

- Organization: **All accessible organizations**
- Scope: **Marketplace → Publish**

Copy the token; you will pass it to `tfx` at publish time.

**3. tfx-cli** is already included as a dev dependency (`npm run package` and `npm run publish` use it via `npx`).

---

### Publish as Private (organization-only)

A private extension is only visible to organizations you explicitly share it with. This is the default (`"public": false` in `vss-extension.json`).

**Step 1 — Build and package**

```bash
npm run package
```

This runs `npm run build` followed by `tfx extension create`, producing a `.vsix` file in the `packages/` folder (e.g. `packages/ScottRupke.fulcrum-repo-languages-1.0.0.vsix`).

**Step 2 — Publish**

```bash
npx tfx extension publish \
  --manifest-globs vss-extension.json \
  --token <your-PAT>
```

Or using the npm script (builds and publishes in one step — you will be prompted for the PAT interactively):

```bash
npm run publish
```

**Step 3 — Share with your organization**

After publishing, the extension is visible only to you. Share it with your Azure DevOps organization from the Marketplace publisher portal, or via CLI:

```bash
npx tfx extension share \
  --publisher ScottRupke \
  --extension-id fulcrum-repo-languages \
  --share-with my-org \
  --token <your-PAT>
```

**Step 4 — Install in the organization**

In the target Azure DevOps organization, go to **Organization Settings → Extensions → Shared** and click **Install** next to the extension.

---

### Publish as Public (available to everyone)

> Public extensions are visible on the Marketplace to any Azure DevOps user. Ensure the extension is production-ready before making it public.

**Step 1 — Set `public: true`**

Edit `vss-extension.json`:

```json
"public": true,
```

**Step 2 — Verify the publisher is verified**

Microsoft requires a verified publisher for public extensions. Submit your publisher for verification at [https://marketplace.visualstudio.com/manage/publishers](https://marketplace.visualstudio.com/manage/publishers). Verification is a manual review process that can take a few days.

**Step 3 — Package and publish**

```bash
npm run package
npx tfx extension publish \
  --manifest-globs vss-extension.json \
  --token <your-PAT>
```

The extension will appear on the public Marketplace after passing Microsoft's automated content scan (usually within minutes for updates, longer for a first-time public publish).

---

### Updating an Existing Extension

Increment the `version` field in `vss-extension.json` (semver), then publish again:

```bash
npm run publish
```

`tfx` will update the existing listing in place. Installed instances in all organizations will be updated automatically by Azure DevOps.

---

### Scopes

The extension declares the `vso.code` and `vso.project` scopes. `vso.code` grants read access to repositories, branches, commits, pull requests, and file trees. `vso.project` is required to enumerate all projects in the organization for the scope configuration panel. No write scope is needed — custom column values are stored in the extension data service, which is covered by the base extension permissions.

---

## Project Structure

```
src/
  hub/
    hub.tsx        # Main React component — all UI and API logic
    hub.scss       # Component styles (CSS custom properties for ADO theming)
    hub.html       # Entry HTML page
  admin/
    admin.tsx      # Admin configuration hub (custom columns, permissions, scope)
    admin.scss     # Admin styles
    admin.html     # Admin entry HTML page
  shared/
    types.ts       # Shared TypeScript interfaces (RepoInfo, AdminConfig, etc.)
    languages.ts   # Language colour map and file-extension → language mapping
  mocks/
    sdk.ts         # Mock Azure DevOps Extension SDK with in-memory data store
    api.ts         # Mock getClient() — routes to git or core mock based on client class
    git-client.ts  # Stub data: repos, commits, branches, PRs, file trees
    core-client.ts # Stub data: ADO projects list
scripts/
  dev-start.js     # Kills port 3000, then starts webpack-dev-server
  gen-logo.py      # Regenerates images/logo.png (requires Python + Pillow)
images/
  logo.png         # Extension marketplace icon (256×256 PNG)
vss-extension.json # Extension manifest
webpack.config.js  # Webpack 5 config; --env mock enables stub aliases
```

## Tech Stack

| | |
|---|---|
| Framework | React 16 (required by azure-devops-ui v2) |
| UI Components | azure-devops-ui v2 |
| ADO SDK | azure-devops-extension-sdk v4 |
| ADO API | azure-devops-extension-api v4 (`GitRestClient`, `CoreRestClient`) |
| Storage | ADO Extension Data Service (`IExtensionDataService`) |
| Bundler | Webpack 5 |
| Language | TypeScript 5 |
