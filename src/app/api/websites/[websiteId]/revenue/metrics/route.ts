import { z } from 'zod';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, withDateRange } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getRevenueMetrics } from '@/queries/sql/reports/getRevenueMetrics';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({
    type: z.enum(['country', 'region', 'referrer', 'channel']),
    currency: z.string().optional(),
    ...filterParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const { type, currency = 'USD', ...rest } = query;
  const filters = await getQueryFilters(rest, websiteId);

  const data = await getRevenueMetrics(websiteId, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    unit: filters.unit,
    timezone: filters.timezone,
    currency,
    compare: filters.compare,
  }, filters);

  return json(data[type] || []);
}
