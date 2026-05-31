import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue')
  },
  {
    path: '/devices',
    name: 'Devices',
    component: () => import('@/views/Devices.vue')
  },
  {
    path: '/rules',
    name: 'Rules',
    component: () => import('@/views/Rules.vue')
  },
  {
    path: '/scenes',
    name: 'Scenes',
    component: () => import('@/views/Scenes.vue')
  },
  {
    path: '/diagnostics',
    name: 'Diagnostics',
    component: () => import('@/views/Diagnostics.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
