import { type LucideIcon } from 'lucide-react';

export interface NavLink {
  label: string;
  path: string;
  icon: LucideIcon;
  disabled?: boolean;
  tourId?: string;
}

export interface NavSectionConfig {
  label: string;
  icon: LucideIcon;
  path?: string;
  children?: NavLink[];
  tourId?: string;
}
