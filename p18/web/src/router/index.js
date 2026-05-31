import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../pages/Dashboard.vue')
  },
  {
    path: '/patients',
    name: 'Patients',
    component: () => import('../pages/Patients.vue')
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('../pages/Reports.vue')
  },
  {
    path: '/report/:id',
    name: 'ReportDetail',
    component: () => import('../pages/ReportDetail.vue')
  },
  {
    path: '/analytics',
    name: 'Analytics',
    component: () => import('../pages/Analytics.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
