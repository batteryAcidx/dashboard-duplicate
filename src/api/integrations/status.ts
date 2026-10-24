import { invoke } from '../http';
import type { IntegrationStatusMap } from '../../domain';

/** Asks the backend which integrations have everything they need. Only names are returned, never secrets. */
export const integrationStatusApi = {
  get: () => invoke<IntegrationStatusMap>('integration-status', {}),
};
