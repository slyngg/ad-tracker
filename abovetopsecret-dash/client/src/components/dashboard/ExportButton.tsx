import { MetricRow } from '../../lib/api';
import { fmt } from '../../lib/formatters';

interface ExportButtonProps {
  data: MetricRow[];
}

export default function ExportButton({ data }: ExportButtonProps) {
  const handleExport = () => {
    const headers = [
      'Offer', 'Account', 'Spend', 'Revenue', 'ROI', 'CPA', 'AOV',
      'CTR', 'CPM', 'CPC', 'CVR', 'Conversions', 'New %',
      '1-Pack', '3-Pack', '5-Pack', 'Sub %', 'Upsell',
    ];

    const rows = data.map((r) => [
      `"${r.offer_name}"`,
      `"${r.account_name}"`,
      r.spend.toFixed(2),
      r.revenue.toFixed(2),
      r.roi.toFixed(4),
      r.cpa.toFixed(2),
      r.aov.toFixed(2),
      r.ctr.toFixed(4),
      r.cpm.toFixed(2),
      r.cpc.toFixed(2),
      r.cvr.toFixed(4),
      r.conversions.toString(),
      r.new_customer_pct.toFixed(4),
      r.take_rate_1.toFixed(1),
      r.take_rate_3.toFixed(1),
      r.take_rate_5.toFixed(1),
      r.subscription_pct.toFixed(1),
      r.upsell_take_rate.toFixed(1),
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opticdata-metrics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="bg-ats-border border-none text-ats-text-muted px-2.5 py-1.5 rounded-md text-xs cursor-pointer hover:bg-ats-hover transition-colors"
    >
      CSV
    </button>
  );
}
