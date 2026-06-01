import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 300000
})

export default {
  getVMs() {
    return api.get('/vms')
  },
  
  syncVMs() {
    return api.post('/vms/sync')
  },
  
  getBackupChain(vmId) {
    return api.get(`/vms/${vmId}/backups`)
  },
  
  getBackupChainStats(vmId) {
    return api.get(`/vms/${vmId}/backups/stats`)
  },
  
  mergeBackupChain(vmId, targetBackupId = null) {
    return api.post(`/vms/${vmId}/backups/merge`, { targetBackupId })
  },
  
  createFullBackup(vmId, vmName) {
    return api.post(`/vms/${vmId}/backup/full`, { vmName })
  },
  
  createIncrementalBackup(vmId, vmName) {
    return api.post(`/vms/${vmId}/backup/incremental`, { vmName })
  },
  
  getBackup(backupId) {
    return api.get(`/backups/${backupId}`)
  },
  
  canDeleteBackup(backupId) {
    return api.get(`/backups/${backupId}/can-delete`)
  },
  
  deleteBackup(backupId, force = false) {
    return api.delete(`/backups/${backupId}`, { data: { force } })
  },
  
  mountBackup(backupId) {
    return api.post(`/backups/${backupId}/mount`)
  },
  
  unmountBackup(backupId) {
    return api.post(`/backups/${backupId}/unmount`)
  },
  
  browseFiles(backupId, path = '/') {
    return api.get(`/backups/${backupId}/browse`, { params: { path } })
  },
  
  restoreBackup(backupId, deleteSubsequent = false) {
    return api.post(`/backups/${backupId}/restore`, { deleteSubsequent })
  },

  verifyBackupChecksum(backupId) {
    return api.get(`/backups/${backupId}/checksum/verify`)
  },

  exportChecksumFile(backupId) {
    return api.get(`/backups/${backupId}/checksum/export`)
  },

  getPolicies() {
    return api.get('/policies')
  },

  getVMPolicies(vmId) {
    return api.get(`/policies/vm/${vmId}`)
  },

  createPolicy(policy) {
    return api.post('/policies', policy)
  },

  updatePolicy(id, policy) {
    return api.put(`/policies/${id}`, policy)
  },

  deletePolicy(id) {
    return api.delete(`/policies/${id}`)
  },

  getPolicyLogs(id) {
    return api.get(`/policies/${id}/logs`)
  },

  validateCron(expression) {
    return api.post('/cron/validate', { expression })
  },

  getRemoteConfigs() {
    return api.get('/remote/configs')
  },

  createRemoteConfig(config) {
    return api.post('/remote/configs', config)
  },

  updateRemoteConfig(id, config) {
    return api.put(`/remote/configs/${id}`, config)
  },

  deleteRemoteConfig(id) {
    return api.delete(`/remote/configs/${id}`)
  },

  testRemoteConfig(id) {
    return api.post(`/remote/configs/${id}/test`)
  },

  getRemoteBackups(backupId = null) {
    const params = backupId ? { backupId } : {}
    return api.get('/remote/backups', { params })
  },

  transferToRemote(backupId, configId) {
    return api.post(`/backups/${backupId}/remote/transfer`, { configId })
  },

  deleteRemoteBackup(id) {
    return api.delete(`/remote/backups/${id}`)
  }
}
