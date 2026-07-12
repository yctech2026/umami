import { getRecorder } from '@/queries/sql/website/getRecorder';
import { json, notFound } from '@/lib/response';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { websiteId } = await params;

  const result = await getRecorder(websiteId);

  if (!result) {
    return notFound();
  }

  return json(result);
}
