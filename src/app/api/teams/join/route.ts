import { z } from 'zod';
import { ROLES } from '@/lib/constants';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound } from '@/lib/response';
import { createTeamUser, findTeam, getTeamUser } from '@/queries/drizzle';

export async function POST(request: Request) {
  const schema = z.object({
    accessCode: z.string().max(50),
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { accessCode } = body;

  const team = await findTeam({
    where: {
      accessCode,
    },
  });

  if (!team) {
    return notFound({ message: 'Team not found.', code: 'team-not-found' });
  }

  const teamUser = await getTeamUser(team.teamId, auth.user.userId);

  if (teamUser) {
    return badRequest({ message: 'User is already a team member.' });
  }

  const user = await createTeamUser(auth.user.userId, team.teamId, ROLES.teamMember);

  return json(user);
}
