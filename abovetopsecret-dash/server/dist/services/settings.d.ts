export declare function getSetting(key: string): Promise<string | undefined>;
export declare function setSetting(key: string, value: string, updatedBy?: string): Promise<void>;
export declare function deleteSetting(key: string): Promise<void>;
export declare function getAllSettings(): Promise<Record<string, string>>;
//# sourceMappingURL=settings.d.ts.map