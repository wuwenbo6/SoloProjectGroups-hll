import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getCurrentCount, getHeatmap, getTrend } from '@/api'

export const usePassengerStore = defineStore('passenger', () => {
  const currentCount = ref([])
  const heatmapData = ref(null)
  const trendData = ref(null)
  const loading = ref(false)

  const fetchCurrentCount = async (zone = null) => {
    try {
      loading.value = true
      const res = await getCurrentCount(zone)
      currentCount.value = res.data
      return res.data
    } catch (error) {
      console.error('Fetch current count error:', error)
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchHeatmap = async () => {
    try {
      loading.value = true
      const res = await getHeatmap()
      heatmapData.value = res.data
      return res.data
    } catch (error) {
      console.error('Fetch heatmap error:', error)
      return null
    } finally {
      loading.value = false
    }
  }

  const fetchTrend = async (zone = 'default', steps = 12) => {
    try {
      loading.value = true
      const res = await getTrend(zone, steps)
      trendData.value = res.data
      return res.data
    } catch (error) {
      console.error('Fetch trend error:', error)
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    currentCount,
    heatmapData,
    trendData,
    loading,
    fetchCurrentCount,
    fetchHeatmap,
    fetchTrend
  }
})
