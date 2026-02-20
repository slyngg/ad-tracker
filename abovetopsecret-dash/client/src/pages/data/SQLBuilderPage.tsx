import { useState, useEffect, useCallback } from 'react';
import {
  executeSql,
  fetchSavedQueries,
  saveQuery,
  deleteSavedQuery,
  fetchSqlSchema,
  SqlResult,
  SavedQuery,
  SchemaInfo,
} from '../../lib/api';
import PageShell from '../../components/shared/PageShell';

export default function SQLBuilderPage() {
  const [sql, setSql] = useState('SELECT * FROM metrics LIMIT 25;');
  const [result, setResult] = useState<SqlResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [schema, setSchema] = useState<SchemaInfo[]>([]);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [showSchema, setShowSchema] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSidebar = useCallback(async () => {
    try {
      const [queries, schemaData] = await Promise.all([fetchSavedQueries(), fetchSqlSchema()]);
      setSavedQueries(queries);
      setSchema(schemaData);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadSidebar();
  }, [loadSidebar]);

  const handleExecute = async () => {
    if (!sql.trim()) return;
    setExecuting(true);
    setError(null);
    setResult(null);
    try {
      const data = await executeSql(sql);
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleSaveQuery = async () => {
    if (!saveName.trim() || !sql.trim()) return;
    try {
      const saved = await saveQuery(saveName, sql);
      setSavedQueries((prev) => [saved, ...prev]);
      setSaveName('');
      setShowSaveInput(false);
      setMessage({ type: 'success', text: 'Query saved' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteSaved = async (id: number) => {
    try {
      await deleteSavedQuery(id);
      setSavedQueries((prev) => prev.filter((q) => q.id !== id));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const loadSavedQuery = (query: SavedQuery) => {
    setSql(query.sql_text);
  };

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  const exportCsv = () => {
    if (!result) return;
    const header = result.columns.join(',');
    const rows = result.rows.map((row) =>
      result.columns.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query_result.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell title="SQL Builder" subtitle="Query your data directly">
      {message && (
        <div
          className={`px-3 py-2 mb-4 rounded-md text-sm ${
            message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-200px)]">
        {/* Schema Sidebar */}
        {showSchema && (
          <div className="w-56 bg-ats-card border border-ats-border rounded-lg flex flex-col shrink-0 overflow-hidden">
            <div className="p-3 border-b border-ats-border">
              <h3 className="text-xs font-bold text-ats-text uppercase tracking-wide">Schema</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {schema.length === 0 ? (
                <p className="text-xs text-ats-text-muted p-2">No schema loaded</p>
              ) : (
                schema.map((table) => (
                  <div key={table.table_name} className="mb-1">
                    <button
                      onClick={() => toggleTable(table.table_name)}
                      className="w-full text-left px-2 py-1.5 text-xs font-semibold text-ats-text hover:bg-ats-hover rounded transition-colors flex items-center gap-1"
                    >
                      <span className="text-ats-text-muted">{expandedTables.has(table.table_name) ? '-' : '+'}</span>
                      {table.table_name}
                    </button>
                    {expandedTables.has(table.table_name) && (
                      <div className="pl-5 pb-1">
                        {table.columns.map((col) => (
                          <div
                            key={col.column_name}
                            className="text-[11px] text-ats-text-muted py-0.5 flex justify-between gap-2"
                          >
                            <span className="truncate">{col.column_name}</span>
                            <span className="text-ats-text-muted/60 shrink-0">{col.data_type}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Saved Queries */}
            <div className="border-t border-ats-border p-3">
              <h3 className="text-xs font-bold text-ats-text uppercase tracking-wide mb-2">Saved Queries</h3>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {savedQueries.length === 0 ? (
                  <p className="text-[11px] text-ats-text-muted">None saved yet</p>
                ) : (
                  savedQueries.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center justify-between gap-1 group"
                    >
                      <button
                        onClick={() => loadSavedQuery(q)}
                        className="text-[11px] text-ats-text-muted hover:text-ats-text truncate text-left flex-1"
                      >
                        {q.name}
                      </button>
                      <button
                        onClick={() => handleDeleteSaved(q.id)}
                        className="text-[10px] text-ats-red opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        x
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Editor */}
          <div className="bg-ats-card border border-ats-border rounded-lg overflow-hidden mb-3">
            <div className="flex items-center justify-between px-3 py-2 border-b border-ats-border">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSchema(!showSchema)}
                  className="text-xs text-ats-text-muted hover:text-ats-text transition-colors"
                >
                  {showSchema ? 'Hide Schema' : 'Show Schema'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                {showSaveInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Query name"
                      className="px-2 py-1 bg-ats-bg border border-ats-border rounded text-xs text-ats-text outline-none focus:border-ats-accent w-32"
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveQuery()}
                    />
                    <button
                      onClick={handleSaveQuery}
                      className="px-2 py-1 text-xs bg-ats-accent text-white rounded hover:bg-blue-600 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowSaveInput(false)}
                      className="px-2 py-1 text-xs text-ats-text-muted"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSaveInput(true)}
                    className="text-xs text-ats-text-muted hover:text-ats-text transition-colors"
                  >
                    Save Query
                  </button>
                )}
                <span className="text-ats-border">|</span>
                <span className="text-[10px] text-ats-text-muted/60">Cmd+Enter to run</span>
              </div>
            </div>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={8}
              className="w-full px-4 py-3 bg-ats-bg text-ats-text text-sm font-mono outline-none resize-y min-h-[120px]"
              placeholder="SELECT * FROM ..."
              spellCheck={false}
            />
            <div className="flex items-center justify-between px-3 py-2 border-t border-ats-border">
              <button
                onClick={handleExecute}
                disabled={executing}
                className="px-5 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
              >
                {executing ? 'Executing...' : 'Run Query'}
              </button>
              {result && (
                <div className="flex items-center gap-3 text-xs text-ats-text-muted">
                  <span>{result.rowCount} row{result.rowCount !== 1 ? 's' : ''}</span>
                  <span>{result.duration}ms</span>
                  <button
                    onClick={exportCsv}
                    className="px-2 py-1 bg-ats-bg border border-ats-border rounded hover:text-ats-text transition-colors"
                  >
                    Export CSV
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 mb-3 rounded-md text-sm bg-red-900/50 text-red-300 font-mono">
              {error}
            </div>
          )}

          {/* Results Table */}
          {result && result.columns.length > 0 && (
            <div className="flex-1 bg-ats-card border border-ats-border rounded-lg overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-ats-card z-10">
                  <tr className="border-b border-ats-border">
                    {result.columns.map((col) => (
                      <th
                        key={col}
                        className="text-left px-3 py-2 text-ats-text-muted font-semibold uppercase tracking-wide whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-ats-border/50 hover:bg-ats-hover">
                      {result.columns.map((col) => (
                        <td key={col} className="px-3 py-1.5 text-ats-text font-mono whitespace-nowrap">
                          {row[col] === null ? (
                            <span className="text-ats-text-muted/40 italic">null</span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
