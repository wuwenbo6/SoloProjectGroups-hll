import { createRouter, createWebHistory } from 'vue-router'
import VMList from './views/VMList.vue'
import VMDetail from './views/VMDetail.vue'
import Settings from './views/Settings.vue'

const routes = [
  {
    path: '/',
    name: 'VMList',
    component: VMList
  },
  {
    path: '/vm/:id',
    name: 'VMDetail',
    component: VMDetail,
    props: true
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
