import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import ImageManager from '../views/ImageManager.vue'
import SnapshotTree from '../views/SnapshotTree.vue'
import CloneChain from '../views/CloneChain.vue'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard
  },
  {
    path: '/images',
    name: 'ImageManager',
    component: ImageManager
  },
  {
    path: '/snapshot-tree',
    name: 'SnapshotTree',
    component: SnapshotTree
  },
  {
    path: '/clone-chain',
    name: 'CloneChain',
    component: CloneChain
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
