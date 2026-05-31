import React, { useState } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Tabs,
  Tab,
  Container,
} from '@mui/material';
import {
  Lightbulb,
  Palette,
  Schedule,
  SensorWindow,
  ElectricBolt,
  History,
} from '@mui/icons-material';
import DeviceGrid from './components/DeviceGrid';
import SceneManager from './components/SceneManager';
import ScheduleManager from './components/ScheduleManager';
import EnergyDashboard from './components/EnergyDashboard';
import ControlLogViewer from './components/ControlLogViewer';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#ff9800',
    },
  },
});

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const tabs = [
    { label: '设备控制', icon: <Lightbulb /> },
    { label: '场景管理', icon: <Palette /> },
    { label: '定时任务', icon: <Schedule /> },
    { label: '传感器联动', icon: <SensorWindow /> },
    { label: '能耗统计', icon: <ElectricBolt /> },
    { label: '控制日志', icon: <History /> },
  ];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, minHeight: '100vh' }}>
        <AppBar position="static">
          <Toolbar>
            <Lightbulb sx={{ mr: 2 }} />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              智能照明控制系统
            </Typography>
            <Typography variant="body2">
              BLE Mesh Gateway
            </Typography>
          </Toolbar>
        </AppBar>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            variant="fullWidth"
            centered
          >
            {tabs.map((tab, index) => (
              <Tab
                key={index}
                label={tab.label}
                icon={tab.icon}
                iconPosition="start"
              />
            ))}
          </Tabs>
        </Box>

        <Container maxWidth="xl">
          <TabPanel value={tabValue} index={0}>
            <DeviceGrid />
          </TabPanel>
          <TabPanel value={tabValue} index={1}>
            <SceneManager />
          </TabPanel>
          <TabPanel value={tabValue} index={2}>
            <ScheduleManager />
          </TabPanel>
          <TabPanel value={tabValue} index={3}>
            <Box>
              <Typography variant="h5" gutterBottom>
                传感器联动
              </Typography>
              <Typography color="text.secondary">
                传感器联动规则配置功能正在开发中...
              </Typography>
            </Box>
          </TabPanel>
          <TabPanel value={tabValue} index={4}>
            <EnergyDashboard />
          </TabPanel>
          <TabPanel value={tabValue} index={5}>
            <ControlLogViewer />
          </TabPanel>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
