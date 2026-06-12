// Mock GitRestClient — realistic data to exercise every table column.

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function commit(id: string, message: string, authorName: string, daysBack: number) {
  const date = daysAgo(daysBack);
  return {
    commitId: id,
    comment: message,
    author:    { name: authorName, email: `${authorName.toLowerCase().replace(/ /g, ".")}@example.com`, date },
    committer: { name: authorName, email: `${authorName.toLowerCase().replace(/ /g, ".")}@example.com`, date },
    url: "#",
  };
}

const REPOS = [
  { id: "r1", name: "web-app",        defaultBranch: "refs/heads/main",    webUrl: "#" },
  { id: "r2", name: "api-service",    defaultBranch: "refs/heads/main",    webUrl: "#" },
  { id: "r3", name: "mobile-client",  defaultBranch: "refs/heads/develop", webUrl: "#" },
  { id: "r4", name: "data-pipeline",  defaultBranch: "refs/heads/main",    webUrl: "#" },
  { id: "r5", name: "shared-lib",     defaultBranch: "refs/heads/master",  webUrl: "#" },
  { id: "r6", name: "devops-scripts", defaultBranch: "refs/heads/main",    webUrl: "#" },
  { id: "r7", name: "legacy-billing", defaultBranch: "refs/heads/master",  webUrl: "#" },
  { id: "r8", name: "documentation",  defaultBranch: "refs/heads/main",    webUrl: "#" },
  { id: "r9", name: "auth-service",   defaultBranch: "refs/heads/main",    webUrl: "#" },
];

const BRANCHES: Record<string, string[]> = {
  r1: ["main", "develop", "release/v2.0", "feature/dashboard"],
  r2: ["main", "develop", "hotfix/rate-limiter"],
  r3: ["develop", "feature/offline-mode", "feature/push-notifications"],
  r4: ["main", "feature/s3-sink"],
  r5: ["master", "feature/datepicker", "feature/virtualization"],
  r6: ["main"],
  r7: ["master", "legacy/v1"],
  r8: ["main"],
  r9: ["main", "hotfix/jwt-patch", "feature/oidc"],
};

const OPEN_PRS: Record<string, number> = {
  r1: 3, r2: 1, r3: 5, r4: 0,
  r5: 2, r6: 0, r7: 0, r8: 0, r9: 4,
};

const LAST_COMMITS: Record<string, ReturnType<typeof commit>> = {
  r1: commit("a1b2c3", "feat: add dashboard filters for date range",       "Alice Johnson",  1),
  r2: commit("b1c2d3", "feat: add /v2/reports endpoint with pagination",   "Bob Smith",      2),
  r3: commit("c1d2e3", "feat: offline mode with local cache",              "Carol White",    1),
  r4: commit("d1e2f3", "chore: bump Spark version to 3.5.1",              "Dave Brown",     8),
  r5: commit("e1f2g3", "feat: add DateRangePicker component",              "Eve Davis",      0),
  r6: commit("f1g2h3", "ci: parallelize test matrix across 4 agents",     "Bob Smith",      5),
  r7: commit("g1h2i3", "fix: handle null customer in billing export",      "Frank Lee",     45),
  r8: commit("h1i2j3", "docs: update API reference for v2 endpoints",      "Alice Johnson", 12),
  r9: commit("i1j2k3", "feat: OIDC provider support for SSO",             "Alice Johnson",  2),
};

