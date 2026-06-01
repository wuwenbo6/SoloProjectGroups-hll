import { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';

import NodeList from './components/NodeList';
import ServiceList from './components/ServiceList';
import DeploymentHistory from './components/DeploymentHistory';
import ClusterOverview from './components/ClusterOverview';
import { nodeAPI, serviceAPI, clusterAPI } from './services/api';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

const POLL_INTERVAL = 15000;
const BACKGROUND_POLL_INTERVAL = 60000;
const HISTORY_FETCH_INTERVAL = 3;

function App() {
  const [tabValue, setTabValue] = useState(0);
  const [nodes, setNodes] = useState([]);
  const [services, setServices] = useState([]);
  const [deploymentHistory, setDeploymentHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchCount, setFetchCount] = useState(0);
  const [isBackground, setIsBackground] = useState(false);

  const fetchData = async (fetchHistory = true) => {
    try {
      const requests = [
        nodeAPI.getNodes(),
        serviceAPI.getServices(),
      ];
      
      if (fetchHistory) {
        requests.push(clusterAPI.getDeploymentHistory(50));
      }

      const [nodesRes, servicesRes, historyRes] = await Promise.all(requests);
      setNodes(nodesRes.data);
      setServices(servicesRes.data);
      
      if (fetchHistory && historyRes) {
        setDeploymentHistory(historyRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsBackground(document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    fetchData(true);
    
    const interval = setInterval(() => {
      setFetchCount(prev => prev + 1);
    }, isBackground ? BACKGROUND_POLL_INTERVAL : POLL_INTERVAL);
    
    return () => clearInterval(interval);
  }, [isBackground]);

  useEffect(() => {
    if (fetchCount > 0) {
      const shouldFetchHistory = fetchCount % HISTORY_FETCH_INTERVAL === 0;
      fetchData(shouldFetchHistory);
    }
  }, [fetchCount]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleSync = async () => {
    try {
      await clusterAPI.sync();
      fetchData();
    } catch (error) {
      console.error('Failed to sync:', error);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchData();
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default' }}>
        <Container maxWidth="xl" sx={{ py: 4 }}>
          <Box sx={{ mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              Swarm Cluster Manager
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              集群节点管理与服务部署监控平台
            </Typography>
          </Box>

          <ClusterOverview nodes={nodes} services={services} onSync={handleSync} onRefresh={handleRefresh} />

          <Paper sx={{ mt: 4, mb: 2 }}>
            <Tabs value={tabValue} onChange={handleTabChange} centered>
              <Tab label="节点管理" />
              <Tab label="服务管理" />
              <Tab label="部署历史" />
            </Tabs>
          </Paper>

          <Grid container spacing={3}>
            <Grid item xs={12}>
              {tabValue === 0 && (
                <NodeList nodes={nodes} loading={loading} onRefresh={handleRefresh} />
              )}
              {tabValue === 1 && (
                <ServiceList services={services} loading={loading} onRefresh={handleRefresh} />
              )}
              {tabValue === 2 && (
                <DeploymentHistory history={deploymentHistory} loading={loading} />
              )}
            </Grid>
          </Grid>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
