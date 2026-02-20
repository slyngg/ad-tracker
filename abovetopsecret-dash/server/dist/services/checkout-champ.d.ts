interface CCOrder {
    order_id: string;
    offer_name: string;
    revenue: number;
    new_customer: boolean;
    utm_campaign: string;
    fbclid: string;
    subscription_id: string | null;
    quantity: number;
    is_core_sku: boolean;
}
export declare function processCheckoutChampOrder(order: CCOrder): Promise<void>;
export declare function processUpsell(orderId: string, offered: boolean, accepted: boolean, offerName: string): Promise<void>;
export {};
//# sourceMappingURL=checkout-champ.d.ts.map