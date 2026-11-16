import config from './config/config.js';
import serverlessExpress from '@codegenie/serverless-express';
import app from './app.js';

const http = serverlessExpress({ app });

// Scheduled jobs reach this Lambda straight from EventBridge (not through API Gateway), with a
// constant input naming the task. Each lives in backend/infra: 27-staff-sweep.sh.
const TASKS = {
  'expire-limit-overrides': async () => (await import('./services/service.staff.js')).expireLimitOverrides(),
};

export const handler = async (event, context) => {
  if (event?.task) {
    const run = TASKS[event.task];
    if (!run) throw new Error(`Unknown task: ${event.task}`);
    return { task: event.task, result: await run() };
  }
  return http(event, context);
};
