import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, X, Building2, Tag } from 'lucide-react';
import { useAccountStore } from '../../stores/accountStore';

export default function ClientBrandSwitcher() {
  const {
    clients, brands, selectedClientId, selectedBrandId,
    setSelectedClientId, setSelectedBrandId,
    loadClients, loadBrands,
  } = useAccountStore();
  const [open, setOpen] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadClients();
    loadBrands();
  }, [loadClients, loadBrands]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Don't render if user has no clients
  if (clients.length === 0) return null;

  // Compute label
  let label = 'All Data';
  if (selectedBrandId) {
    const brand = brands.find((b) => b.id === selectedBrandId);
    const client = clients.find((c) => c.id === brand?.client_id);
    label = client ? `${client.name} > ${brand?.name || ''}` : brand?.name || 'Brand';
  } else if (selectedClientId) {
    const client = clients.find((c) => c.id === selectedClientId);
    label = client?.name || 'Client';
  }

  const brandsForClient = (clientId: number) =>
    brands.filter((b) => b.client_id === clientId);

  function selectClient(clientId: number) {
    setSelectedClientId(clientId);
    setOpen(false);
  }

  function selectBrand(brandId: number) {
    // Set the brand's parent client as selectedClientId too
    const brand = brands.find((b) => b.id === brandId);
    if (brand?.client_id) {
      // Set client without clearing brand by using raw localStorage + set
      localStorage.setItem('optic_selected_client', String(brand.client_id));
      useAccountStore.setState({ selectedClientId: brand.client_id });
    }
    setSelectedBrandId(brandId);
    setOpen(false);
  }

  function clearSelection() {
    setSelectedClientId(null);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative px-3 py-2 border-b border-ats-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-medium text-ats-text bg-ats-bg border border-ats-border hover:border-ats-accent transition-colors"
      >
        <Building2 size={14} className="text-ats-text-muted flex-shrink-0" />
        {(selectedClientId || selectedBrandId) && (
          <span className="w-2 h-2 rounded-full bg-ats-accent flex-shrink-0" />
        )}
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-3 right-3 mt-1 bg-ats-card border border-ats-border rounded-xl shadow-lg z-50 py-1 max-h-80 overflow-y-auto">
          {/* Header */}
          <div className="px-3 py-2 border-b border-ats-border flex items-center justify-between">
            <span className="text-xs font-semibold text-ats-text-muted uppercase tracking-wider">Client / Brand</span>
            {(selectedClientId || selectedBrandId) && (
              <button
                onClick={clearSelection}
                className="text-xs text-ats-accent hover:underline flex items-center gap-1 min-h-[44px] px-2"
              >
                <X size={10} /> Clear
              </button>
            )}
          </div>

          {/* All Data option */}
          <button
            onClick={clearSelection}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] hover:bg-ats-bg transition-colors text-left ${
              !selectedClientId && !selectedBrandId ? 'bg-ats-bg' : ''
            }`}
          >
            <span className="text-xs font-medium text-ats-text">All Data</span>
          </button>

          {/* Client list */}
          {clients.map((client) => {
            const clientBrands = brandsForClient(client.id);
            const isExpanded = expandedClientId === client.id;
            const isSelected = selectedClientId === client.id && !selectedBrandId;

            return (
              <div key={client.id}>
                <div className="flex items-center">
                  {/* Expand toggle (if has brands) */}
                  {clientBrands.length > 0 ? (
                    <button
                      onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
                      className="pl-3 pr-1 py-2.5 min-h-[44px] text-ats-text-muted hover:text-ats-text"
                    >
                      <ChevronRight size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                  ) : (
                    <span className="pl-3 pr-1 w-[28px]" />
                  )}
                  {/* Client button */}
                  <button
                    onClick={() => selectClient(client.id)}
                    className={`flex-1 flex items-center gap-2 pr-3 py-2.5 min-h-[44px] hover:bg-ats-bg transition-colors text-left ${
                      isSelected ? 'bg-ats-bg' : ''
                    }`}
                  >
                    <Building2 size={12} className="text-ats-text-muted flex-shrink-0" />
                    <span className="text-xs font-medium text-ats-text truncate">{client.name}</span>
                    {clientBrands.length > 0 && (
                      <span className="text-[10px] text-ats-text-muted ml-auto">{clientBrands.length}</span>
                    )}
                  </button>
                </div>

                {/* Expanded brands */}
                {isExpanded && clientBrands.map((brand) => {
                  const isBrandSelected = selectedBrandId === brand.id;
                  return (
                    <button
                      key={brand.id}
                      onClick={() => selectBrand(brand.id)}
                      className={`w-full flex items-center gap-2 pl-10 pr-3 py-2 min-h-[40px] hover:bg-ats-bg transition-colors text-left ${
                        isBrandSelected ? 'bg-ats-bg' : ''
                      }`}
                    >
                      <Tag size={10} className="text-ats-text-muted flex-shrink-0" />
                      <span className="text-xs text-ats-text truncate">{brand.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
