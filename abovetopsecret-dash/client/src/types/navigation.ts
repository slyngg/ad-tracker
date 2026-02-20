export interface NavLink {
  label: string;
  path: string;
  icon: string;
  disabled?: boolean;
}

export interface NavSectionConfig {
  label: string;
  icon: string;
  path?: string;
  children?: NavLink[];
}