// Lightweight mock file items — language cache is pre-populated so getItems
// is only called if the cache is cleared or expired in dev mode.
const MOCK_ITEMS: Record<string, any[]> = {
  r1: [
    { path: "/src/App.tsx",           isFolder: false, size: 4200 },
    { path: "/src/index.tsx",         isFolder: false, size:  820 },
    { path: "/src/styles/main.scss",  isFolder: false, size: 3100 },
    { path: "/public/index.html",     isFolder: false, size: 1200 },
    { path: "/src/utils/api.js",      isFolder: false, size: 2800 },
  ],
  r2: [
    { path: "/src/Controllers/ReportController.cs", isFolder: false, size: 18000 },
    { path: "/src/Services/BillingService.cs",      isFolder: false, size: 22000 },
    { path: "/azure-pipelines.yml",                 isFolder: false, size:  3400 },
    { path: "/schema.sql",                          isFolder: false, size:  8200 },
  ],
  r3: [
    { path: "/src/app.tsx",           isFolder: false, size: 6200 },
    { path: "/src/screens/Home.tsx",  isFolder: false, size: 4100 },
    { path: "/src/styles/theme.css",  isFolder: false, size: 2400 },
    { path: "/index.html",            isFolder: false, size: 1100 },
  ],
  r4: [
    { path: "/pipeline/etl.py",       isFolder: false, size: 14000 },
    { path: "/scripts/run.sh",        isFolder: false, size:  4200 },
    { path: "/docker-compose.yml",    isFolder: false, size:  2800 },
    { path: "/Dockerfile",            isFolder: false, size:   980 },
  ],
  r5: [
    { path: "/src/index.ts",          isFolder: false, size:  6400 },
    { path: "/src/hooks/useAsync.ts", isFolder: false, size:  3200 },
    { path: "/src/components/DateRangePicker.tsx", isFolder: false, size: 8800 },
    { path: "/src/styles/base.css",   isFolder: false, size:  2200 },
  ],
  r6: [
    { path: "/scripts/deploy.ps1",   isFolder: false, size:  8200 },
    { path: "/scripts/setup.ps1",    isFolder: false, size:  6100 },
    { path: "/pipelines/ci.yml",     isFolder: false, size:  4400 },
    { path: "/terraform/main.tf",    isFolder: false, size:  5200 },
  ],
  r7: [
    { path: "/src/Billing.cs",       isFolder: false, size: 42000 },
    { path: "/src/Invoice.cs",       isFolder: false, size: 38000 },
    { path: "/config/app.config",    isFolder: false, size:  6200 },
    { path: "/db/schema.sql",        isFolder: false, size:  7400 },
  ],
  r8: [
    { path: "/docs/api.md",          isFolder: false, size: 28000 },
    { path: "/docs/setup.md",        isFolder: false, size: 14000 },
    { path: "/index.html",           isFolder: false, size:  4200 },
  ],
  r9: [
    { path: "/src/auth.ts",          isFolder: false, size: 12400 },
    { path: "/src/jwt.ts",           isFolder: false, size:  8800 },
    { path: "/src/oidc.ts",          isFolder: false, size: 14200 },
    { path: "/docker-compose.yml",   isFolder: false, size:  2400 },
    { path: "/Dockerfile",           isFolder: false, size:   820 },
  ],
};

export const mockGitClient = {
  getRepositories: async (_project: string) => {
    await delay(400);
    return REPOS;
  },

  getCommits: async (repoId: string, _criteria: any, _project: string) => {
    await delay(Math.random() * 200 + 100);
    const c = LAST_COMMITS[repoId];
    return c ? [c] : [];
  },

  getRefs: async (repoId: string, _project: string, filter?: string) => {
    await delay(150);
    const branches = BRANCHES[repoId] ?? ["main"];
    const makeRef = (b: string) => ({ name: `refs/heads/${b}`, isLocked: false });
    if (!filter) return branches.map(makeRef);
    const name = filter.replace(/^heads\//, "");
    return branches.includes(name) ? [makeRef(name)] : [];
  },

  getPullRequests: async (repoId: string, _criteria: any, _project: string) => {
    await delay(Math.random() * 150 + 80);
    const count = OPEN_PRS[repoId] ?? 0;
    return Array.from({ length: count }, (_, i) => ({ pullRequestId: i + 1 }));
  },

  getItems: async (repoId: string, _project: string) => {
    await delay(300);
    return MOCK_ITEMS[repoId] ?? [];
  },

  getItemContent: async (_repoId: string, _path: string) => {
    await delay(100);
    // Return a minimal UTF-8 buffer representing a few lines of code.
    return new TextEncoder().encode("line1\nline2\nline3\n").buffer;
  },
};
