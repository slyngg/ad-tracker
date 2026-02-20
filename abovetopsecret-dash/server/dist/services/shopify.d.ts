interface ShopifyLineItem {
    title: string;
    quantity: number;
}
interface ShopifyOrder {
    id: number;
    order_number?: number;
    total_price: string;
    subtotal_price?: string;
    line_items: ShopifyLineItem[];
    customer?: {
        orders_count?: number;
    };
    landing_site?: string;
}
export declare function processShopifyOrder(order: ShopifyOrder): Promise<string>;
export {};
//# sourceMappingURL=shopify.d.ts.map