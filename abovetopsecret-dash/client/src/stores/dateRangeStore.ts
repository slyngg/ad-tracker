import { create } from 'zustand';
import { DateRangeSelection, getDefaultDateRange } from '../components/shared/DateRangePicker';

interface DateRangeState {
  dateRange: DateRangeSelection;
  setDateRange: (range: DateRangeSelection) => void;
}

export const useDateRangeStore = create<DateRangeState>((set) => ({
  dateRange: getDefaultDateRange(),
  setDateRange: (range: DateRangeSelection) => set({ dateRange: range }),
}));
