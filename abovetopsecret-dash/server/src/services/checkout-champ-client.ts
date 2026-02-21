import https from 'https';
import { getSetting } from './settings';

// ── Types ────────────────────────────────────────────────────────

export interface CCCredentials {
  loginId: string;
  password: string;
  baseUrl: string;
}

export interface CCResponse<T = any> {
  result: 'SUCCESS' | 'ERROR';
  message: string | {
    totalResults?: number;
    resultsPerPage?: number;
    page?: number;
    data: T[];
  };
}

export interface CCOrder {
  orderId: string;
  customerId: string;
  campaignId: string;
  campaignName: string;
  orderStatus: string;
  totalAmount: string;
  salesTax: string;
  totalShipping: string;
  dateCreated: string;
  dateUpdated: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  shipAddress1: string;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry: string;
  paySource: string;
  cardType: string;
  couponCode: string;
  ipAddress: string;
  sourceValue1: string;
  sourceValue2: string;
  sourceValue3: string;
  sourceValue4: string;
  sourceValue5: string;
  items: CCOrderItem[];
  [key: string]: any;
}

export interface CCOrderItem {
  productId: string;
  name: string;
  sku: string;
  price: string;
  qty: string;
  shippingPrice: string;
  billingCycleNumber: string;
  recurringStatus: string;
  [key: string]: any;
}

export interface CCCustomer {
  customerId: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  shipFirstName: string;
  shipLastName: string;
  shipAddress1: string;
  shipAddress2: string;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry: string;
  dateCreated: string;
  dateUpdated: string;
  [key: string]: any;
}

export interface CCTransaction {
  transactionId: string;
  orderId: string;
  customerId: string;
  purchaseId: string;
  txnType: string;
  totalAmount: string;
  responseType: string;
  responseText: string;
  merchantId: string;
  merchantTxnId: string;
  paySource: string;
  cardType: string;
  cardLast4: string;
  isChargedback: string;
  chargebackAmount: string;
  chargebackDate: string;
  chargebackReasonCode: string;
  dateCreated: string;
  [key: string]: any;
}

export interface CCPurchase {
  purchaseId: string;
  orderId: string;
  customerId: string;
  productId: string;
  productName: string;
  status: string;
  price: string;
  qty: string;
  shippingPrice: string;
  billingCycleNumber: string;
  billingIntervalDays: string;
  nextBillDate: string;
  dateCreated: string;
  dateUpdated: string;
  [key: string]: any;
}

export interface CCProduct {
  productId: string;
  campaignProductId: string;
  productName: string;
  productSku: string;
  productPrice: string;
  productCost: string;
  productCategory: string;
  isSubscription: string;
  rebillDays: string;
  trialDays: string;
  productStatus: string;
  [key: string]: any;
}

export interface CCCampaign {
  campaignId: string;
  campaignName: string;
  campaignType: string;
  campaignStatus: string;
  dateCreated: string;
  [key: string]: any;
}

export interface CCFulfillment {
  fulfillmentId: string;
  orderId: string;
  fulfillmentStatus: string;
  trackingNumber: string;
  shipCarrier: string;
  shipMethod: string;
  dateShipped: string;
  [key: string]: any;
}

export interface CCMember {
  memberId: string;
  customerId: string;
  clubId: string;
  clubName: string;
  status: string;
  dateCreated: string;
  [key: string]: any;
}

export interface CCMidSummary {
  midId: string;
  midName: string;
  totalSales: string;
  totalDeclines: string;
  totalRefunds: string;
  totalChargebacks: string;
  approvalRate: string;
  [key: string]: any;
}

export interface CCRetentionRow {
  [key: string]: any;
}

export interface CCPaginatedResult<T> {
  data: T[];
  totalResults: number;
  resultsPerPage: number;
  page: number;
}

// Query param types for each endpoint
export interface OrderQueryParams {
  orderId?: string;
  orderStatus?: 'COMPLETE' | 'PARTIAL' | 'DECLINED' | 'REFUNDED' | 'CANCELLED';
  campaignId?: number;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  phoneNumber?: string;
  companyName?: string;
  address1?: string;
  postalCode?: string;
  city?: string;
  state?: string;
  country?: string;
  ipAddress?: string;
  isDeclineSave?: boolean;
  dateRangeType?: 'dateCreated' | 'dateUpdated';
  startDate?: string;
  endDate?: string;
  includeCustomFields?: boolean;
  resultsPerPage?: number;
  page?: number;
}

