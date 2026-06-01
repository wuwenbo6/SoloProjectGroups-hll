import { Router } from 'express';
import {
  getAlarmLogs,
  acknowledgeAlarm,
  acknowledgeAllAlarms,
  getUnacknowledgedAlarmCount,
} from '../database/index.js';
import {
  authenticateToken,
  AuthRequest,
  requireRole,
  ROLES,
} from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const { startTime, endTime, limit = '1000' } = req.query;

    const alarms = getAlarmLogs(
      startTime as string,
      endTime as string,
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: alarms,
    });
  } catch (error) {
    console.error('Get alarms error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get alarms',
    });
  }
});

router.get('/count/unacknowledged', authenticateToken, (req, res) => {
  try {
    const count = getUnacknowledgedAlarmCount();
    res.json({
      success: true,
      data: count,
    });
  } catch (error) {
    console.error('Get alarm count error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get alarm count',
    });
  }
});

router.post('/:id/acknowledge', authenticateToken, requireRole(ROLES.ADMIN, ROLES.OPERATOR), (req: AuthRequest, res) => {
  try {
    const alarmId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    acknowledgeAlarm(alarmId, userId);

    res.json({
      success: true,
      message: 'Alarm acknowledged',
    });
  } catch (error) {
    console.error('Acknowledge alarm error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to acknowledge alarm',
    });
  }
});

router.post('/acknowledge/all', authenticateToken, requireRole(ROLES.ADMIN, ROLES.OPERATOR), (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    acknowledgeAllAlarms(userId);

    res.json({
      success: true,
      message: 'All alarms acknowledged',
    });
  } catch (error) {
    console.error('Acknowledge all alarms error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to acknowledge all alarms',
    });
  }
});

router.get('/export/csv', authenticateToken, requireRole(ROLES.ADMIN, ROLES.OPERATOR), (req, res) => {
  try {
    const { startTime, endTime } = req.query;

    const alarms = getAlarmLogs(
      startTime as string,
      endTime as string,
      10000
    ) as any[];

    const headers = ['ID', 'Type', 'Message', 'Severity', 'Temperature', 'Pressure', 'Acknowledged', 'Acknowledged By', 'Timestamp'];
    const rows = alarms.map((alarm) => [
      alarm.id,
      alarm.type,
      `"${alarm.message}"`,
      alarm.severity,
      alarm.temperature?.toFixed(2) || '',
      alarm.pressure?.toFixed(3) || '',
      alarm.acknowledged ? 'Yes' : 'No',
      alarm.acknowledged_by_name || '',
      alarm.timestamp,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="alarm_logs_${new Date().toISOString().split('T')[0]}.csv"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    res.send('\uFEFF' + csvContent);
  } catch (error) {
    console.error('Export alarms error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export alarms',
    });
  }
});

router.get('/export/json', authenticateToken, requireRole(ROLES.ADMIN, ROLES.OPERATOR), (req, res) => {
  try {
    const { startTime, endTime } = req.query;

    const alarms = getAlarmLogs(
      startTime as string,
      endTime as string,
      10000
    );

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="alarm_logs_${new Date().toISOString().split('T')[0]}.json"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    res.send(JSON.stringify(alarms, null, 2));
  } catch (error) {
    console.error('Export alarms error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export alarms',
    });
  }
});

export default router;
