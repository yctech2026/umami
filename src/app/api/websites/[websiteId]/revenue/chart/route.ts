import { z } from 'zod';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, withDateRange } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getRevenue, type RevenuParameters } from '@/queries/sql/reports/getRevenue';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({
    currency: z.string().optional().default('USD'),
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

  const { currency, ...rest } = query;
  const filters = await getQueryFilters(rest, websiteId);

  const data = await getRevenue(
    websiteId,
    {
      startDate: filters.startDate,
      endDate: filters.endDate,
      unit: filters.unit,
      timezone: filters.timezone,
      currency,
      compare: filters.compare,
    } as RevenuParameters,
    filters,
  );

  return json(data.chart || []);
}
