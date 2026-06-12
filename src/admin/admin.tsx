import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import { GitRestClient, GitRepository } from "azure-devops-extension-api/Git";
import { CoreRestClient } from "azure-devops-extension-api/Core/CoreClient";
import { Page } from "azure-devops-ui/Page";
import { Header, TitleSize } from "azure-devops-ui/Header";
import { Card } from "azure-devops-ui/Card";
import { Button } from "azure-devops-ui/Button";
import { Spinner, SpinnerSize } from "azure-devops-ui/Spinner";
import { Checkbox } from "azure-devops-ui/Checkbox";
import "azure-devops-ui/Core/override.css";
import "./admin.scss";

import {
  AdminConfig,
  ColumnType,
  CustomColumnDef,
  ProjectConfig,
  RepoSelection,
} from "../shared/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_CONFIG_KEY = "admin-config";
const MAX_CUSTOM_COLUMNS = 10;

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
  const svc = await (SDK as any).getService("ms.vss-features.extension-data-service");
  const mgr = await svc.getDataManager();
  await mgr.setValue(key, value);
}

// ── Default config ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AdminConfig = {
  customColumns: [],
  editPermission: "admins_only",
  additionalEditorGroups: [],
  scope: { projects: [], savedAt: "" },
  savedAt: "",
};

