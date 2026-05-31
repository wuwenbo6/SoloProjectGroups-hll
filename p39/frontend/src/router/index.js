import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue')
  },
  {
    path: '/heatmap',
    name: 'Heatmap',
    component: () => import('@/views/HeatmapView.vue')
  },
  {
    path: '/trend',
    name: 'Trend',
    component: () => import('@/views/TrendView.vue')
  },
  {
    path: '/history',
    name: 'History',
    component: () => import('@/views/HistoryView.vue')
  },
  {
    path: '/zones',
    name: 'Zones',
    component: () => import('@/views/ZonesView.vue')
  },
  {
    path: '/trains',
    name: 'Trains',
    component: () => import('@/views/TrainsView.vue')
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('@/views/ReportsView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
