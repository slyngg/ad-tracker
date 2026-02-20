interface FiltersProps {
  offers: string[];
  accounts: string[];
  filterOffer: string;
  filterAccount: string;
  onOfferChange: (v: string) => void;
  onAccountChange: (v: string) => void;
}

export default function Filters({
  offers,
  accounts,
  filterOffer,
  filterAccount,
  onOfferChange,
  onAccountChange,
}: FiltersProps) {
  const selectStyle: React.CSSProperties = {
    background: '#111827',
    color: '#d1d5db',
    border: '1px solid #374151',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 13,
    flex: 1,
    minWidth: 120,
    appearance: 'none',
    WebkitAppearance: 'none',
  };

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      <select
        value={filterOffer}
        onChange={(e) => onOfferChange(e.target.value)}
        style={selectStyle}
      >
        {offers.map((o) => (
          <option key={o} value={o}>
            {o === 'All' ? 'All Offers' : o}
          </option>
        ))}
      </select>
      <select
        value={filterAccount}
        onChange={(e) => onAccountChange(e.target.value)}
        style={selectStyle}
      >
        {accounts.map((a) => (
          <option key={a} value={a}>
            {a === 'All' ? 'All Accounts' : a}
          </option>
        ))}
      </select>
    </div>
  );
}
