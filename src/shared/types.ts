// ── Custom column definitions ─────────────────────────────────────────────────

export type ColumnType = "picklist" | "freeform" | "date";

export interface CustomColumnDef {
  id: string;
  name: string;
  type: ColumnType;
  options?: string[];   // Only for type === "picklist"
  order: number;        // 0-based sort order in the table
  enabled: boolean;
}

// ── Language data ─────────────────────────────────────────────────────────────

export interface LanguageEntry {
  name: string;
  bytes: number;
  percentage: number;
  color: string;
}

// ── Per-repo data status ───────────────────────────────────────────────────────

export type DetailStatus = "pending" | "loading" | "done" | "error";

// ── Main repo row shape ────────────────────────────────────────────────────────

export interface RepoInfo {
  repoId: string;
  repoName: string;
  repoWebUrl: string;
  projectName: string;
  defaultBranch: string;
  // Pass 1: commits / branches / PRs
  detailStatus: DetailStatus;
  lastCommitDate?: Date;
  lastCommitUser?: string;
  totalBranches: number;
  openPRCount: number;
  openPRUrl: string;
  // Pass 2: language analysis
  languageStatus: DetailStatus;
  languages: LanguageEntry[];
  // Pass 2: LOC
  locStatus: DetailStatus;
  totalLoc?: number;
  error?: string;
}

// ── Custom column storage ──────────────────────────────────────────────────────

export type RepoCustomValues = Record<string, Record<string, string>>;

// ── Cache entries ──────────────────────────────────────────────────────────────

export interface LanguageCacheEntry {
  languages: LanguageEntry[];
  computedAt: string;  // ISO date string
}

export interface LocCacheEntry {
  loc: number;
  computedAt: string;  // ISO date string
}

export type LanguageCache = Record<string, LanguageCacheEntry>;
export type LocCache = Record<string, LocCacheEntry>;

// ── Scope / project config ─────────────────────────────────────────────────────

export interface RepoSelection {
  repoId: string;
  repoName: string;
  enabled: boolean;
}

export interface ProjectConfig {
  projectId: string;
  projectName: string;
  enabled: boolean;
  includeAllRepos: boolean;
  repos: RepoSelection[];
}

// ── Admin configuration ────────────────────────────────────────────────────────

export interface AdminConfig {
  customColumns: CustomColumnDef[];
  /** "admins_only" = values editable only in the admin hub; "all_contributors" = editable in main hub */
  editPermission: "admins_only" | "all_contributors";
  additionalEditorGroups: string[];
  scope: {
    projects: ProjectConfig[];
    savedAt: string;
  };
  savedAt: string;
}

// ── Sort state ─────────────────────────────────────────────────────────────────

export interface SortState {
  key: string;
  order: "asc" | "desc";
}
