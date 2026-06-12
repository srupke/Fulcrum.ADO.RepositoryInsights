// Mock for azure-devops-extension-sdk — used by webpack-dev-server in mock mode.

export function init(_options?: { loaded?: boolean }): Promise<void> {
  return Promise.resolve();
}

export function ready(): Promise<void> {
  return Promise.resolve();
}

export function notifyLoadSucceeded(): void {}

export function notifyLoadFailed(_e: Error): void {}

export function getHost() {
  return { id: "mock-host", name: "my-org", type: 1 };
}

export function getWebContext() {
  return {
    account: { id: "mock", name: "my-org" },
    project: { id: "p1", name: "MyProject" },
    user: { id: "mock-user", name: "Dev User", email: "dev@example.com" },
  };
}

// ── In-memory store backing the mock ExtensionDataService ─────────────────────

const _store: Record<string, any> = {
  "admin-config": {
    customColumns: [
      {
        id: "col_dept",
        name: "Department",
        type: "picklist",
        options: ["IT", "DevOps", "Engineering", "Finance"],
        order: 0,
        enabled: true,
      },
      {
        id: "col_domain",
        name: "Business Domain",
        type: "picklist",
        options: ["Finance", "Scheduling", "Sales", "Operations"],
        order: 1,
        enabled: true,
      },
      {
        id: "col_owner",
        name: "Team Owner",
        type: "freeform",
        order: 2,
        enabled: true,
      },
    ],
    editPermission: "all_contributors",
    additionalEditorGroups: [],
    scope: { projects: [], savedAt: "" },
    savedAt: new Date().toISOString(),
  },

  "repo-custom-values": {
    r1: { col_dept: "Engineering", col_domain: "Sales",       col_owner: "Alice Johnson" },
    r2: { col_dept: "DevOps",      col_domain: "Finance",     col_owner: "Bob Smith" },
    r3: { col_dept: "Engineering", col_domain: "Scheduling",  col_owner: "Carol White" },
    r4: { col_dept: "IT",          col_domain: "Operations",  col_owner: "Dave Brown" },
    r5: { col_dept: "Engineering", col_domain: "Sales",       col_owner: "Eve Davis" },
    r6: { col_dept: "DevOps",      col_domain: "Operations",  col_owner: "Bob Smith" },
    r7: { col_dept: "Finance",     col_domain: "Finance",     col_owner: "Frank Lee" },
    r8: { col_dept: "IT",          col_domain: "Scheduling",  col_owner: "Alice Johnson" },
    r9: { col_dept: "Engineering", col_domain: "Sales",       col_owner: "Dave Brown" },
  },

  "language-cache": {
    r1: {
      languages: [
        { name: "TypeScript", bytes: 45200, percentage: 63.5, color: "#3178c6" },
        { name: "SCSS",       bytes: 12800, percentage: 18.0, color: "#c6538c" },
        { name: "HTML",       bytes:  7600, percentage: 10.7, color: "#e34c26" },
        { name: "JavaScript", bytes:  5500, percentage:  7.7, color: "#f1e05a" },
      ],
      computedAt: new Date().toISOString(),
    },
    r2: {
      languages: [
        { name: "C#",   bytes: 92400, percentage: 74.2, color: "#178600" },
        { name: "YAML", bytes: 18300, percentage: 14.7, color: "#cb171e" },
        { name: "JSON", bytes:  9200, percentage:  7.4, color: "#292929" },
        { name: "SQL",  bytes:  4600, percentage:  3.7, color: "#e38c00" },
      ],
      computedAt: new Date().toISOString(),
    },
    r3: {
      languages: [
        { name: "TypeScript", bytes: 28100, percentage: 55.2, color: "#3178c6" },
        { name: "JavaScript", bytes: 12400, percentage: 24.4, color: "#f1e05a" },
        { name: "CSS",        bytes:  7900, percentage: 15.5, color: "#563d7c" },
        { name: "HTML",       bytes:  2500, percentage:  4.9, color: "#e34c26" },
      ],
      computedAt: new Date().toISOString(),
    },
    r4: {
      languages: [
        { name: "Python",     bytes: 68000, percentage: 61.8, color: "#3572A5" },
        { name: "Shell",      bytes: 22000, percentage: 20.0, color: "#89e051" },
        { name: "YAML",       bytes: 12000, percentage: 10.9, color: "#cb171e" },
        { name: "Dockerfile", bytes:  8000, percentage:  7.3, color: "#384d54" },
      ],
      computedAt: new Date().toISOString(),
    },
    r5: {
      languages: [
        { name: "TypeScript", bytes: 34500, percentage: 71.2, color: "#3178c6" },
        { name: "JavaScript", bytes:  8200, percentage: 16.9, color: "#f1e05a" },
        { name: "CSS",        bytes:  5800, percentage: 12.0, color: "#563d7c" },
      ],
      computedAt: new Date().toISOString(),
    },
    r6: {
      languages: [
        { name: "PowerShell", bytes: 18400, percentage: 52.3, color: "#012456" },
        { name: "YAML",       bytes:  9800, percentage: 27.8, color: "#cb171e" },
        { name: "HCL",        bytes:  6000, percentage: 17.0, color: "#844FBA" },
        { name: "Shell",      bytes:   980, percentage:  2.8, color: "#89e051" },
      ],
      computedAt: new Date().toISOString(),
    },
    r7: {
      languages: [
        { name: "C#",   bytes: 148000, percentage: 82.4, color: "#178600" },
        { name: "XML",  bytes:  24000, percentage: 13.4, color: "#0060ac" },
        { name: "SQL",  bytes:   7600, percentage:  4.2, color: "#e38c00" },
      ],
      computedAt: new Date().toISOString(),
    },
    r8: {
      languages: [
        { name: "Markdown",   bytes: 62000, percentage: 88.2, color: "#083fa1" },
        { name: "HTML",       bytes:  5200, percentage:  7.4, color: "#e34c26" },
        { name: "JavaScript", bytes:  3100, percentage:  4.4, color: "#f1e05a" },
      ],
      computedAt: new Date().toISOString(),
    },
    r9: {
      languages: [
        { name: "TypeScript", bytes: 52800, percentage: 68.1, color: "#3178c6" },
        { name: "JavaScript", bytes: 14200, percentage: 18.3, color: "#f1e05a" },
        { name: "YAML",       bytes:  6400, percentage:  8.3, color: "#cb171e" },
        { name: "Dockerfile", bytes:  4100, percentage:  5.3, color: "#384d54" },
      ],
      computedAt: new Date().toISOString(),
    },
  },

  "loc-cache": {
    r1: { loc:  12480, computedAt: new Date().toISOString() },
    r2: { loc:  31250, computedAt: new Date().toISOString() },
    r3: { loc:   8740, computedAt: new Date().toISOString() },
    r4: { loc:  18620, computedAt: new Date().toISOString() },
    r5: { loc:   5430, computedAt: new Date().toISOString() },
    r6: { loc:   2180, computedAt: new Date().toISOString() },
    r7: { loc:  44100, computedAt: new Date().toISOString() },
    r8: { loc:    340, computedAt: new Date().toISOString() },
    r9: { loc:  14920, computedAt: new Date().toISOString() },
  },
};

export async function getService(_serviceId: string): Promise<any> {
  return {
    getDataManager: async () => ({
      getValue: async (key: string) => _store[key] ?? null,
      setValue: async (key: string, value: any) => {
        _store[key] = value;
      },
    }),
  };
}
