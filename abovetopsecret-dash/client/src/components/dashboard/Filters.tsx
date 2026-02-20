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
  return (
    <div className="flex gap-2 mb-3 flex-wrap">
      <select
        value={filterOffer}
        onChange={(e) => onOfferChange(e.target.value)}
        className="bg-ats-card text-ats-text-secondary border border-[#374151] rounded-lg px-4 py-3 text-sm flex-1 min-w-[120px] appearance-none"
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
        className="bg-ats-card text-ats-text-secondary border border-[#374151] rounded-lg px-4 py-3 text-sm flex-1 min-w-[120px] appearance-none"
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
