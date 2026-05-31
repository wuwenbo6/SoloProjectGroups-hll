import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/trace/:id',
    name: 'Trace',
    component: () => import('../views/Trace.vue')
  },
  {
    path: '/scan',
    name: 'Scan',
    component: () => import('../views/Scan.vue')
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue')
      },
      {
        path: 'produce',
        name: 'ProduceList',
        component: () => import('../views/ProduceList.vue')
      },
      {
        path: 'produce/create',
        name: 'CreateProduce',
        component: () => import('../views/CreateProduce.vue')
      },
      {
        path: 'produce/:id',
        name: 'ProduceDetail',
        component: () => import('../views/ProduceDetail.vue')
      },
      {
        path: 'transfer',
        name: 'Transfer',
        component: () => import('../views/Transfer.vue')
      },
      {
        path: 'inspection',
        name: 'Inspection',
        component: () => import('../views/Inspection.vue')
      },
      {
        path: 'temperature',
        name: 'TemperatureMonitor',
        component: () => import('../views/TemperatureMonitor.vue')
      },
      {
        path: 'certificate',
        name: 'Certificate',
        component: () => import('../views/Certificate.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else {
    next()
  }
})

export default router
