import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import {
  GitRestClient,
  GitRepository,
  GitCommitRef,
  GitQueryCommitsCriteria,
  GitVersionType,
  GitVersionOptions,
  PullRequestStatus,
  GitPullRequestSearchCriteria,
  VersionControlRecursionType,
  GitVersionDescriptor,
} from "azure-devops-extension-api/Git";
import { CoreRestClient } from "azure-devops-extension-api/Core/CoreClient";
import { Page } from "azure-devops-ui/Page";
import { Header, TitleSize } from "azure-devops-ui/Header";
import { Card } from "azure-devops-ui/Card";
import {
  Table,
  ITableColumn,
  SimpleTableCell,
  SortOrder,
  ColumnSorting,
} from "azure-devops-ui/Table";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { Button } from "azure-devops-ui/Button";
import { Spinner, SpinnerSize } from "azure-devops-ui/Spinner";
import "azure-devops-ui/Core/override.css";
import "./hub.scss";

import {
  AdminConfig,
  CustomColumnDef,
  LanguageCache,
  LanguageEntry,
  LocCache,
  RepoCustomValues,
  RepoInfo,
} from "../shared/types";
import {
  BINARY_EXTENSIONS,
  EXTENSION_TO_LANGUAGE,
  LANGUAGE_COLORS,
  getFileExtension,
} from "../shared/languages";

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_CONFIG_KEY   = "admin-config";
const CUSTOM_VALUES_KEY  = "repo-custom-values";
const LANGUAGE_CACHE_KEY = "language-cache";
const LOC_CACHE_KEY      = "loc-cache";
const LOC_CACHE_TTL_MS   = 24 * 60 * 60 * 1000;
const LANG_CACHE_TTL_MS  = 24 * 60 * 60 * 1000;

// ── Storage helpers ───────────────────────────────────────────────────────────

async function loadFromStorage<T>(key: string): Promise<T | null> {
  try {
    const svc = await (SDK as any).getService("ms.vss-features.extension-data-service");
    const mgr = await svc.getDataManager();
    return ((await mgr.getValue(key)) as T) ?? null;
  } catch {
    return null;
  }
}

