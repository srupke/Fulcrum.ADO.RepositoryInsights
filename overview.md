# Fulcrum Repository Insights

Adds a **Repo Insights** hub to the Azure Repos section and a **Repo Insights Admin** page to Project Settings. Get a full-picture view of every repository in your project — language breakdown, lines of code, last commit details, and up to 10 custom metadata columns your team defines.

## Repository Table

Select a project (or configure a multi-project scope) and a sortable table loads automatically, showing every repository with:

- **Repository name** — links directly to the repo
- **Default branch**
- **Last commit date and author**
- **Total branches**
- **Open pull requests** — click the count to jump to the active PR list
- **Language summary** — GitHub-style colour bar with per-language percentages
- **Lines of code** — computed from the repo tree and cached for 24 hours
- **Up to 10 custom columns** — picklist, free-form text, or date fields defined by your team

All columns are sortable. Custom picklist columns also support filtering via the filter bar above the table. A summary card above the table shows aggregate repository count, total lines of code, and a combined language breakdown bar across all repositories.

![The Repository Insights hub showing 9 repositories with language colour bars, lines of code, last commit details, and custom metadata columns for Department, Business Domain, and Team Owner. A summary card above the table shows 9 repositories, 138,060 total lines of code, and an aggregate language breakdown.](https://raw.githubusercontent.com/srupke/Fulcrum.ADO.RepositoryInsights/main/images/insights-hub.png)

## Custom Column Values

If the administrator has set edit permissions to **All contributors**, any user can click a custom column cell and edit the value directly in the hub. Values are stored per-repository in the ADO extension data service and persist across sessions.

## Administration (Project Settings → Repo Insights Admin)

Project administrators access the admin hub under **Project Settings** to:

- **Define custom columns** — set the name, type (picklist / freeform / date), and the list of allowed values for picklist columns. Reorder or disable columns at any time. Maximum 10 columns.
- **Control edit permissions** — choose whether custom column values are editable only by admins (via this page) or by all contributors directly in the main hub.
- **Configure repository scope** — restrict the hub to specific projects and repositories. When a scope is configured the hub loads those repositories automatically; when no scope is set, users pick a project from a dropdown.

![The Repository Insights Administration page showing three defined custom columns (Department, Business Domain, Team Owner), the Edit Permissions section with All contributors selected, and the Repository Scope section listing MyProject, AnotherProject, and DevOps.](https://raw.githubusercontent.com/srupke/Fulcrum.ADO.RepositoryInsights/main/images/admin-hub.png)

## Language Analysis & LOC

Language data is derived from the repository file tree using file-extension to language mapping (compatible with GitHub Linguist). Lines of code are computed by fetching code files in batches (up to 100 per repo) and counting newlines. Both values are cached for 24 hours in the extension data service to avoid repeated API calls.

## Export

Click **Export CSV** to download the full table — including all custom column values — as a CSV file.
