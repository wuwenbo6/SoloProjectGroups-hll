import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Divider,
  CircularProgress,
  Paper,
  LinearProgress,
} from '@mui/material';
import {
  ElectricBolt,
  Savings,
  Eco,
  Lightbulb,
  TrendingUp,
  TrendingDown,
} from '@mui/icons-material';
import { energyAPI } from '../services/api';

function EnergyDashboard() {
  const [summary, setSummary] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [daylightInfo, setDaylightInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('daily');
  const [area, setArea] = useState('all');

  const areas = ['all', '会议室A', '会议室B', '办公区A', '办公区B', '走廊', '大厅', '休息区'];

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [period, area]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [summaryRes, comparisonRes, daylightRes] = await Promise.all([
        energyAPI.getSummary({ area: area === 'all' ? undefined : area }),
        energyAPI.getComparison({ period, area: area === 'all' ? undefined : area }),
        energyAPI.getDaylightInfo(),
      ]);

      setSummary(summaryRes.data.data);
      setComparison(comparisonRes.data.data);
      setDaylightInfo(daylightRes.data.data);
    } catch (error) {
      console.error('Failed to fetch energy data:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, unit, icon: Icon, color, trend, trendValue }) => (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Icon sx={{ fontSize: 40, color }} />
          {trend && (
            <Chip
              size="small"
              icon={trend === 'up' ? <TrendingUp /> : <TrendingDown />}
              color={trend === 'up' ? 'error' : 'success'}
              label={`${trendValue}%`}
            />
          )}
        </Box>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          {value}
          <Typography variant="body2" component="span" sx={{ ml: 1 }}>
            {unit}
          </Typography>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <CircularProgress />
      </Box>
    );
  }

  const calcTrend = (current, previous) => {
    if (!previous || previous === 0) return { trend: null, value: 0 };
    const change = ((current - previous) / previous * 100);
    return {
      trend: change > 0 ? 'up' : 'down',
      value: Math.abs(Math.round(change)),
    };
  };

  const kwhTrend = calcTrend(comparison?.current?.totalKwh || 0, comparison?.previous?.totalKwh || 0);

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>统计周期</InputLabel>
              <Select value={period} label="统计周期" onChange={(e) => setPeriod(e.target.value)}>
                <MenuItem value="daily">今日</MenuItem>
                <MenuItem value="weekly">本周</MenuItem>
                <MenuItem value="monthly">本月</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>区域</InputLabel>
              <Select value={area} label="区域" onChange={(e) => setArea(e.target.value)}>
                {areas.map((a) => (
                  <MenuItem key={a} value={a}>
                    {a === 'all' ? '全部区域' : a}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="总耗电量"
            value={summary?.totalKwh?.toFixed(2) || 0}
            unit="kWh"
            icon={ElectricBolt}
            color="primary"
            trend={kwhTrend.trend}
            trendValue={kwhTrend.value}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="预估电费"
            value={`¥${summary?.totalCost?.toFixed(2) || 0}`}
            unit=""
            icon={Savings}
            color="warning"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="日光补偿节电"
            value={summary?.totalSavings?.toFixed(2) || 0}
            unit="kWh"
            icon={Eco}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="平均亮度"
            value={Math.round(summary?.avgBrightness || 0)}
            unit="%"
            icon={Lightbulb}
            color="info"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                碳排放减排
              </Typography>
              <Box display="flex" alignItems="center" mb={2}>
                <Eco sx={{ fontSize: 48, color: 'success.main', mr: 2 }} />
                <Box>
                  <Typography variant="h3" fontWeight="bold">
                    {summary?.co2Saved?.toFixed(2) || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    kg CO2 减排量
                  </Typography>
                </Box>
              </Box>
              <Typography variant="body2" color="text.secondary">
                相当于种植 {Math.round((summary?.co2Saved || 0) / 18)} 棵树一年的吸收量
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                日光补偿状态
              </Typography>
              <Box mb={2}>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2">当前照度</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {daylightInfo?.currentLux || 0} Lux
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min((daylightInfo?.currentLux || 0) / 10, 100)}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="text.secondary">
                启用规则: {daylightInfo?.rules?.length || 0} 个
              </Typography>
              {daylightInfo?.rules?.map((rule) => (
                <Chip
                  key={rule.id}
                  label={rule.name}
                  size="small"
                  color={rule.enabled ? 'success' : 'default'}
                  sx={{ mt: 1, mr: 1 }}
                />
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default EnergyDashboard;