async function saveToStorage<T>(key: string, value: T): Promise<void> {
  try {
    const svc = await (SDK as any).getService("ms.vss-features.extension-data-service");
    const mgr = await svc.getDataManager();
    await mgr.setValue(key, value);
  } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isFresh(isoDate: string, ttlMs: number): boolean {
  return Date.now() - new Date(isoDate).getTime() < ttlMs;
}

function formatDate(d: Date): string {
  return (
    d.toLocaleDateString() +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

function branchFromRef(defaultBranch: string | undefined): string {
  return defaultBranch?.replace("refs/heads/", "") || "main";
}

// ── Language computation ──────────────────────────────────────────────────────

async function computeLanguageData(
  gitClient: GitRestClient,
  repoId: string,
  project: string,
  defaultBranch: string
): Promise<LanguageEntry[]> {
  const vd: GitVersionDescriptor = {
    version: defaultBranch,
    versionType: GitVersionType.Branch,
  } as GitVersionDescriptor;

  const items: any[] = await (gitClient as any).getItems(
    repoId, project, "/",
    VersionControlRecursionType.Full,
    false, false, false, false,
    vd
  );

  const byLang: Record<string, number> = {};
  let total = 0;

  for (const item of items) {
    if (item.isFolder || !item.path) continue;
    const ext = getFileExtension(item.path);
    if (!ext || BINARY_EXTENSIONS.has(ext)) continue;
    const lang = EXTENSION_TO_LANGUAGE[ext];
    if (!lang) continue;
    const size: number = item.size ?? 0;
    byLang[lang] = (byLang[lang] ?? 0) + size;
    total += size;
  }

  if (total === 0) return [];

  return Object.entries(byLang)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percentage: (bytes / total) * 100,
      color: LANGUAGE_COLORS[name] ?? LANGUAGE_COLORS["Other"]!,
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .filter((e) => e.percentage >= 0.5);
}

// ── LOC computation ────────────────────────────────────────────────────────────

async function computeLoc(
  gitClient: GitRestClient,
  repoId: string,
  project: string,
  defaultBranch: string
): Promise<number> {
  const vd: GitVersionDescriptor = {
    version: defaultBranch,
    versionType: GitVersionType.Branch,
  } as GitVersionDescriptor;

  const items: any[] = await (gitClient as any).getItems(
    repoId, project, "/",
    VersionControlRecursionType.Full,
    false, false, false, false,
    vd
  );

  const codeFiles = items.filter((item) => {
    if (item.isFolder || !item.path) return false;
    const ext = getFileExtension(item.path);
    if (!ext || BINARY_EXTENSIONS.has(ext)) return false;
    if (!EXTENSION_TO_LANGUAGE[ext]) return false;
    return (item.size ?? 0) > 0 && (item.size ?? 0) <= 500 * 1024;
  });

  const filesToCount = codeFiles.slice(0, 100);
  let totalLines = 0;

  for (let i = 0; i < filesToCount.length; i += 10) {
    const batch = filesToCount.slice(i, i + 10);
    const counts = await Promise.all(
      batch.map(async (item) => {
        try {
          const buf: ArrayBuffer = await (gitClient as any).getItemContent(
            repoId, item.path, project,
            undefined, undefined, undefined, undefined, false,
            vd
          );
          const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
          return (text.match(/\n/g) ?? []).length + 1;
        } catch {
          return 0;
        }
      })
    );
    totalLines += counts.reduce((s, n) => s + n, 0);
  }

  return totalLines;
}

// ── Language Bar ──────────────────────────────────────────────────────────────

const LanguageBar: React.FC<{ languages: LanguageEntry[]; maxLangs?: number }> = ({ languages, maxLangs = 5 }) => {
  if (languages.length === 0) return <span className="secondary-text">—</span>;

  const top = languages.slice(0, maxLangs);
  const otherPct = languages.slice(maxLangs).reduce((s, l) => s + l.percentage, 0);
  if (otherPct > 0.5) {
    top.push({ name: "Other", bytes: 0, percentage: otherPct, color: LANGUAGE_COLORS["Other"]! });
  }

  return (
    <div className="lang-bar-container">
      <div className="lang-bar" title={top.map((l) => `${l.name}: ${l.percentage.toFixed(1)}%`).join(" · ")}>
        {top.map((lang, i) => (
          <div
            key={i}
            className="lang-bar-segment"
            style={{ width: `${lang.percentage}%`, backgroundColor: lang.color }}
          />
        ))}
      </div>
      <div className="lang-labels">
        {top.map((lang, i) => (
          <span key={i} className="lang-label" title={`${lang.name}: ${lang.percentage.toFixed(1)}%`}>
            <span className="lang-dot" style={{ backgroundColor: lang.color }} />
            <span className="lang-name">{lang.name}</span>
            <span className="lang-pct">{lang.percentage.toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
};

// ── Edit Custom Value Modal ───────────────────────────────────────────────────

interface EditState {
  repoId: string;
  repoName: string;
  colDef: CustomColumnDef;
  value: string;
}

const EditModal: React.FC<{
  editState: EditState;
  onSave: () => void;
  onCancel: () => void;
  onChange: (v: string) => void;
}> = ({ editState, onSave, onCancel, onChange }) => {
  const { repoName, colDef, value } = editState;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && colDef.type !== "freeform") { onSave(); e.preventDefault(); }
    if (e.key === "Escape") { onCancel(); e.preventDefault(); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <span className="modal-title">Edit: {colDef.name}</span>
          <button className="modal-close" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <p className="modal-hint">Repository: <strong>{repoName}</strong></p>
          {colDef.type === "picklist" && (
            <select
              className="edit-select"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            >
              <option value="">— None —</option>
              {colDef.options?.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
          {colDef.type === "freeform" && (
            <textarea
              className="edit-textarea"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              autoFocus
            />
          )}
          {colDef.type === "date" && (
            <input
              type="date"
              className="edit-date"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          )}
        </div>
        <div className="modal-footer">
          <Button text="Cancel" onClick={onCancel} />
          <Button text="Save" primary onClick={onSave} />
        </div>
      </div>
    </div>
  );
};

// ── Hub Component ─────────────────────────────────────────────────────────────

const Hub: React.FC = () => {
  // ── Data state ──────────────────────────────────────────────────────────────

  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [adminConfig, setAdminConfig] = useState<AdminConfig | null>(null);
  const [customValues, setCustomValues] = useState<RepoCustomValues>({});
  const [languageCache, setLanguageCache] = useState<LanguageCache>({});
  const [locCache, setLocCache] = useState<LocCache>({});
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [currentProject, setCurrentProject] = useState("MyProject");

  // ── Loading state ────────────────────────────────────────────────────────────

  const [initDone, setInitDone] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [reposLoaded, setReposLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ current: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Sort / filter ────────────────────────────────────────────────────────────

  const [sortKey, setSortKey] = useState<string>("repoName");
  const [sortOrder, setSortOrder] = useState<SortOrder>(SortOrder.ascending);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);

  // ── Edit custom value modal ──────────────────────────────────────────────────

  const [editState, setEditState] = useState<EditState | null>(null);

  // ── Scope config modal ───────────────────────────────────────────────────────

  const [configModalOpen, setConfigModalOpen] = useState(false);

  // ── Refs to avoid stale closures ─────────────────────────────────────────────

  const locComputingRef = useRef<Set<string>>(new Set());
  const langComputingRef = useRef<Set<string>>(new Set());

  // ── SDK init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    SDK.init({ loaded: false }).then(async () => {
      await SDK.ready();

      const webCtx = (SDK as any).getWebContext?.();
      if (webCtx?.project?.name) setCurrentProject(webCtx.project.name);

      const [cfg, vals, langCache, loc, projectList] = await Promise.all([
        loadFromStorage<AdminConfig>(ADMIN_CONFIG_KEY),
        loadFromStorage<RepoCustomValues>(CUSTOM_VALUES_KEY),
        loadFromStorage<LanguageCache>(LANGUAGE_CACHE_KEY),
        loadFromStorage<LocCache>(LOC_CACHE_KEY),
        getClient(CoreRestClient).getProjects().catch(() => []) as Promise<any[]>,
      ]);

      setAdminConfig(cfg);
      setCustomValues(vals ?? {});
      setLanguageCache(langCache ?? {});
      setLocCache(loc ?? {});
      setProjects((projectList as any[]).map((p: any) => ({ id: p.id ?? p.name, name: p.name })));

      SDK.notifyLoadSucceeded();
      setInitDone(true);
    });
  }, []);

  // ── Auto-load when scope is configured ───────────────────────────────────────

  const hasScope = adminConfig?.scope?.projects?.some((p) => p.enabled) ?? false;

  useEffect(() => {
    if (initDone && hasScope) {
      loadAllRepos();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initDone, hasScope]);

  // ── Load repositories ─────────────────────────────────────────────────────────

  const loadAllRepos = useCallback(async () => {
    if (loadingRepos) return;
    setLoadingRepos(true);
    setReposLoaded(false);
    setErrorMsg(null);
    setRepos([]);
    setLoadProgress({ current: 0, total: 0 });
    locComputingRef.current.clear();
    langComputingRef.current.clear();

    try {
      const gitClient = getClient(GitRestClient);
      type Pair = { repo: GitRepository; projectName: string };
      const allPairs: Pair[] = [];

      if (hasScope && adminConfig) {
        for (const pc of adminConfig.scope.projects) {
          if (!pc.enabled) continue;
          const repos: GitRepository[] = await gitClient.getRepositories(pc.projectName);
          const allowed = pc.includeAllRepos
            ? repos
            : repos.filter((r: GitRepository) =>
                pc.repos.find((sel) => sel.repoId === r.id && sel.enabled)
              );
          allPairs.push(...allowed.map((r: GitRepository) => ({ repo: r, projectName: pc.projectName })));
        }
      } else {
        const trimmed = currentProject.trim();
        if (!trimmed) { setLoadingRepos(false); return; }
        const repos: GitRepository[] = await gitClient.getRepositories(trimmed);
        allPairs.push(...repos.map((r: GitRepository) => ({ repo: r, projectName: trimmed })));
      }

      setLoadProgress({ current: 0, total: allPairs.length });

      // Initialise rows with pending status
      const initial: RepoInfo[] = allPairs.map(({ repo, projectName }) => ({
        repoId:          repo.id!,
        repoName:        repo.name!,
        repoWebUrl:      repo.webUrl ?? "#",
        projectName,
        defaultBranch:   branchFromRef(repo.defaultBranch),
        detailStatus:    "loading",
        totalBranches:   0,
        openPRCount:     0,
        openPRUrl:       `${repo.webUrl ?? "#"}/pullrequests?_a=active`,
        languageStatus:  "pending",
        languages:       [],
        locStatus:       "pending",
      }));
      setRepos(initial);

      // Pass 1: commits + branches + PRs in parallel
      await Promise.all(
        allPairs.map(async ({ repo, projectName }, _i) => {
          const repoId = repo.id!;
          const branch = branchFromRef(repo.defaultBranch);

          try {
            const criteria: GitQueryCommitsCriteria = {
              $top: 1,
              itemVersion: {
                version: branch,
                versionType: GitVersionType.Branch,
                versionOptions: GitVersionOptions.None,
              },
            } as GitQueryCommitsCriteria;

            const [commits, allRefs, prs] = await Promise.all([
              gitClient.getCommits(repoId, criteria, projectName).catch(() => [] as GitCommitRef[]),
              gitClient.getRefs(repoId, projectName).catch(() => []),
              gitClient.getPullRequests(
                repoId,
                { status: PullRequestStatus.Active, targetRefName: repo.defaultBranch } as GitPullRequestSearchCriteria,
                projectName
              ).catch(() => []),
            ]);

            const lastCommit = (commits as GitCommitRef[])[0];
            const branchCount = (allRefs as any[]).filter((r: any) =>
              r.name?.startsWith("refs/heads/")
            ).length;

            setRepos((prev) =>
              prev.map((r) =>
                r.repoId === repoId
                  ? {
                      ...r,
                      detailStatus:   "done",
                      lastCommitDate: lastCommit?.committer?.date,
                      lastCommitUser: lastCommit?.committer?.name,
                      totalBranches:  branchCount,
                      openPRCount:    (prs as any[]).length,
                    }
                  : r
              )
            );
          } catch (e: any) {
            setRepos((prev) =>
              prev.map((r) =>
                r.repoId === repoId ? { ...r, detailStatus: "error", error: e.message } : r
              )
            );
          }

          setLoadProgress((prev) => ({ ...prev, current: prev.current + 1 }));
        })
      );

      setReposLoaded(true);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Failed to load repositories.");
    } finally {
      setLoadingRepos(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, adminConfig, hasScope]);

  // ── Pass 2: language + LOC (background, fires after pass 1) ──────────────────

  useEffect(() => {
    if (!reposLoaded || repos.length === 0) return;
    const gitClient = getClient(GitRestClient);

    repos.forEach((repo) => {
      // Language
      if (!langComputingRef.current.has(repo.repoId)) {
        langComputingRef.current.add(repo.repoId);

        const cached = languageCache[repo.repoId];
        if (cached && isFresh(cached.computedAt, LANG_CACHE_TTL_MS)) {
          setRepos((prev) =>
            prev.map((r) =>
              r.repoId === repo.repoId
                ? { ...r, languageStatus: "done", languages: cached.languages }
                : r
            )
          );
        } else {
          setRepos((prev) =>
            prev.map((r) =>
              r.repoId === repo.repoId ? { ...r, languageStatus: "loading" } : r
            )
          );
          computeLanguageData(gitClient, repo.repoId, repo.projectName, repo.defaultBranch)
            .then((langs) => {
              setLanguageCache((prev) => {
                const next = { ...prev, [repo.repoId]: { languages: langs, computedAt: new Date().toISOString() } };
                saveToStorage(LANGUAGE_CACHE_KEY, next);
                return next;
              });
              setRepos((prev) =>
                prev.map((r) =>
                  r.repoId === repo.repoId ? { ...r, languageStatus: "done", languages: langs } : r
                )
              );
            })
            .catch(() => {
              setRepos((prev) =>
                prev.map((r) =>
                  r.repoId === repo.repoId ? { ...r, languageStatus: "error" } : r
                )
              );
            });
        }
      }

      // LOC
      if (!locComputingRef.current.has(repo.repoId)) {
        locComputingRef.current.add(repo.repoId);

        const cached = locCache[repo.repoId];
        if (cached && isFresh(cached.computedAt, LOC_CACHE_TTL_MS)) {
          setRepos((prev) =>
            prev.map((r) =>
              r.repoId === repo.repoId ? { ...r, locStatus: "done", totalLoc: cached.loc } : r
            )
          );
        } else {
          setRepos((prev) =>
            prev.map((r) =>
              r.repoId === repo.repoId ? { ...r, locStatus: "loading" } : r
            )
          );
          computeLoc(gitClient, repo.repoId, repo.projectName, repo.defaultBranch)
            .then((loc) => {
              setLocCache((prev) => {
                const next = { ...prev, [repo.repoId]: { loc, computedAt: new Date().toISOString() } };
                saveToStorage(LOC_CACHE_KEY, next);
                return next;
              });
              setRepos((prev) =>
                prev.map((r) =>
                  r.repoId === repo.repoId ? { ...r, locStatus: "done", totalLoc: loc } : r
                )
              );
            })
            .catch(() => {
              setRepos((prev) =>
                prev.map((r) =>
                  r.repoId === repo.repoId ? { ...r, locStatus: "error" } : r
                )
              );
            });
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reposLoaded]);

  // ── Save custom value ─────────────────────────────────────────────────────────

  const handleSaveEdit = useCallback(async () => {
    if (!editState) return;
    const { repoId, colDef, value } = editState;
    setCustomValues((prev) => {
      const next: RepoCustomValues = {
        ...prev,
        [repoId]: { ...(prev[repoId] ?? {}), [colDef.id]: value },
      };
      saveToStorage(CUSTOM_VALUES_KEY, next);
      return next;
    });
    setEditState(null);
  }, [editState]);

  // ── Export CSV ───────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const enabledCols = (adminConfig?.customColumns ?? []).filter((c) => c.enabled);
    const headers = [
      "Repository", "Project", "Default Branch", "URL",
      "Last Commit Date", "Last Commit User",
      "Total Branches", "Open PRs",
      "Top Language", "Total LOC",
      ...enabledCols.map((c) => c.name),
    ];
    const rows = displayItems.map((r) => [
      esc(r.repoName),
      esc(r.projectName),
      esc(r.defaultBranch),
      esc(r.repoWebUrl),
      esc(r.lastCommitDate ? formatDate(r.lastCommitDate) : ""),
      esc(r.lastCommitUser ?? ""),
      String(r.totalBranches),
      String(r.openPRCount),
      esc(r.languages[0]?.name ?? ""),
      String(r.totalLoc ?? ""),
      ...enabledCols.map((c) => esc(customValues[r.repoId]?.[c.id] ?? "")),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "repository-languages.csv";
    a.click();
    URL.revokeObjectURL(url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos, customValues, adminConfig]);

  // ── Derived: enabled custom columns ──────────────────────────────────────────

  const enabledCustomCols = useMemo(
    () =>
      (adminConfig?.customColumns ?? [])
        .filter((c) => c.enabled)
        .sort((a, b) => a.order - b.order),
    [adminConfig]
  );

  const canEdit = adminConfig?.editPermission === "all_contributors";
  const isMultiProject = (adminConfig?.scope?.projects?.filter((p) => p.enabled).length ?? 0) > 1;

  // ── Sort / filter items ───────────────────────────────────────────────────────

  const sortKeys = useMemo(() => {
    const keys = [
      ...(isMultiProject ? ["projectName"] : []),
      "repoName",
      "defaultBranch",
      "lastCommitDate",
      "lastCommitUser",
      "totalBranches",
      "openPRs",
      "",        // language bar — not sortable
      "totalLoc",
      ...enabledCustomCols.map((c) => `custom_${c.id}`),
    ];
    return keys;
  }, [isMultiProject, enabledCustomCols]);

  const handleSortRef = useRef<(colIdx: number, order: SortOrder) => void>(() => {});
  handleSortRef.current = (colIdx: number, order: SortOrder) => {
    const key = sortKeys[colIdx];
    if (key) {
      setSortKey(key);
      setSortOrder(order);
    }
  };

  const sortingBehavior = useMemo(
    () => [new ColumnSorting<RepoInfo>((idx, order) => handleSortRef.current(idx, order))],
    []
  );

  const displayItems = useMemo(() => {
    let items = repos;

    // Apply custom column filters
    for (const [colId, filterVal] of Object.entries(filters)) {
      if (!filterVal) continue;
      items = items.filter((r) => {
        const v = customValues[r.repoId]?.[colId] ?? "";
        return v.toLowerCase().includes(filterVal.toLowerCase());
      });
    }

    // Apply language filter
    if (languageFilter) {
      items = items.filter((r) => r.languages.some((l) => l.name === languageFilter));
    }

    // Apply sort
    const dir = sortOrder === SortOrder.ascending ? 1 : -1;
    const sorted = [...items];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "projectName":   return dir * a.projectName.localeCompare(b.projectName);
        case "repoName":      return dir * a.repoName.localeCompare(b.repoName);
        case "defaultBranch": return dir * a.defaultBranch.localeCompare(b.defaultBranch);
        case "lastCommitDate":
          return dir * ((a.lastCommitDate?.getTime() ?? 0) - (b.lastCommitDate?.getTime() ?? 0));
        case "lastCommitUser":
          return dir * (a.lastCommitUser ?? "").localeCompare(b.lastCommitUser ?? "");
        case "totalBranches": return dir * (a.totalBranches - b.totalBranches);
        case "openPRs":       return dir * (a.openPRCount - b.openPRCount);
        case "totalLoc":      return dir * ((a.totalLoc ?? 0) - (b.totalLoc ?? 0));
        default:
          if (sortKey.startsWith("custom_")) {
            const cid = sortKey.slice("custom_".length);
            return dir * (customValues[a.repoId]?.[cid] ?? "").localeCompare(
              customValues[b.repoId]?.[cid] ?? ""
            );
          }
          return 0;
      }
    });
    return sorted;
  }, [repos, customValues, filters, languageFilter, sortKey, sortOrder]);

  // ── Aggregate stats (summary card) ────────────────────────────────────────────

  const aggregateStats = useMemo(() => {
    if (repos.length === 0) return null;

    const byteMap: Record<string, { bytes: number; color: string }> = {};
    let totalBytes = 0;
    let langRepos = 0;

    for (const repo of repos) {
      if (repo.languageStatus === "done" && repo.languages.length > 0) {
        langRepos++;
        for (const lang of repo.languages) {
          if (!byteMap[lang.name]) byteMap[lang.name] = { bytes: 0, color: lang.color };
          byteMap[lang.name].bytes += lang.bytes;
          totalBytes += lang.bytes;
        }
      }
    }

    const languages: LanguageEntry[] = Object.entries(byteMap)
      .map(([name, { bytes, color }]) => ({
        name,
        bytes,
        color,
        percentage: totalBytes > 0 ? (bytes / totalBytes) * 100 : 0,
      }))
      .sort((a, b) => b.bytes - a.bytes);

    let totalLoc = 0;
    let locRepos = 0;
    for (const repo of repos) {
      if (repo.locStatus === "done" && repo.totalLoc != null) {
        locRepos++;
        totalLoc += repo.totalLoc;
      }
    }

    return { languages, langRepos, totalLoc, locRepos };
  }, [repos]);

  // ── Column definitions ────────────────────────────────────────────────────────

  const columns = useMemo((): ITableColumn<RepoInfo>[] => {
    const sortP = (label: string) => ({
      ariaLabelAscending:  `Sort by ${label} ascending`,
      ariaLabelDescending: `Sort by ${label} descending`,
    });

    const cols: ITableColumn<RepoInfo>[] = [];

    if (isMultiProject) {
      cols.push({
        id: "projectName", name: "Project", width: 140, sortProps: sortP("Project"),
        renderCell: (ri, ci, tc, item) => (
          <SimpleTableCell columnIndex={ci} tableColumn={tc} key={`proj-${ri}`}>
            <span className="project-name-cell">{item.projectName}</span>
          </SimpleTableCell>
        ),
      });
    }

    cols.push({
      id: "repoName", name: "Repository", width: -25, sortProps: sortP("Repository"),
      renderCell: (ri, ci, tc, item) => (
        <SimpleTableCell columnIndex={ci} tableColumn={tc} key={`repo-${ri}`}>
          <a className="repo-link" href={item.repoWebUrl} target="_blank" rel="noopener noreferrer">
            {item.repoName}
          </a>
        </SimpleTableCell>
      ),
    });

    cols.push({
      id: "defaultBranch", name: "Default Branch", width: 140, sortProps: sortP("Default Branch"),
      renderCell: (ri, ci, tc, item) => (
        <SimpleTableCell columnIndex={ci} tableColumn={tc} key={`branch-${ri}`}>
          <span className="branch-badge">{item.defaultBranch}</span>
        </SimpleTableCell>
      ),
    });

    cols.push({
      id: "lastCommitDate", name: "Last Commit", width: 160, sortProps: sortP("Last Commit"),
      renderCell: (ri, ci, tc, item) => (
        <SimpleTableCell columnIndex={ci} tableColumn={tc} key={`commit-${ri}`}>
          {item.detailStatus === "loading" ? (
            <Spinner size={SpinnerSize.xSmall} />
          ) : (
            <span className={item.lastCommitDate ? "" : "secondary-text"}>
              {item.lastCommitDate ? formatDate(item.lastCommitDate) : "—"}
            </span>
          )}
        </SimpleTableCell>
      ),
    });

    cols.push({
      id: "lastCommitUser", name: "Last Commit By", width: 150, sortProps: sortP("Last Commit By"),
      renderCell: (ri, ci, tc, item) => (
        <SimpleTableCell columnIndex={ci} tableColumn={tc} key={`user-${ri}`}>
          {item.detailStatus === "loading" ? (
            <Spinner size={SpinnerSize.xSmall} />
          ) : (
            <span className="secondary-text">{item.lastCommitUser ?? "—"}</span>
          )}
        </SimpleTableCell>
      ),
    });

    cols.push({
      id: "totalBranches", name: "Branches", width: 100, sortProps: sortP("Branches"),
      renderCell: (ri, ci, tc, item) => (
        <SimpleTableCell columnIndex={ci} tableColumn={tc} key={`branches-${ri}`}>
          {item.detailStatus === "loading" ? (
            <Spinner size={SpinnerSize.xSmall} />
          ) : (
            <span>{item.totalBranches}</span>
          )}
        </SimpleTableCell>
      ),
    });

    cols.push({
      id: "openPRs", name: "Open PRs", width: 100, sortProps: sortP("Open PRs"),
      renderCell: (ri, ci, tc, item) => (
        <SimpleTableCell columnIndex={ci} tableColumn={tc} key={`prs-${ri}`}>
          {item.detailStatus === "loading" ? (
            <Spinner size={SpinnerSize.xSmall} />
          ) : item.openPRCount > 0 ? (
            <a className="pr-count--active" href={item.openPRUrl} target="_blank" rel="noopener noreferrer">
              {item.openPRCount}
            </a>
          ) : (
            <span className="secondary-text">0</span>
          )}
        </SimpleTableCell>
      ),
    });

    cols.push({
      id: "languages", name: "Languages", width: -20,
      renderCell: (ri, ci, tc, item) => (
        <SimpleTableCell columnIndex={ci} tableColumn={tc} key={`lang-${ri}`}>
          {item.languageStatus === "loading" ? (
            <Spinner size={SpinnerSize.xSmall} />
          ) : (
            <LanguageBar languages={item.languages} />
          )}
        </SimpleTableCell>
      ),
    });

    cols.push({
      id: "totalLoc", name: "Lines of Code", width: 120, sortProps: sortP("Lines of Code"),
      renderCell: (ri, ci, tc, item) => (
        <SimpleTableCell columnIndex={ci} tableColumn={tc} key={`loc-${ri}`}>
          {item.locStatus === "loading" ? (
            <Spinner size={SpinnerSize.xSmall} />
          ) : item.totalLoc != null ? (
            <span className="loc-count">{item.totalLoc.toLocaleString()}</span>
          ) : (
            <span className="secondary-text">—</span>
          )}
        </SimpleTableCell>
      ),
    });

    // Custom columns
    for (const colDef of enabledCustomCols) {
      const cd = colDef;
      cols.push({
        id: `custom_${cd.id}`, name: cd.name, width: 140, sortProps: sortP(cd.name),
        renderCell: (ri, ci, tc, item) => {
          const val = customValues[item.repoId]?.[cd.id] ?? "";
          return (
            <SimpleTableCell columnIndex={ci} tableColumn={tc} key={`cust-${cd.id}-${ri}`}>
              {canEdit ? (
                <button
                  className="custom-cell-btn"
                  onClick={() => setEditState({ repoId: item.repoId, repoName: item.repoName, colDef: cd, value: val })}
                  title="Click to edit"
                >
                  {val || <span className="secondary-text">—</span>}
                </button>
              ) : (
                <span>{val || <span className="secondary-text">—</span>}</span>
              )}
            </SimpleTableCell>
          );
        },
      });
    }

    return cols;
  }, [isMultiProject, enabledCustomCols, canEdit, customValues]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Page className="hub-page">
      <Header title="Repository Insights" titleSize={TitleSize.Large} />

      <div className="hub-content">

        {/* Controls — only shown when no scope is configured */}
        {!hasScope && (
          <Card className="settings-card">
            <div className="scan-controls">
              <div className="control-group">
                <span className="control-label">Project</span>
                <select
                  className="project-select"
                  value={currentProject}
                  onChange={(e) => setCurrentProject(e.target.value)}
                  disabled={loadingRepos}
                >
                  {projects.length === 0 && (
                    <option value={currentProject}>{currentProject}</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="control-group control-group--action">
                <Button
                  text="Load Repositories"
                  primary
                  onClick={loadAllRepos}
                  disabled={loadingRepos || !currentProject.trim()}
                />
              </div>
              {repos.length > 0 && (
                <div className="control-group control-group--action">
                  <Button text="Export CSV" onClick={handleExport} />
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Scope banner */}
        {hasScope && (
          <div className="scope-banner">
            <span>Showing repositories from configured scope.</span>
            {repos.length > 0 && (
              <button className="link-btn" onClick={handleExport}>Export CSV</button>
            )}
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="error-banner">
            <span className="error-icon">⚠</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Loading progress */}
        {loadingRepos && (
          <div className="loading-container">
            <Spinner
              size={SpinnerSize.large}
              label={
                loadProgress.total > 0
                  ? `Loading ${loadProgress.current} / ${loadProgress.total} repositories…`
                  : "Loading repositories…"
              }
            />
          </div>
        )}

        {/* Summary card */}
        {repos.length > 0 && !loadingRepos && aggregateStats && (
          <Card className="summary-card">
            <div className="summary-body">
              <div className="summary-stats">
                <div className="stat-item">
                  <span className="stat-value">{repos.length.toLocaleString()}</span>
                  <span className="stat-label">repositories</span>
                </div>
                {aggregateStats.locRepos > 0 && (
                  <div className="stat-item">
                    <span className="stat-value">{aggregateStats.totalLoc.toLocaleString()}</span>
                    <span className="stat-label">
                      total lines of code
                      {aggregateStats.locRepos < repos.length && (
                        <span className="stat-note"> ({aggregateStats.locRepos} of {repos.length} repos analyzed)</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
              {aggregateStats.languages.length > 0 && (
                <div className="summary-lang">
                  <div className="summary-lang-header">
                    <span className="summary-lang-title">Languages across all repositories</span>
                    {aggregateStats.langRepos < repos.length && (
                      <span className="stat-note">{aggregateStats.langRepos} of {repos.length} repos analyzed</span>
                    )}
                  </div>
                  <LanguageBar languages={aggregateStats.languages} maxLangs={8} />
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Filter bar */}
        {repos.length > 0 && enabledCustomCols.length > 0 && (
          <div className="filter-bar">
            {enabledCustomCols.map((col) => (
              <div key={col.id} className="filter-group">
                <span className="filter-label">{col.name}</span>
                {col.type === "picklist" ? (
                  <select
                    className="filter-select"
                    value={filters[col.id] ?? ""}
                    onChange={(e) => setFilters((prev) => ({ ...prev, [col.id]: e.target.value }))}
                  >
                    <option value="">All</option>
                    {col.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="filter-input"
                    placeholder={`Filter by ${col.name}`}
                    value={filters[col.id] ?? ""}
                    onChange={(e) => setFilters((prev) => ({ ...prev, [col.id]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            {Object.values(filters).some(Boolean) && (
              <button className="filter-clear" onClick={() => setFilters({})}>Clear filters</button>
            )}
            {languageFilter && (
              <div className="filter-group">
                <span className="filter-label">Language</span>
                <button className="filter-tag" onClick={() => setLanguageFilter(null)}>
                  {languageFilter} ✕
                </button>
              </div>
            )}
          </div>
        )}

        {/* Results stats */}
        {repos.length > 0 && !loadingRepos && (
          <div className="results-stats">
            <span className="results-headline">
              {displayItems.length.toLocaleString()} {displayItems.length === 1 ? "repository" : "repositories"}
              {displayItems.length !== repos.length && ` (filtered from ${repos.length.toLocaleString()})`}
            </span>
            {canEdit && (
              <span className="results-hint">Click any custom column cell to edit its value.</span>
            )}
          </div>
        )}

        {/* Table */}
        {repos.length > 0 && (
          <Card className="results-card">
            <Table
              columns={columns}
              itemProvider={new ArrayItemProvider(displayItems)}
              behaviors={sortingBehavior}
              role="grid"
              ariaLabel="Repository Insights"
            />
          </Card>
        )}

        {/* Empty state */}
        {reposLoaded && repos.length === 0 && !loadingRepos && (
          <div className="empty-state">No repositories found.</div>
        )}

        {/* Edit modal */}
        {editState && (
          <EditModal
            editState={editState}
            onSave={handleSaveEdit}
            onCancel={() => setEditState(null)}
            onChange={(v) => setEditState((prev) => prev ? { ...prev, value: v } : null)}
          />
        )}
      </div>
    </Page>
  );
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────

ReactDOM.render(<Hub />, document.getElementById("root"));
