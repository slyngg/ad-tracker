// GA4 Client - Google Analytics Data API wrapper
// Uses dynamic import so the app works even without @google-analytics/data installed

export interface GA4ReportRow {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

export interface GA4Client {
  propertyId: string;
  client: any;
}

export async function initGA4Client(credentialsJson: string, propertyId: string): Promise<GA4Client | null> {
  try {
    const { BetaAnalyticsDataClient } = await import('@google-analytics/data' as any);
    const credentials = JSON.parse(credentialsJson);
    const client = new BetaAnalyticsDataClient({ credentials });
    return { propertyId, client };
  } catch {
    console.warn('[GA4] @google-analytics/data not installed or credentials invalid');
    return null;
  }
}

async function runReport(
  ga4: GA4Client,
  dimensions: string[],
  metrics: string[],
  startDate: string,
  endDate: string,
): Promise<GA4ReportRow[]> {
  try {
    const [response] = await ga4.client.runReport({
      property: `properties/${ga4.propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: dimensions.map(name => ({ name })),
      metrics: metrics.map(name => ({ name })),
    });

    if (!response.rows) return [];

    return response.rows.map((row: any) => {
      const dims: Record<string, string> = {};
      const mets: Record<string, number> = {};
      dimensions.forEach((d, i) => { dims[d] = row.dimensionValues?.[i]?.value || ''; });
      metrics.forEach((m, i) => { mets[m] = parseFloat(row.metricValues?.[i]?.value || '0'); });
      return { dimensions: dims, metrics: mets };
    });
  } catch (err) {
    console.error('[GA4] Report error:', err);
    return [];
  }
}

export async function getGA4Sessions(ga4: GA4Client, startDate: string, endDate: string): Promise<GA4ReportRow[]> {
  return runReport(ga4,
    ['date', 'sessionSource', 'sessionMedium', 'sessionCampaignName', 'deviceCategory', 'country', 'city', 'landingPage'],
    ['sessions', 'totalUsers', 'newUsers', 'screenPageViews', 'screenPageViewsPerSession', 'averageSessionDuration', 'bounceRate', 'conversions', 'sessionConversionRate', 'ecommerce:totalRevenue', 'addToCarts'],
    startDate, endDate,
  );
}

export async function getGA4PageData(ga4: GA4Client, startDate: string, endDate: string): Promise<GA4ReportRow[]> {
  return runReport(ga4,
    ['date', 'pagePath', 'pageTitle'],
    ['sessions', 'screenPageViews', 'averageSessionDuration', 'conversions', 'sessionConversionRate', 'ecommerce:totalRevenue'],
    startDate, endDate,
  );
}

export async function getGA4SearchQueries(ga4: GA4Client, startDate: string, endDate: string): Promise<GA4ReportRow[]> {
  return runReport(ga4,
    ['date', 'searchTerm'],
    ['sessions', 'conversions', 'ecommerce:totalRevenue'],
    startDate, endDate,
  );
}

export async function getGA4FunnelEvents(ga4: GA4Client, startDate: string, endDate: string): Promise<GA4ReportRow[]> {
  return runReport(ga4,
    ['date', 'eventName', 'deviceCategory', 'sessionSource'],
    ['eventCount', 'totalUsers'],
    startDate, endDate,
  );
}

export async function getGA4ProductData(ga4: GA4Client, startDate: string, endDate: string): Promise<GA4ReportRow[]> {
  return runReport(ga4,
    ['date', 'itemName', 'itemId', 'itemCategory'],
    ['itemsViewed', 'itemsAddedToCart', 'itemsPurchased', 'itemRevenue'],
    startDate, endDate,
  );
}

export async function testGA4Connection(credentialsJson: string, propertyId: string): Promise<{ success: boolean; error?: string }> {
  const ga4 = await initGA4Client(credentialsJson, propertyId);
  if (!ga4) return { success: false, error: 'Failed to initialize GA4 client. Check credentials.' };

  try {
    const rows = await runReport(ga4, ['date'], ['sessions'], '7daysAgo', 'today');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection test failed' };
  }
}
