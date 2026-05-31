class LogController {
  constructor(logService) {
    this.logService = logService;
  }

  async getLogs(req, res) {
    try {
      const { startTime, endTime, action, deviceId, area, page, pageSize } = req.query;

      const options = {
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        action,
        deviceId,
        area,
        page: page ? parseInt(page) : 1,
        pageSize: pageSize ? parseInt(pageSize) : 100
      };

      const result = await this.logService.getLogs(options);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Failed to get logs:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async exportLogs(req, res) {
    try {
      const { startTime, endTime, action, deviceId, area, format } = req.query;

      const options = {
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        action,
        deviceId,
        area,
        format: format || 'csv'
      };

      const content = await this.logService.exportLogs(options);

      const now = new Date();
      const filename = `control_logs_${now.toISOString().slice(0, 10)}`;

      if (options.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send('\uFEFF' + content);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.send(content);
      }
    } catch (error) {
      console.error('Failed to export logs:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getStats(req, res) {
    try {
      const { startTime, endTime } = req.query;

      const start = startTime ? new Date(startTime) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = endTime ? new Date(endTime) : new Date();

      const stats = await this.logService.getActionStats(start, end);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Failed to get log stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = LogController;
