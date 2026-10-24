import { rpc } from '../http';
import type { ActivityResult } from '../../domain';

export const activityApi = {
  list: (args: Record<string, unknown>) => rpc<ActivityResult>('admin_activity_list', args),
};