function newColumnId(): string {
  return `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Column Editor Modal ───────────────────────────────────────────────────────

interface ColumnDraft {
  name: string;
  type: ColumnType;
  options: string;
  enabled: boolean;
}

const emptyDraft: ColumnDraft = { name: "", type: "picklist", options: "", enabled: true };

const ColumnModal: React.FC<{
  draft: ColumnDraft;
  isNew: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (draft: ColumnDraft) => void;
}> = ({ draft, isNew, onClose, onSave, onChange }) => {
  const canSave = draft.name.trim().length > 0 &&
    (draft.type !== "picklist" || draft.options.trim().length > 0);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <span className="modal-title">{isNew ? "Add Custom Column" : "Edit Column"}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <div className="form-field">
            <label className="form-label">Column Name <span className="required">*</span></label>
            <input
              className="form-input"
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="e.g. Department"
              maxLength={50}
              autoFocus
            />
          </div>

          <div className="form-field">
            <label className="form-label">Type <span className="required">*</span></label>
            <select
              className="form-select"
              value={draft.type}
              onChange={(e) => onChange({ ...draft, type: e.target.value as ColumnType })}
            >
              <option value="picklist">Picklist (predefined options)</option>
              <option value="freeform">Freeform text</option>
              <option value="date">Date</option>
            </select>
          </div>

          {draft.type === "picklist" && (
            <div className="form-field">
              <label className="form-label">Options <span className="required">*</span></label>
              <input
                className="form-input"
                value={draft.options}
                onChange={(e) => onChange({ ...draft, options: e.target.value })}
                placeholder="IT, DevOps, Engineering"
              />
              <p className="form-hint">Comma-separated list of allowed values.</p>
              {draft.options.trim() && (
                <div className="options-preview">
                  {draft.options.split(",").map((o) => o.trim()).filter(Boolean).map((o) => (
                    <span key={o} className="option-chip">{o}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="form-field form-field--inline">
            <Checkbox
              label="Enabled"
              checked={draft.enabled}
              onChange={(_e, v) => onChange({ ...draft, enabled: v })}
            />
          </div>
        </div>
        <div className="modal-footer">
          <Button text="Cancel" onClick={onClose} />
          <Button text={isNew ? "Add Column" : "Save Changes"} primary onClick={onSave} disabled={!canSave} />
        </div>
      </div>
    </div>
  );
};

// ── Admin Component ───────────────────────────────────────────────────────────

const Admin: React.FC = () => {
  // ── State ───────────────────────────────────────────────────────────────────

  const [config, setConfig] = useState<AdminConfig>(DEFAULT_CONFIG);
  const [initDone, setInitDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveBanner, setSaveBanner] = useState(false);

  // Column editor
  const [columnModal, setColumnModal] = useState<{
    open: boolean;
    editingId: string | null;
    draft: ColumnDraft;
  }>({ open: false, editingId: null, draft: emptyDraft });

  // Scope config
  const [scopeProjects, setScopeProjects] = useState<ProjectConfig[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [repoLoadStatus, setRepoLoadStatus] = useState<Record<string, "loading" | "loaded" | "error">>({});
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [repoSearch, setRepoSearch] = useState<Record<string, string>>({});

  // ── SDK init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    SDK.init({ loaded: false }).then(async () => {
      await SDK.ready();
      const stored = await loadFromStorage<AdminConfig>(ADMIN_CONFIG_KEY);
      if (stored) setConfig(stored);
      SDK.notifyLoadSucceeded();
      setInitDone(true);
    });
  }, []);

  // Load scope projects whenever admin page initialises
  useEffect(() => {
    if (!initDone) return;
    loadScopeProjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initDone]);

  // ── Scope project loading ────────────────────────────────────────────────────

  const loadScopeProjects = useCallback(async () => {
    setScopeLoading(true);
    try {
      const coreClient = getClient(CoreRestClient);
      const adoProjects: any[] = await (coreClient as any).getProjects();

      setConfig((prev) => {
        const existingByName: Record<string, ProjectConfig> = {};
        for (const pc of prev.scope.projects) existingByName[pc.projectName] = pc;

        const merged: ProjectConfig[] = adoProjects.map((p: any) =>
          existingByName[p.name] ?? {
            projectId:       p.id ?? p.name,
            projectName:     p.name,
            enabled:         false,
            includeAllRepos: true,
            repos:           [],
          }
        );

        setScopeProjects(merged);
        return { ...prev, scope: { ...prev.scope, projects: merged } };
      });
    } catch {}
    setScopeLoading(false);
  }, []);

  const loadProjectRepos = useCallback(
    async (projectName: string) => {
      if (repoLoadStatus[projectName] === "loading" || repoLoadStatus[projectName] === "loaded") return;
      setRepoLoadStatus((prev) => ({ ...prev, [projectName]: "loading" }));
      try {
        const gitClient = getClient(GitRestClient);
        const repos: GitRepository[] = await gitClient.getRepositories(projectName);

        setConfig((prev) => {
          const projects = prev.scope.projects.map((pc) => {
            if (pc.projectName !== projectName) return pc;
            const existingById: Record<string, RepoSelection> = {};
            for (const r of pc.repos) existingById[r.repoId] = r;
            const merged = repos.map((r: GitRepository) =>
              existingById[r.id!] ?? { repoId: r.id!, repoName: r.name!, enabled: true }
            );
            return { ...pc, repos: merged };
          });
          return { ...prev, scope: { ...prev.scope, projects } };
        });
        setRepoLoadStatus((prev) => ({ ...prev, [projectName]: "loaded" }));
      } catch {
        setRepoLoadStatus((prev) => ({ ...prev, [projectName]: "error" }));
      }
    },
    [repoLoadStatus]
  );

  // ── Column CRUD ──────────────────────────────────────────────────────────────

  const openAddColumn = () => {
    if (config.customColumns.filter((c) => c.enabled || true).length >= MAX_CUSTOM_COLUMNS) {
      alert(`Maximum ${MAX_CUSTOM_COLUMNS} custom columns allowed.`);
      return;
    }
    setColumnModal({ open: true, editingId: null, draft: emptyDraft });
  };

  const openEditColumn = (col: CustomColumnDef) => {
    setColumnModal({
      open: true,
      editingId: col.id,
      draft: {
        name:    col.name,
        type:    col.type,
        options: col.options?.join(", ") ?? "",
        enabled: col.enabled,
      },
    });
  };

  const saveColumn = () => {
    const { draft, editingId } = columnModal;
    const name = draft.name.trim();
    if (!name) return;

    const options =
      draft.type === "picklist"
        ? draft.options.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

    if (editingId) {
      setConfig((prev) => ({
        ...prev,
        customColumns: prev.customColumns.map((c) =>
          c.id === editingId
            ? { ...c, name, type: draft.type, options, enabled: draft.enabled }
            : c
        ),
      }));
    } else {
      if (config.customColumns.length >= MAX_CUSTOM_COLUMNS) return;
      const newCol: CustomColumnDef = {
        id:      newColumnId(),
        name,
        type:    draft.type,
        options,
        order:   config.customColumns.length,
        enabled: draft.enabled,
      };
      setConfig((prev) => ({ ...prev, customColumns: [...prev.customColumns, newCol] }));
    }

    setColumnModal({ open: false, editingId: null, draft: emptyDraft });
  };

  const deleteColumn = (id: string) => {
    if (!window.confirm("Delete this column? Stored values are not removed.")) return;
    setConfig((prev) => ({
      ...prev,
      customColumns: prev.customColumns
        .filter((c) => c.id !== id)
        .map((c, i) => ({ ...c, order: i })),
    }));
  };

  const moveColumn = (id: string, direction: -1 | 1) => {
    setConfig((prev) => {
      const cols = [...prev.customColumns].sort((a, b) => a.order - b.order);
      const idx = cols.findIndex((c) => c.id === id);
      const target = idx + direction;
      if (target < 0 || target >= cols.length) return prev;
      [cols[idx], cols[target]] = [cols[target], cols[idx]];
      return { ...prev, customColumns: cols.map((c, i) => ({ ...c, order: i })) };
    });
  };

  // ── Scope mutations ──────────────────────────────────────────────────────────

  const toggleProject = (projectName: string, enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      scope: {
        ...prev.scope,
        projects: prev.scope.projects.map((p) =>
          p.projectName === projectName ? { ...p, enabled } : p
        ),
      },
    }));
    if (enabled) {
      setExpandedProjects((prev) => new Set([...prev, projectName]));
      loadProjectRepos(projectName);
    }
  };

  const setProjectAllRepos = (projectName: string, all: boolean) => {
    setConfig((prev) => ({
      ...prev,
      scope: {
        ...prev.scope,
        projects: prev.scope.projects.map((p) =>
          p.projectName === projectName ? { ...p, includeAllRepos: all } : p
        ),
      },
    }));
    if (!all) loadProjectRepos(projectName);
  };

  const toggleRepo = (projectName: string, repoId: string, enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      scope: {
        ...prev.scope,
        projects: prev.scope.projects.map((p) =>
          p.projectName !== projectName
            ? p
            : { ...p, repos: p.repos.map((r) => (r.repoId === repoId ? { ...r, enabled } : r)) }
        ),
      },
    }));
  };

  const selectAllRepos = (projectName: string, enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      scope: {
        ...prev.scope,
        projects: prev.scope.projects.map((p) =>
          p.projectName !== projectName
            ? p
            : { ...p, repos: p.repos.map((r) => ({ ...r, enabled })) }
        ),
      },
    }));
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const toSave: AdminConfig = {
        ...config,
        savedAt: new Date().toISOString(),
        scope: { ...config.scope, savedAt: new Date().toISOString() },
      };
      await saveToStorage(ADMIN_CONFIG_KEY, toSave);
      setConfig(toSave);
      setSaveBanner(true);
      setTimeout(() => setSaveBanner(false), 3000);
    } catch (e: any) {
      setSaveError(e.message ?? "Failed to save.");
    }
    setSaving(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const sortedCols = [...config.customColumns].sort((a, b) => a.order - b.order);

  return (
    <Page className="admin-page">
      <Header
        title="Repository Insights Administration"
        titleSize={TitleSize.Large}
        description="Configure custom columns, edit permissions, and repository scope for the Repo Insights hub."
      />

      <div className="admin-content">

        {/* ── Save banner / error ────────────────────────────────────────── */}
        {saveBanner && (
          <div className="save-banner">Configuration saved successfully.</div>
        )}
        {saveError && (
          <div className="error-banner">
            <span className="error-icon">⚠</span>
            <span>{saveError}</span>
          </div>
        )}

        {/* ── Custom Columns ─────────────────────────────────────────────── */}
        <Card className="admin-card" titleProps={{ text: "Custom Columns" }}>
          <div className="admin-card-body">
            <p className="admin-desc">
              Define up to {MAX_CUSTOM_COLUMNS} custom metadata columns shown in the Repo Insights table.
              Supported types: Picklist, Freeform text, Date.
            </p>
            <div className="col-actions-bar">
              <Button
                text="Add Column"
                primary
                onClick={openAddColumn}
                disabled={config.customColumns.length >= MAX_CUSTOM_COLUMNS}
              />
            </div>

            {sortedCols.length === 0 ? (
              <p className="admin-empty">No custom columns defined yet. Click <strong>Add Column</strong> to create the first one.</p>
            ) : (
              <table className="col-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Column Name</th>
                    <th>Type</th>
                    <th>Options / Format</th>
                    <th>Enabled</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCols.map((col, idx) => (
                    <tr key={col.id} className={col.enabled ? "" : "col-row--disabled"}>
                      <td className="col-order">
                        <button
                          className="order-btn"
                          onClick={() => moveColumn(col.id, -1)}
                          disabled={idx === 0}
                          title="Move up"
                        >▲</button>
                        <button
                          className="order-btn"
                          onClick={() => moveColumn(col.id, 1)}
                          disabled={idx === sortedCols.length - 1}
                          title="Move down"
                        >▼</button>
                      </td>
                      <td className="col-name">{col.name}</td>
                      <td className="col-type">
                        <span className={`type-badge type-badge--${col.type}`}>
                          {col.type}
                        </span>
                      </td>
                      <td className="col-options">
                        {col.type === "picklist"
                          ? col.options?.join(", ") ?? "—"
                          : col.type === "date"
                          ? "YYYY-MM-DD"
                          : "Free text"}
                      </td>
                      <td>
                        <Checkbox
                          checked={col.enabled}
                          onChange={(_e, v) =>
                            setConfig((prev) => ({
                              ...prev,
                              customColumns: prev.customColumns.map((c) =>
                                c.id === col.id ? { ...c, enabled: v } : c
                              ),
                            }))
                          }
                          label=""
                        />
                      </td>
                      <td className="col-actions">
                        <button className="action-link" onClick={() => openEditColumn(col)}>Edit</button>
                        <button className="action-link action-link--danger" onClick={() => deleteColumn(col.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* ── Edit Permissions ───────────────────────────────────────────── */}
        <Card className="admin-card" titleProps={{ text: "Edit Permissions" }}>
          <p className="admin-desc">
            Control who can edit custom column values directly from the Repo Insights hub.
          </p>
          <div className="perm-options">
            <label className="radio-label">
              <input
                type="radio"
                name="editPermission"
                checked={config.editPermission === "admins_only"}
                onChange={() => setConfig((prev) => ({ ...prev, editPermission: "admins_only" }))}
              />
              <div>
                <strong>Project administrators only</strong>
                <p className="radio-desc">Values can only be edited via this admin page.</p>
              </div>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="editPermission"
                checked={config.editPermission === "all_contributors"}
                onChange={() => setConfig((prev) => ({ ...prev, editPermission: "all_contributors" }))}
              />
              <div>
                <strong>All contributors</strong>
                <p className="radio-desc">
                  Any user with access to the Repo Insights hub can click a cell to edit its value.
                </p>
              </div>
            </label>
          </div>
        </Card>

        {/* ── Repository Scope ───────────────────────────────────────────── */}
        <Card className="admin-card" titleProps={{ text: "Repository Scope" }}>
          <div className="admin-card-body">
            <p className="admin-desc">
              Restrict which projects and repositories appear in the Repo Insights hub.
              When no scope is configured, users pick a project in the hub directly.
            </p>

            {scopeLoading ? (
              <div className="scope-loading"><Spinner size={SpinnerSize.small} label="Loading projects…" /></div>
            ) : (
              <div className="scope-project-list">
              {config.scope.projects.length === 0 && (
                <p className="admin-empty">No ADO projects found.</p>
              )}
              {config.scope.projects.map((pc) => {
                const expanded = expandedProjects.has(pc.projectName);
                const search = repoSearch[pc.projectName] ?? "";
                const filteredRepos = pc.repos.filter((r) =>
                  r.repoName.toLowerCase().includes(search.toLowerCase())
                );

                return (
                  <div key={pc.projectId} className={`scope-project ${pc.enabled ? "scope-project--enabled" : ""}`}>
                    <div className="scope-project-header">
                      <Checkbox
                        label={pc.projectName}
                        checked={pc.enabled}
                        onChange={(_e, v) => toggleProject(pc.projectName, v)}
                      />
                      {pc.enabled && (
                        <button
                          className="scope-expand-btn"
                          onClick={() =>
                            setExpandedProjects((prev) => {
                              const next = new Set(prev);
                              if (next.has(pc.projectName)) next.delete(pc.projectName);
                              else {
                                next.add(pc.projectName);
                                loadProjectRepos(pc.projectName);
                              }
                              return next;
                            })
                          }
                        >
                          {expanded ? "▲" : "▼"}
                        </button>
                      )}
                    </div>

                    {pc.enabled && expanded && (
                      <div className="scope-project-body">
                        <label className="radio-label radio-label--sm">
                          <input
                            type="radio"
                            checked={pc.includeAllRepos}
                            onChange={() => setProjectAllRepos(pc.projectName, true)}
                          />
                          All repositories
                        </label>
                        <label className="radio-label radio-label--sm">
                          <input
                            type="radio"
                            checked={!pc.includeAllRepos}
                            onChange={() => setProjectAllRepos(pc.projectName, false)}
                          />
                          Select specific repositories
                        </label>

                        {!pc.includeAllRepos && (
                          <div className="repo-selector">
                            {repoLoadStatus[pc.projectName] === "loading" ? (
                              <Spinner size={SpinnerSize.xSmall} label="Loading repos…" />
                            ) : repoLoadStatus[pc.projectName] === "error" ? (
                              <span className="scope-error">Failed to load repositories.</span>
                            ) : (
                              <>
                                <div className="repo-toolbar">
                                  <input
                                    className="repo-search"
                                    placeholder="Search repos…"
                                    value={search}
                                    onChange={(e) =>
                                      setRepoSearch((prev) => ({ ...prev, [pc.projectName]: e.target.value }))
                                    }
                                  />
                                  <span className="repo-count">
                                    {pc.repos.filter((r) => r.enabled).length}/{pc.repos.length} selected
                                  </span>
                                  <button
                                    className="select-all-btn"
                                    onClick={() => selectAllRepos(pc.projectName, true)}
                                  >Select all</button>
                                  <button
                                    className="select-all-btn"
                                    onClick={() => selectAllRepos(pc.projectName, false)}
                                  >Clear all</button>
                                </div>
                                <div className="repo-grid">
                                  {filteredRepos.length === 0 && (
                                    <span className="repo-no-match">No repos match.</span>
                                  )}
                                  {filteredRepos.map((r) => (
                                    <label key={r.repoId} className="repo-item">
                                      <input
                                        type="checkbox"
                                        checked={r.enabled}
                                        onChange={(e) =>
                                          toggleRepo(pc.projectName, r.repoId, e.target.checked)
                                        }
                                      />
                                      <span>{r.repoName}</span>
                                    </label>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            )}
          </div>
        </Card>

        {/* ── Save button ────────────────────────────────────────────────── */}
        <div className="admin-save-row">
          {saving && <Spinner size={SpinnerSize.small} />}
          <Button
            text="Save All Changes"
            primary
            onClick={handleSave}
            disabled={saving}
          />
        </div>

        {/* ── Column modal ───────────────────────────────────────────────── */}
        {columnModal.open && (
          <ColumnModal
            draft={columnModal.draft}
            isNew={columnModal.editingId === null}
            onClose={() => setColumnModal({ open: false, editingId: null, draft: emptyDraft })}
            onSave={saveColumn}
            onChange={(d) => setColumnModal((prev) => ({ ...prev, draft: d }))}
          />
        )}
      </div>
    </Page>
  );
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────

ReactDOM.render(<Admin />, document.getElementById("root"));
