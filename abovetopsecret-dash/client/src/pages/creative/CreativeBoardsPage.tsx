import { useState, useEffect, useCallback } from 'react';
import PageShell from '../../components/shared/PageShell';
import {
  fetchBoards, createBoard, updateBoard, deleteBoard, removeBoardItem,
  fetchSavedCreatives, addBoardItem, Board, SavedCreative,
} from '../../lib/api';

const cardCls = 'bg-ats-card rounded-xl p-4 border border-ats-border';

function CreateBoardModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: { name: string; description: string }) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'var(--overlay-bg)' }} onClick={onClose}>
      <div className={`${cardCls} w-full max-w-sm`} onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Create Board</h3>
        <div className="space-y-2">
          <input placeholder="Board name" value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text" />
          <textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)}
            className="w-full bg-ats-bg border border-ats-border rounded-lg px-3 py-2 text-sm text-ats-text h-16 resize-none" />
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => onSubmit({ name, description })} disabled={!name.trim()}
            className="flex-1 px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold disabled:opacity-50">Create</button>
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-ats-bg border border-ats-border text-ats-text-muted rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AddToBoardModal({ boards, onClose, onSelect }: { boards: Board[]; onClose: () => void; onSelect: (boardId: number) => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'var(--overlay-bg)' }} onClick={onClose}>
      <div className={`${cardCls} w-full max-w-sm`} onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-ats-text mb-3">Add to Board</h3>
        <div className="space-y-1">
          {boards.map(b => (
            <button key={b.id} onClick={() => onSelect(b.id)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-ats-hover text-sm text-ats-text">
              {b.name} <span className="text-ats-text-muted">({b.item_count} items)</span>
            </button>
          ))}
          {boards.length === 0 && <div className="text-sm text-ats-text-muted text-center py-4">No boards yet. Create one first.</div>}
        </div>
      </div>
    </div>
  );
}

export default function CreativeBoardsPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [expandedBoard, setExpandedBoard] = useState<number | null>(null);
  const [boardItems, setBoardItems] = useState<SavedCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBoard, setEditingBoard] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await fetchBoards();
      setBoards(b);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: { name: string; description: string }) => {
    try {
      await createBoard(data);
      setShowCreateModal(false);
      load();
    } catch { /* empty */ }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this board and all its items?')) return;
    try { await deleteBoard(id); load(); } catch { /* empty */ }
  };

  const handleRename = async (id: number) => {
    if (!editName.trim()) return;
    try {
      await updateBoard(id, { name: editName });
      setEditingBoard(null);
      load();
    } catch { /* empty */ }
  };

  const handleExpand = async (boardId: number) => {
    if (expandedBoard === boardId) {
      setExpandedBoard(null);
      return;
    }
    setExpandedBoard(boardId);
    try {
      // Fetch saved creatives that are in this board — for now load all saved
      const result = await fetchSavedCreatives({});
      setBoardItems(result.data);
    } catch { /* empty */ }
  };

  const handleRemoveItem = async (boardId: number, itemId: number) => {
    try {
      await removeBoardItem(boardId, itemId);
      // Refresh
      handleExpand(boardId);
      load();
    } catch { /* empty */ }
  };

  return (
    <PageShell title="Creative Boards" subtitle="Organize saved ads into collections" actions={
      <button onClick={() => setShowCreateModal(true)} className="px-3 py-1.5 bg-ats-accent text-white rounded-lg text-sm font-semibold">New Board</button>
    }>
      {showCreateModal && <CreateBoardModal onClose={() => setShowCreateModal(false)} onSubmit={handleCreate} />}

      {loading && <div className="h-20 bg-ats-card rounded-xl animate-pulse" />}

      {!loading && (
        <div className="grid gap-3">
          {boards.map(b => (
            <div key={b.id} className={cardCls}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleExpand(b.id)}>
                  <div className="w-10 h-10 bg-ats-accent/20 rounded-lg flex items-center justify-center text-ats-accent font-bold text-lg">
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    {editingBoard === b.id ? (
                      <input value={editName} onChange={e => setEditName(e.target.value)} onBlur={() => handleRename(b.id)} onKeyDown={e => e.key === 'Enter' && handleRename(b.id)}
                        className="bg-ats-bg border border-ats-border rounded px-2 py-0.5 text-sm text-ats-text" autoFocus />
                    ) : (
                      <span className="text-sm font-semibold text-ats-text">{b.name}</span>
                    )}
                    {b.description && <p className="text-xs text-ats-text-muted">{b.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ats-text-muted">{b.item_count} items</span>
                  <button onClick={() => { setEditingBoard(b.id); setEditName(b.name); }} className="text-xs text-ats-accent hover:underline">Rename</button>
                  <button onClick={() => handleDelete(b.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  <span className="text-xs text-ats-text-muted">{expandedBoard === b.id ? '▼' : '▶'}</span>
                </div>
              </div>

              {expandedBoard === b.id && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {boardItems.map((item, i) => (
                    <div key={i} className="bg-ats-bg rounded-lg p-2 border border-ats-border/50">
                      {item.thumbnail_url && <img src={item.thumbnail_url} alt="" className="w-full h-20 object-cover rounded mb-1" />}
                      <div className="text-xs font-semibold text-ats-text truncate">{item.headline || item.brand_name || 'Creative'}</div>
                      <div className="text-[10px] text-ats-text-muted">{item.brand_name}</div>
                    </div>
                  ))}
                  {boardItems.length === 0 && (
                    <div className="col-span-full text-center py-4 text-xs text-ats-text-muted">
                      No items in this board. Add creatives from the Inspo library.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {boards.length === 0 && (
            <div className={`${cardCls} text-center py-8`}>
              <div className="text-3xl mb-3">📋</div>
              <h3 className="text-sm font-semibold text-ats-text mb-1">No Boards Yet</h3>
              <p className="text-xs text-ats-text-muted mb-3">Create boards to organize your saved competitor ads.</p>
              <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold">Create First Board</button>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
