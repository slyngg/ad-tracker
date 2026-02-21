import { useState, useEffect, useCallback, useRef } from 'react';
import { uploadCsv, fetchUploadTemplates, UploadResult } from '../../lib/api';
import PageShell from '../../components/shared/PageShell';

interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

const UPLOAD_TYPES = [
  { value: 'orders', label: 'Orders' },
  { value: 'ad_spend', label: 'Ad Spend' },
];

function parseCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });

  return { headers, rows };
}

export default function DataUploadPage() {
  const [uploadType, setUploadType] = useState('orders');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Record<string, { columns?: string[]; required?: string[]; optional?: string[]; description?: string }>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await fetchUploadTemplates();
      setTemplates(data);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResult(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setParsed(parseCsv(text));
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!parsed || parsed.rows.length === 0) {
      setError('No data to upload');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const data = await uploadCsv(uploadType, parsed.headers, parsed.rows);
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setParsed(null);
    setFileName('');
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const downloadTemplate = (type: string) => {
    const tmpl = templates[type];
    if (!tmpl) return;

    const cols = tmpl.columns ?? [...(tmpl.required ?? []), ...(tmpl.optional ?? [])];
    const csv = cols.join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewRows = parsed ? parsed.rows.slice(0, 5) : [];

  return (
    <PageShell title="Data Upload" subtitle="Import CSV data into your workspace">
      {error && (
        <div className="px-3 py-2 mb-4 rounded-md text-sm bg-red-900/50 text-red-300">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Upload Section */}
        <div className="lg:col-span-2 space-y-4">
          {/* Upload Type */}
          <div className="bg-ats-card border border-ats-border rounded-lg p-4">
            <label className="text-[11px] text-ats-text-muted block mb-2 uppercase tracking-wide font-semibold">
              Upload Type
            </label>
            <div className="flex gap-2">
              {UPLOAD_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setUploadType(t.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    uploadType === t.value
                      ? 'bg-ats-accent text-white'
                      : 'bg-ats-bg border border-ats-border text-ats-text-muted hover:text-ats-text'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* File Input */}
          <div className="bg-ats-card border border-ats-border rounded-lg p-4">
            <label className="text-[11px] text-ats-text-muted block mb-2 uppercase tracking-wide font-semibold">
              CSV File
            </label>
            <div className="border-2 border-dashed border-ats-border rounded-lg p-6 text-center">
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <label
                htmlFor="csv-upload"
                className="cursor-pointer text-sm text-ats-text-muted hover:text-ats-text transition-colors"
              >
                {fileName ? (
                  <span className="text-ats-text font-semibold">{fileName}</span>
                ) : (
                  <span>
                    Click to select a CSV file or drag and drop
                  </span>
                )}
              </label>
              {parsed && (
                <p className="text-xs text-ats-text-muted mt-2">
                  {parsed.headers.length} columns, {parsed.rows.length} rows detected
                </p>
              )}
            </div>
          </div>

          {/* Preview Table */}
          {parsed && previewRows.length > 0 && (
            <div className="bg-ats-card border border-ats-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-ats-border flex items-center justify-between">
                <h3 className="text-xs font-bold text-ats-text uppercase tracking-wide">
                  Preview (first 5 rows)
                </h3>
                <span className="text-xs text-ats-text-muted">
                  {parsed.rows.length} total rows
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-ats-border">
                      {parsed.headers.map((h, i) => (
                        <th
                          key={i}
                          className="text-left px-3 py-2 text-ats-text-muted font-semibold uppercase tracking-wide whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="border-b border-ats-border/50">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-1.5 text-ats-text font-mono whitespace-nowrap">
                            {cell || <span className="text-ats-text-muted/40">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={uploading || !parsed || parsed.rows.length === 0}
              className="px-6 py-2.5 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-40"
            >
              {uploading ? 'Uploading...' : 'Upload Data'}
            </button>
            {parsed && (
              <button
                onClick={handleReset}
                className="px-4 py-2.5 bg-ats-bg border border-ats-border text-ats-text-muted rounded-lg text-sm hover:text-ats-text transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {/* Upload Results */}
          {result && (
            <div
              className={`rounded-lg p-4 border ${
                result.success
                  ? 'bg-emerald-900/20 border-emerald-800 text-emerald-300'
                  : 'bg-red-900/20 border-red-800 text-red-300'
              }`}
            >
              <h3 className="text-sm font-bold mb-2">
                {result.success ? 'Upload Complete' : 'Upload Failed'}
              </h3>
              <div className="grid grid-cols-3 gap-4 text-xs mb-2">
                <div>
                  <span className="block text-[11px] opacity-70 uppercase">Inserted</span>
                  <span className="text-lg font-bold font-mono">{result.inserted}</span>
                </div>
                <div>
                  <span className="block text-[11px] opacity-70 uppercase">Skipped</span>
                  <span className="text-lg font-bold font-mono">{result.skipped}</span>
                </div>
                <div>
                  <span className="block text-[11px] opacity-70 uppercase">Errors</span>
                  <span className="text-lg font-bold font-mono">{result.errors.length}</span>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {result.errors.slice(0, 5).map((err, i) => (
                    <div key={i} className="text-xs font-mono opacity-80">
                      {err}
                    </div>
                  ))}
                  {result.errors.length > 5 && (
                    <div className="text-xs opacity-60">
                      ...and {result.errors.length - 5} more errors
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Templates Sidebar */}
        <div className="space-y-4">
          <div className="bg-ats-surface border border-ats-border rounded-lg p-4">
            <h3 className="text-sm font-bold text-ats-text mb-3">Download Templates</h3>
            <p className="text-xs text-ats-text-muted mb-4">
              Download a template CSV to see the expected column format for each upload type.
            </p>
            <div className="space-y-2">
              {Object.keys(templates).length > 0 ? (
                Object.entries(templates).map(([type, tmpl]) => (
                  <div key={type} className="bg-ats-bg border border-ats-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-ats-text capitalize">{type.replace('_', ' ')}</span>
                      <button
                        onClick={() => downloadTemplate(type)}
                        className="text-xs text-ats-accent hover:text-blue-400 transition-colors"
                      >
                        Download
                      </button>
                    </div>
                    <div className="space-y-1">
                      {tmpl.columns ? (
                        <div>
                          <span className="text-[10px] text-ats-text-muted uppercase">Columns:</span>
                          <div className="text-[11px] text-ats-text font-mono">
                            {tmpl.columns.join(', ')}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="text-[10px] text-ats-text-muted uppercase">Required:</span>
                            <div className="text-[11px] text-ats-text font-mono">
                              {(tmpl.required ?? []).join(', ')}
                            </div>
                          </div>
                          {(tmpl.optional ?? []).length > 0 && (
                            <div>
                              <span className="text-[10px] text-ats-text-muted uppercase">Optional:</span>
                              <div className="text-[11px] text-ats-text-muted font-mono">
                                {(tmpl.optional ?? []).join(', ')}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {tmpl.description && (
                        <p className="text-[10px] text-ats-text-muted mt-1">{tmpl.description}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-ats-text-muted">Loading templates...</p>
              )}
            </div>
          </div>

          <div className="bg-ats-surface border border-ats-border rounded-lg p-4">
            <h3 className="text-sm font-bold text-ats-text mb-2">Upload Tips</h3>
            <ul className="text-xs text-ats-text-muted space-y-1.5 list-disc list-inside">
              <li>Files must be in CSV format (.csv)</li>
              <li>First row should contain column headers</li>
              <li>Date columns should use YYYY-MM-DD format</li>
              <li>Numeric values should not include currency symbols</li>
              <li>Duplicate rows will be skipped automatically</li>
            </ul>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
