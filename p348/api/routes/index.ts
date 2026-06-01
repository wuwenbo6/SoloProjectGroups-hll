import { Router } from 'express';
import { getDashboardStatsHandler } from '../controllers/statsController';
import { getChargePoints, getChargePointById } from '../controllers/chargePointsController';
import { getTransactions, getTransactionById } from '../controllers/transactionsController';
import { getBillingDetails, getBillingByTransactionId, getPricingRules } from '../controllers/billingController';
import {
  getQueueStats,
  getQueueForChargePoint,
  sendCommand,
  remoteStartTransaction,
  remoteStopTransaction
} from '../controllers/queueController';
import { exportTransactionsCSV } from '../controllers/exportController';

const router = Router();

router.get('/stats/dashboard', getDashboardStatsHandler);

router.get('/chargepoints', getChargePoints);
router.get('/chargepoints/:id', getChargePointById);

router.get('/transactions', getTransactions);
router.get('/transactions/:id', getTransactionById);
router.get('/transactions/export/csv', exportTransactionsCSV);

router.get('/billing', getBillingDetails);
router.get('/billing/:transactionId', getBillingByTransactionId);

router.get('/pricing', getPricingRules);

router.get('/queue', getQueueStats);
router.get('/queue/:chargePointId', getQueueForChargePoint);
router.post('/command/:chargePointId', sendCommand);
router.post('/command/:chargePointId/remote-start', remoteStartTransaction);
router.post('/command/:chargePointId/remote-stop', remoteStopTransaction);

export default router;
