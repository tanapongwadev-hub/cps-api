import { ProductionPlanExpiryJob } from './production-plan-expiry.job';

describe('ProductionPlanExpiryJob', () => {
  it('delegates the hourly expiry scan to the service', async () => {
    const service = {
      expireApprovedPlans: jest.fn(() => Promise.resolve(2)),
    };
    const job = new ProductionPlanExpiryJob(service as never);

    await job.expireApprovedPlans();

    expect(service.expireApprovedPlans).toHaveBeenCalledTimes(1);
  });
});
