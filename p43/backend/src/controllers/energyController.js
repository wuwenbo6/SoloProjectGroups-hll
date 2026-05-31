class EnergyController {
  constructor(energyService, daylightService) {
    this.energyService = energyService;
    this.daylightService = daylightService;
  }

  async getSummary(req, res) {
    try {
      const { startTime, endTime, area } = req.query;

      const start = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = endTime ? new Date(endTime) : new Date();

      const summary = await this.energyService.getSummary(start, end, area);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Failed to get energy summary:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getStats(req, res) {
    try {
      const { period, startTime, endTime, area } = req.query;

      const validPeriods = ['hourly', 'daily', 'weekly', 'monthly'];
      const statPeriod = validPeriods.includes(period) ? period : 'hourly';

      const now = new Date();
      let start, end;

      if (startTime && endTime) {
        start = new Date(startTime);
        end = new Date(endTime);
      } else {
        switch (statPeriod) {
          case 'hourly':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - 24);
            end = now;
            break;
          case 'daily':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            end = now;
            break;
          case 'weekly':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28);
            end = now;
            break;
          case 'monthly':
            start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            end = now;
            break;
        }
      }

      const stats = await this.energyService.getStats(statPeriod, start, end, area);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Failed to get energy stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getComparison(req, res) {
    try {
      const { period, area } = req.query;

      const validPeriods = ['daily', 'weekly', 'monthly'];
      const comparisonPeriod = validPeriods.includes(period) ? period : 'daily';

      const comparison = await this.energyService.getComparison(comparisonPeriod, area);

      res.json({
        success: true,
        data: comparison
      });
    } catch (error) {
      console.error('Failed to get energy comparison:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getDaylightInfo(req, res) {
    try {
      const currentLux = this.daylightService.getCurrentLux();
      const rules = this.daylightService.rules.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        enabled: r.enabled,
        triggerCondition: r.triggerCondition,
        action: r.action
      }));

      res.json({
        success: true,
        data: {
          currentLux,
          rules,
          lastAdjustments: Object.fromEntries(this.daylightService.lastAdjustments)
        }
      });
    } catch (error) {
      console.error('Failed to get daylight info:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = EnergyController;
