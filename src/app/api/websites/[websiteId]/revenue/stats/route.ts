import { z } from 'zod';
import { getCompareDate } from '@/lib/date';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, withDateRange } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getRevenueStats } from '@/queries/sql/reports/getRevenueStats';
import type { RevenuParameters } from '@/queries/sql/reports/getRevenue';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({
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

  const { currency = 'USD', ...rest } = query;
  const filters = await getQueryFilters(rest, websiteId);

  const parameters: RevenuParameters = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    unit: filters.unit,
    timezone: filters.timezone || 'utc',
    currency,
    compare: filters.compare,
  };

  const data = await getRevenueStats(websiteId, parameters, filters);

  const { startDate, endDate } = getCompareDate(
    parameters.compare ?? 'prev',
    parameters.startDate,
    parameters.endDate,
  );

  const comparison = await getRevenueStats(
    websiteId,
    { ...parameters, startDate, endDate },
    filters,
  );

  return json({ ...data, comparison });
}
