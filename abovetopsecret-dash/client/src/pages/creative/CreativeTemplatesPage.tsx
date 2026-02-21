import { useState, useEffect } from 'react';
import {
  fetchCreativeTemplates,
  createCreativeTemplate,
  updateCreativeTemplate,
  deleteCreativeTemplate,
  duplicateCreativeTemplate,
  CreativeTemplate,
} from '../../lib/api';
import { Plus, Pencil, Copy, Trash2, Loader2, LayoutTemplate, Tag } from 'lucide-react';

const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

interface FormState {
  name: string;
  description: string;
  platform: string;
  creative_type: string;
  tags: string;
  structure: string;
  variable_slots: string;
  is_shared: boolean;
}

const emptyForm: FormState = {
  name: '',
  description: '',
  platform: 'meta',
  creative_type: 'image',
  tags: '',
  structure: '{}',
  variable_slots: '[]',
  is_shared: false,
};

function templateToForm(t: CreativeTemplate): FormState {
  return {
    name: t.name,
    description: t.description || '',
    platform: t.platform,
    creative_type: t.creative_type,
    tags: (t.tags || []).join(', '),
    structure: JSON.stringify(t.structure || {}, null, 2),
    variable_slots: JSON.stringify(t.variable_slots || [], null, 2),
    is_shared: t.is_shared,
  };
}

function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    meta: 'bg-blue-500/20 text-blue-400',
    tiktok: 'bg-pink-500/20 text-pink-400',
    youtube: 'bg-red-500/20 text-red-400',
    google: 'bg-yellow-500/20 text-yellow-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${colors[platform] || 'bg-gray-500/20 text-gray-400'}`}>
      {platform}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-purple-500/20 text-purple-400">
      {type}
    </span>
  );
}

function TemplateModal({
  title,
  form,
  setForm,
  onSave,
  onClose,
  saving,
}: {
  title: string;
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  const inputCls = 'w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text placeholder:text-ats-text-muted focus:outline-none focus:border-ats-accent';
  const labelCls = 'block text-xs font-semibold text-ats-text-muted mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-ats-card border border-ats-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold text-ats-text mb-4">{title}</h2>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Template name"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="What this template is for..."
              rows={2}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Platform</label>
              <select
                value={form.platform}
                onChange={e => setForm({ ...form, platform: e.target.value })}
                className={inputCls}
              >
                <option value="meta">Meta</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
                <option value="google">Google</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Creative Type</label>
              <select
                value={form.creative_type}
                onChange={e => setForm({ ...form, creative_type: e.target.value })}
                className={inputCls}
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="carousel">Carousel</option>
                <option value="copy">Copy</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Tags (comma-separated)</label>
            <input
              type="text"
              value={form.tags}
              onChange={e => setForm({ ...form, tags: e.target.value })}
              placeholder="e.g. ugc, testimonial, promo"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Structure (JSON)</label>
            <textarea
              value={form.structure}
              onChange={e => setForm({ ...form, structure: e.target.value })}
              rows={4}
              className={`${inputCls} font-mono text-xs`}
            />
          </div>

          <div>
            <label className={labelCls}>Variable Slots (JSON)</label>
            <textarea
              value={form.variable_slots}
              onChange={e => setForm({ ...form, variable_slots: e.target.value })}
              rows={4}
              className={`${inputCls} font-mono text-xs`}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, is_shared: !form.is_shared })}
              className={`w-10 h-5 rounded-full transition-colors relative ${form.is_shared ? 'bg-ats-accent' : 'bg-ats-border'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_shared ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
            <span className="text-sm text-ats-text">Shared template</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-ats-text-muted hover:text-ats-text border border-ats-border hover:bg-ats-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-ats-accent text-white hover:bg-ats-accent/80 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreativeTemplatesPage() {
  const [templates, setTemplates] = useState<CreativeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchCreativeTemplates();
      setTemplates(data);
    } catch {
      /* empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setModalMode('create');
  };

  const openEdit = (t: CreativeTemplate) => {
    setForm(templateToForm(t));
    setEditingId(t.id);
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingId(null);
  };

  const parseForm = () => {
    const tags = form.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    let structure: Record<string, any> = {};
    let variable_slots: Record<string, any>[] = [];
    try {
      structure = JSON.parse(form.structure);
    } catch {
      /* keep default */
    }
    try {
      variable_slots = JSON.parse(form.variable_slots);
    } catch {
      /* keep default */
    }
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      platform: form.platform,
      creative_type: form.creative_type,
      tags,
      structure,
      variable_slots,
      is_shared: form.is_shared,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = parseForm();
      if (modalMode === 'create') {
        await createCreativeTemplate(payload);
      } else if (modalMode === 'edit' && editingId !== null) {
        await updateCreativeTemplate(editingId, payload);
      }
      closeModal();
      await load();
    } catch {
      /* empty */
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      await duplicateCreativeTemplate(id);
      await load();
    } catch {
      /* empty */
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this template?')) return;
    try {
      await deleteCreativeTemplate(id);
      await load();
    } catch {
      /* empty */
    }
  };

  return (
    <div className="min-h-screen bg-ats-bg text-ats-text p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LayoutTemplate className="w-6 h-6 text-ats-accent" />
          <h1 className="text-xl font-bold text-ats-text">Creative Templates</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-ats-accent/80 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-ats-accent animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && templates.length === 0 && (
        <div className={`${cardCls} text-center py-16`}>
          <LayoutTemplate className="w-12 h-12 text-ats-text-muted mx-auto mb-3" />
          <p className="text-ats-text-muted text-sm mb-4">No creative templates yet.</p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:bg-ats-accent/80 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create your first template
          </button>
        </div>
      )}

      {/* Template grid */}
      {!loading && templates.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => (
            <div key={t.id} className={`${cardCls} flex flex-col justify-between hover:border-ats-accent/40 transition-colors`}>
              <div>
                {/* Name & badges */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-ats-text truncate">{t.name}</h3>
                  <div className="flex gap-1 flex-shrink-0">
                    <PlatformBadge platform={t.platform} />
                    <TypeBadge type={t.creative_type} />
                  </div>
                </div>

                {/* Description */}
                {t.description && (
                  <p className="text-xs text-ats-text-muted mb-3 line-clamp-2">{t.description}</p>
                )}

                {/* Usage count */}
                <div className="text-xs text-ats-text-muted mb-2">
                  Used <span className="font-semibold text-ats-text">{t.usage_count}</span> time{t.usage_count !== 1 ? 's' : ''}
                </div>

                {/* Tags */}
                {t.tags && t.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {t.tags.map((tag, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-ats-hover rounded text-[10px] text-ats-text-muted">
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Created date */}
                <div className="text-[10px] text-ats-text-muted">
                  Created {new Date(t.created_at).toLocaleDateString()}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-ats-border">
                <button
                  onClick={() => openEdit(t)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-ats-text-muted hover:text-ats-text hover:bg-ats-hover transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => handleDuplicate(t.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-ats-text-muted hover:text-ats-text hover:bg-ats-hover transition-colors"
                  title="Duplicate"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-ats-red hover:bg-ats-hover transition-colors ml-auto"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalMode && (
        <TemplateModal
          title={modalMode === 'create' ? 'New Template' : 'Edit Template'}
          form={form}
          setForm={setForm}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
        />
      )}
    </div>
  );
}
