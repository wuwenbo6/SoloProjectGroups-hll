const { ScheduledTask, AutomationRule } = require('../models');

class AutomationController {
  constructor(scheduler, automationEngine, logService) {
    this.scheduler = scheduler;
    this.automationEngine = automationEngine;
    this.logService = logService;
  }

  async getAllScheduledTasks(req, res) {
    try {
      const tasks = await ScheduledTask.findAll({
        order: [['enabled', 'DESC'], ['createdAt', 'DESC']]
      });
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async createScheduledTask(req, res) {
    try {
      const task = await ScheduledTask.create(req.body);
      
      if (this.scheduler && task.enabled) {
        this.scheduler.scheduleTask(task);
      }
      
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async updateScheduledTask(req, res) {
    try {
      const task = await ScheduledTask.findByPk(req.params.id);
      if (task) {
        await task.update(req.body);
        
        if (this.scheduler) {
          this.scheduler.unscheduleTask(task.id);
          if (task.enabled) {
            this.scheduler.scheduleTask(task);
          }
        }
        
        res.json(task);
      } else {
        res.status(404).json({ error: 'Scheduled task not found' });
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async deleteScheduledTask(req, res) {
    try {
      const task = await ScheduledTask.findByPk(req.params.id);
      if (task) {
        if (this.scheduler) {
          this.scheduler.unscheduleTask(task.id);
        }
        await task.destroy();
        res.json({ message: 'Scheduled task deleted' });
      } else {
        res.status(404).json({ error: 'Scheduled task not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getAllAutomationRules(req, res) {
    try {
      const rules = await AutomationRule.findAll({
        order: [['enabled', 'DESC'], ['createdAt', 'DESC']]
      });
      res.json(rules);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async createAutomationRule(req, res) {
    try {
      const rule = await AutomationRule.create(req.body);
      res.status(201).json(rule);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async updateAutomationRule(req, res) {
    try {
      const rule = await AutomationRule.findByPk(req.params.id);
      if (rule) {
        await rule.update(req.body);
        res.json(rule);
      } else {
        res.status(404).json({ error: 'Automation rule not found' });
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async deleteAutomationRule(req, res) {
    try {
      const rule = await AutomationRule.findByPk(req.params.id);
      if (rule) {
        await rule.destroy();
        res.json({ message: 'Automation rule deleted' });
      } else {
        res.status(404).json({ error: 'Automation rule not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async triggerAutomationRule(req, res) {
    try {
      const rule = await AutomationRule.findByPk(req.params.id);
      if (rule) {
        if (this.automationEngine) {
          await this.automationEngine.executeRule(rule);
          await rule.update({
            lastTriggered: new Date(),
            triggerCount: rule.triggerCount + 1
          });
        }
        res.json({ success: true, message: 'Automation rule triggered' });
      } else {
        res.status(404).json({ error: 'Automation rule not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = AutomationController;