export interface CustomerQueryParams {
  customerId?: number;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  phoneNumber?: string;
  companyName?: string;
  address1?: string;
  postalCode?: string;
  city?: string;
  state?: string;
  country?: string;
  ipAddress?: string;
  dateRangeType?: 'dateCreated' | 'dateUpdated' | 'mostRecentActivity';
  startDate?: string;
  endDate?: string;
  sortDir?: 0 | 1;
  resultsPerPage?: number;
  page?: number;
}

export interface TransactionQueryParams {
  orderId?: string;
  purchaseId?: string;
  customerId?: number;
  txnType?: 'SALE' | 'AUTHORIZE' | 'CAPTURE' | 'VOID' | 'REFUND';
  paySource?: 'CREDITCARD' | 'CHECK' | 'PREPAID';
  responseType?: 'SUCCESS' | 'HARD_DECLINE' | 'SOFT_DECLINE';
  merchantTxnId?: string;
  merchantId?: number;
  cardLast4?: string;
  cardBin?: string;
  isChargedback?: boolean;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  affId?: string;
  dateRangeType?: 'dateCreated' | 'dateUpdated';
  startDate?: string;
  endDate?: string;
  sortDir?: 0 | 1;
  resultsPerPage?: number;
  page?: number;
}

export interface PurchaseQueryParams {
  customerId?: number;
  orderId?: string;
  purchaseId?: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  phoneNumber?: string;
  dateRangeType?: 'dateCreated' | 'dateUpdated';
  startDate?: string;
  endDate?: string;
  resultsPerPage?: number;
  page?: number;
}

export interface CampaignQueryParams {
  campaignId?: number;
  campaignName?: string;
  campaignType?: 'PHONE' | 'ECOMMERCE' | 'LANDER';
  startDate?: string;
  endDate?: string;
  resultsPerPage?: number;
  page?: number;
}

export interface MemberQueryParams {
  customerId: number;
  clubId: number;
  memberId?: string;
  orderId?: string;
  purchaseId?: string;
  startDate?: string;
  endDate?: string;
  resultsPerPage?: number;
  page?: number;
}

export interface CustomerHistoryParams {
  customerId?: number;
  startDate?: string;
  endDate?: string;
  resultsPerPage?: number;
  page?: number;
}

export interface MidSummaryParams {
  midId?: number;
  startDate?: string;
  endDate?: string;
  resultsPerPage?: number;
  page?: number;
}

export interface RetentionParams {
  reportType: 'campaign' | 'source' | 'mid';
  campaignId?: number;
  productId?: number;
  affiliateId?: string;
  callCenterId?: string;
  maxCycles?: number;
  include?: 'ByProduct' | 'ByPublisher' | 'BySubAff';
  startDate?: string;
  endDate?: string;
  resultsPerPage?: number;
  page?: number;
}

// ── HTTP Transport ───────────────────────────────────────────────

function httpRequest(
  url: string,
  method: 'GET' | 'POST' = 'GET',
  postData?: string,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Accept': 'application/json',
        ...(postData ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
        }
      });
      res.on('error', reject);
    });

    req.setTimeout(30_000, () => req.destroy(new Error('Request timeout after 30s')));
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// ── Client Class ─────────────────────────────────────────────────

export class CheckoutChampClient {
  private loginId: string;
  private password: string;
  private baseUrl: string;

  constructor(creds: CCCredentials) {
    this.loginId = creds.loginId;
    this.password = creds.password;
    this.baseUrl = creds.baseUrl.replace(/\/$/, '');
  }

  /**
   * Create a client from stored settings for a given user.
   * Returns null if credentials are not configured.
   */
  static async fromSettings(userId?: number): Promise<CheckoutChampClient | null> {
    const loginId = await getSetting('cc_login_id', userId);
    const password = await getSetting('cc_password', userId);
    const baseUrl = await getSetting('cc_api_url', userId) || 'https://api.checkoutchamp.com';
    if (!loginId || !password) return null;
    return new CheckoutChampClient({ loginId, password, baseUrl });
  }

  // ── Core request methods ──────────────────────────────────────

  private buildUrl(endpoint: string, params: Record<string, any> = {}): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('loginId', this.loginId);
    url.searchParams.set('password', this.password);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async get<T = any>(endpoint: string, params: Record<string, any> = {}): Promise<CCResponse<T>> {
    const url = this.buildUrl(endpoint, params);
    const response = await httpRequest(url, 'GET');
    if (response.result === 'ERROR') {
      throw new CCApiError(
        typeof response.message === 'string' ? response.message : 'Unknown error',
        endpoint,
      );
    }
    return response;
  }

