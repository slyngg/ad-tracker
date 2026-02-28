import { useState, useCallback } from 'react';
import type { LiveCampaign } from '../types';

export default function useBulkSelection() {
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((campaignId: string) => {
    setSelectedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(campaignId)) next.delete(campaignId); else next.add(campaignId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((campaigns: LiveCampaign[]) => {
    setSelectedCampaigns(prev => {
      if (prev.size === campaigns.length) {
        return new Set();
      }
      return new Set(campaigns.map(c => c.campaign_id));
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCampaigns(new Set());
  }, []);

  return { selectedCampaigns, toggleSelect, toggleSelectAll, clearSelection };
}
