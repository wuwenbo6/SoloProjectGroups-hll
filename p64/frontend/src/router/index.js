import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import SimulationDetail from '../views/SimulationDetail.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/simulation/:id',
    name: 'SimulationDetail',
    component: SimulationDetail
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