  private async post<T = any>(endpoint: string, params: Record<string, any> = {}): Promise<CCResponse<T>> {
    const url = this.buildUrl(endpoint);
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        body.set(key, String(value));
      }
    }
    const response = await httpRequest(url, 'POST', body.toString());
    if (response.result === 'ERROR') {
      throw new CCApiError(
        typeof response.message === 'string' ? response.message : 'Unknown error',
        endpoint,
      );
    }
    return response;
  }

  /**
   * Extract data array from a CC API response.
   */
  private extractData<T>(response: CCResponse<T>): CCPaginatedResult<T> {
    if (typeof response.message === 'string') {
      return { data: [], totalResults: 0, resultsPerPage: 0, page: 0 };
    }
    return {
      data: response.message.data || [],
      totalResults: response.message.totalResults || 0,
      resultsPerPage: response.message.resultsPerPage || 25,
      page: response.message.page || 1,
    };
  }

  /**
   * Auto-paginate a query endpoint, fetching all pages.
   */
  async fetchAllPages<T>(
    endpoint: string,
    params: Record<string, any> = {},
    maxPages = 100,
  ): Promise<T[]> {
    const allData: T[] = [];
    let page = 1;
    const perPage = params.resultsPerPage || 200;

    while (page <= maxPages) {
      const response = await this.get<T>(endpoint, {
        ...params,
        resultsPerPage: perPage,
        page,
      });
      const result = this.extractData(response);
      if (result.data.length === 0) break;

      allData.push(...result.data);

      if (allData.length >= result.totalResults || result.data.length < perPage) break;
      page++;
    }

    return allData;
  }

  // ── Orders ────────────────────────────────────────────────────

  async queryOrders(params: OrderQueryParams): Promise<CCPaginatedResult<CCOrder>> {
    const response = await this.get<CCOrder>('/order/query/', params as any);
    return this.extractData(response);
  }

  async queryAllOrders(params: Omit<OrderQueryParams, 'page'>): Promise<CCOrder[]> {
    return this.fetchAllPages<CCOrder>('/order/query/', params as any);
  }

  async cancelOrder(orderId: string, cancelReason: string, opts?: { fullRefund?: boolean; afterNextBill?: boolean }): Promise<CCResponse> {
    return this.post('/order/cancel/', { orderId, cancelReason, ...opts });
  }

  async refundOrder(orderId: string, opts: { refundAmount?: number; fullRefund?: boolean }): Promise<CCResponse> {
    return this.post('/order/refund/', { orderId, ...opts });
  }

  async confirmOrder(orderId: string): Promise<CCResponse> {
    return this.post('/order/confirm/', { orderId });
  }

  async qaOrder(orderId: string, action: 'APPROVE' | 'DECLINE'): Promise<CCResponse> {
    return this.post('/order/qa/', { orderId, action });
  }

  async rerunOrder(orderId: string, opts?: { forceBillerId?: string; forceLoadBalancerId?: string }): Promise<CCResponse> {
    return this.post('/order/rerun/', { orderId, ...opts });
  }

  // ── Customers ─────────────────────────────────────────────────

  async queryCustomers(params: CustomerQueryParams): Promise<CCPaginatedResult<CCCustomer>> {
    const response = await this.get<CCCustomer>('/customer/query/', params as any);
    return this.extractData(response);
  }

  async queryAllCustomers(params: Omit<CustomerQueryParams, 'page'>): Promise<CCCustomer[]> {
    return this.fetchAllPages<CCCustomer>('/customer/query/', params as any);
  }

  async updateCustomer(customerId: string, fields: Partial<{
    firstName: string; lastName: string; companyName: string;
    address1: string; address2: string; postalCode: string;
    city: string; state: string; country: string;
    emailAddress: string; phoneNumber: string;
    shipFirstName: string; shipLastName: string;
    shipAddress1: string; shipAddress2: string;
    shipPostalCode: string; shipCity: string; shipState: string; shipCountry: string;
    custom1: string; custom2: string; custom3: string; custom4: string; custom5: string;
  }>): Promise<CCResponse> {
    return this.post('/customer/update/', { customerId, ...fields });
  }

  async addCustomerNote(customerId: string, message: string): Promise<CCResponse> {
    return this.post('/customer/addnote/', { customerId, message });
  }

  async queryCustomerHistory(params: CustomerHistoryParams): Promise<CCPaginatedResult<any>> {
    const response = await this.get('/customer/history/', params as any);
    return this.extractData(response);
  }

  async blacklistCustomer(customerId: string): Promise<CCResponse> {
    return this.post('/customer/blacklist/', { customerId });
  }

  // ── Transactions ──────────────────────────────────────────────

  async queryTransactions(params: TransactionQueryParams): Promise<CCPaginatedResult<CCTransaction>> {
    const response = await this.get<CCTransaction>('/transactions/query/', params as any);
    return this.extractData(response);
  }

  async queryAllTransactions(params: Omit<TransactionQueryParams, 'page'>): Promise<CCTransaction[]> {
    return this.fetchAllPages<CCTransaction>('/transactions/query/', params as any);
  }

  async updateTransaction(transactionId: string, chargeback: {
    chargebackAmount: number;
    chargebackDate: string;
    chargebackReasonCode: string;
    chargebackNote: string;
  }): Promise<CCResponse> {
    return this.post('/transactions/update/', { transactionId, ...chargeback });
  }

  async refundTransaction(transactionId: string, opts: {
    refundAmount: number;
    refundMerchantTxnId: string;
    fullRefund?: boolean;
    cancelPurchase?: boolean;
    externalRefund?: boolean;
  }): Promise<CCResponse> {
    return this.post('/transactions/refund/', { transactionId, ...opts });
  }

  // ── Purchases (Subscriptions) ─────────────────────────────────

  async queryPurchases(params: PurchaseQueryParams): Promise<CCPaginatedResult<CCPurchase>> {
    const response = await this.get<CCPurchase>('/purchase/query/', params as any);
    return this.extractData(response);
  }

  async queryAllPurchases(params: Omit<PurchaseQueryParams, 'page'>): Promise<CCPurchase[]> {
    return this.fetchAllPages<CCPurchase>('/purchase/query/', params as any);
  }

  async updatePurchase(purchaseId: string, fields: Partial<{
    reactivate: boolean;
    status: 'RECYCLE_BILLING' | 'RECYCLE_FAILED';
    billNow: boolean;
    newMerchantId: number;
    price: number;
    shippingPrice: number;
    nextBillDate: string;
    billingIntervalDays: number;
    finalBillingCycle: number;
  }>): Promise<CCResponse> {
    return this.post('/purchase/update/', { purchaseId, ...fields });
  }

  async cancelPurchase(purchaseId: string, cancelReason: string, opts?: { fullRefund?: boolean; afterNextBill?: boolean }): Promise<CCResponse> {
    return this.post('/purchase/cancel/', { purchaseId, cancelReason, ...opts });
  }

  async refundPurchase(purchaseId: string, opts: { refundAmount?: number; fullRefund?: boolean }): Promise<CCResponse> {
    return this.post('/purchase/refund/', { purchaseId, ...opts });
  }

  async pausePurchase(purchaseId: string): Promise<CCResponse> {
    return this.post('/purchase/pause/', { purchaseId });
  }

  // ── Campaigns ─────────────────────────────────────────────────

  async queryCampaigns(params: CampaignQueryParams = {}): Promise<CCPaginatedResult<CCCampaign>> {
    const response = await this.get<CCCampaign>('/campaign/query/', params as any);
    return this.extractData(response);
  }

  async queryAllCampaigns(params: Omit<CampaignQueryParams, 'page'> = {}): Promise<CCCampaign[]> {
    return this.fetchAllPages<CCCampaign>('/campaign/query/', params as any);
  }

  // ── Fulfillment ───────────────────────────────────────────────

  async updateFulfillment(params: {
    orderId?: string;
    fulfillmentId?: string;
    fulfillmentStatus: 'SHIPPED' | 'RMA_PENDING' | 'RETURNED' | 'CANCELLED';
    trackingNumber?: string;
    dateShipped?: string;
    shipCarrier?: string;
    shipMethod?: string;
    refundAmount?: number;
    rmaNumber?: string;
    dateReturned?: string;
  }): Promise<CCResponse> {
    return this.post('/fulfillment/update/', params);
  }

  // ── Members (Clubs) ───────────────────────────────────────────

  async queryMembers(params: MemberQueryParams): Promise<CCPaginatedResult<CCMember>> {
    const response = await this.get<CCMember>('/members/query/', params as any);
    return this.extractData(response);
  }

  async cancelMember(clubId: number, memberId: string): Promise<CCResponse> {
    return this.post('/members/cancel/', { clubId, memberId });
  }

  async reactivateMember(clubId: number, memberId: string): Promise<CCResponse> {
    return this.post('/members/reactivate/', { clubId, memberId });
  }

  // ── Reports ───────────────────────────────────────────────────

  async queryMidSummary(params: MidSummaryParams = {}): Promise<CCPaginatedResult<CCMidSummary>> {
    const response = await this.get<CCMidSummary>('/reports/mid-summary/', params as any);
    return this.extractData(response);
  }

  async queryRetention(params: RetentionParams): Promise<CCPaginatedResult<CCRetentionRow>> {
    const response = await this.get<CCRetentionRow>('/reports/retention/', params as any);
    return this.extractData(response);
  }

  // ── Funnel Flow (Import endpoints) ────────────────────────────

  async importClick(params: {
    pageType: 'presellPage' | 'leadPage' | 'checkoutPage' | 'upsellPage1' | 'upsellPage2' | 'upsellPage3' | 'upsellPage4' | 'thankyouPage';
    campaignId: number;
    userAgent: string;
    ipAddress?: string;
    requestUri?: string;
    sessionId?: string;
  }): Promise<CCResponse & { message: { sessionId: string } }> {
    return this.post('/landers/clicks/import/', params) as any;
  }

  async importLead(params: {
    sessionId: string;
    campaignId?: number;
    orderId?: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    phoneNumber?: string;
    shipAddress1?: string;
    shipCity?: string;
    shipPostalCode?: string;
    shipState?: string;
    shipCountry?: string;
    redirectTo?: string;
    errorRedirectTo?: string;
  }): Promise<CCResponse & { message: { orderId: string } }> {
    return this.post('/leads/import/', params) as any;
  }

  async importOrder(params: {
    sessionId: string;
    campaignId: number;
    orderId?: string;
    salesUrl: string;
    paySource: string;
    cardNumber?: string;
    cardSecurityCode?: string;
    cardMonth?: string;
    cardYear?: string;
    product1_id: number;
    product1_qty?: number;
    product1_price?: number;
    product1_shipPrice?: number;
    [key: string]: any;
  }): Promise<CCResponse & { message: { orderId: string } }> {
    return this.post('/order/import/', params) as any;
  }

  async importUpsale(params: {
    orderId: string;
    sessionId?: string;
    productId: number;
    productQty?: number;
    productPrice?: number;
    productShipPrice?: number;
    replaceProductId?: number;
  }): Promise<CCResponse> {
    return this.post('/upsale/import/', params);
  }

  async confirmPaypal(params: {
    orderId: string;
    token: string;
    PayerID: string;
    baToken?: string;
  }): Promise<CCResponse> {
    return this.post('/transactions/confirmPaypal/', params);
  }

  // ── Convenience / Composite ───────────────────────────────────

  /**
   * Test the connection by querying transactions with limit 1.
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.get('/transactions/query/', { resultsPerPage: 1, startDate: formatCCDate(new Date()), endDate: formatCCDate(new Date()) });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get a single order by ID.
   */
  async getOrder(orderId: string): Promise<CCOrder | null> {
    const result = await this.queryOrders({ orderId });
    return result.data[0] || null;
  }

  /**
   * Get a single customer by ID.
   */
  async getCustomer(customerId: number): Promise<CCCustomer | null> {
    const result = await this.queryCustomers({ customerId });
    return result.data[0] || null;
  }

  /**
   * Get all purchases for a customer.
   */
  async getCustomerPurchases(customerId: number): Promise<CCPurchase[]> {
    return this.queryAllPurchases({ customerId });
  }

  /**
   * Get all transactions for an order.
   */
  async getOrderTransactions(orderId: string): Promise<CCTransaction[]> {
    return this.queryAllTransactions({ orderId });
  }
}

// ── Error class ──────────────────────────────────────────────────

export class CCApiError extends Error {
  endpoint: string;
  constructor(message: string, endpoint: string) {
    super(`[CheckoutChamp ${endpoint}] ${message}`);
    this.name = 'CCApiError';
    this.endpoint = endpoint;
  }
}

// ── Date helper ──────────────────────────────────────────────────

/** Format a Date to Checkout Champ's m/d/Y format */
export function formatCCDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** Format a Date to ISO-ish format for polling (Y-m-d H:i:s) */
export function formatCCDateTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}
