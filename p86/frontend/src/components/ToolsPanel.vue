<template>
  <div class="tools-panel">
    <div class="panel-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="panel-content" v-show="activeTab === 'index'">
      <div class="index-form">
        <h4>Create Index</h4>
        <div class="form-row">
          <input v-model="newIndex.name" placeholder="Index name (e.g., idx_name)" class="form-input">
          <select v-model="newIndex.elementType" class="form-select">
            <option value="vertex">Vertex</option>
            <option value="edge">Edge</option>
          </select>
        </div>
        <div class="form-row">
          <input v-model="newIndex.propertyKey" placeholder="Property key (e.g., name)" class="form-input">
          <button @click="createIndex" :disabled="!canCreateIndex" class="btn btn-primary">Create</button>
        </div>
      </div>
      <div class="index-list">
        <h4>Existing Indexes</h4>
        <div v-if="loading" class="loading">Loading...</div>
        <div v-else>
          <div class="index-group">
            <span class="index-group-label">Vertex:</span>
            <div class="index-items">
              <span v-for="idx in indexes.vertexIndexes" :key="idx" class="index-item">
                {{ idx }}
                <button @click="dropIndex(idx, 'vertex')" class="drop-btn">&times;</button>
              </span>
              <span v-if="!indexes.vertexIndexes || indexes.vertexIndexes.length === 0" class="empty">None</span>
            </div>
          </div>
          <div class="index-group">
            <span class="index-group-label">Edge:</span>
            <div class="index-items">
              <span v-for="idx in indexes.edgeIndexes" :key="idx" class="index-item">
                {{ idx }}
                <button @click="dropIndex(idx, 'edge')" class="drop-btn">&times;</button>
              </span>
              <span v-if="!indexes.edgeIndexes || indexes.edgeIndexes.length === 0" class="empty">None</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-content" v-show="activeTab === 'path'">
      <div class="path-form">
        <h4>Find Shortest Path</h4>
        <div class="form-row">
          <input v-model="pathQuery.fromId" placeholder="From Node ID" class="form-input">
          <input v-model="pathQuery.toId" placeholder="To Node ID" class="form-input">
        </div>
        <div class="form-row">
          <input v-model="pathQuery.edgeLabel" placeholder="Edge label (optional)" class="form-input">
          <input type="number" v-model.number="pathQuery.maxDepth" min="1" max="50" class="form-input small">
          <button @click="findPath" :disabled="!canFindPath || pathLoading" class="btn btn-primary">
            {{ pathLoading ? 'Finding...' : 'Find Path' }}
          </button>
        </div>
      </div>
      <div class="path-result" v-if="pathResult">
        <div v-if="pathResult.found" class="path-found">
          <div class="path-success">✓ Path found! ({{ pathResult.length }} steps)</div>
          <div class="path-nodes">
            <span v-for="(node, idx) in pathResult.path" :key="node.id" class="path-node">
              {{ node.properties?.name || node.label }}
              <span v-if="idx < pathResult.path.length - 1" class="path-arrow">→</span>
            </span>
          </div>
        </div>
        <div v-else class="path-not-found">
          ✗ No path found within {{ pathQuery.maxDepth }} steps
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { listIndexes, createIndex as createIndexApi, dropIndex as dropIndexApi, findShortestPath } from '../api'

export default {
  name: 'ToolsPanel',
  emits: ['path-found', 'clear-path'],
  data() {
    return {
      activeTab: 'index',
      tabs: [
        { id: 'index', label: 'Indexes' },
        { id: 'path', label: 'Shortest Path' }
      ],
      newIndex: {
        name: '',
        elementType: 'vertex',
        propertyKey: ''
      },
      indexes: {
        vertexIndexes: [],
        edgeIndexes: []
      },
      loading: false,
      pathQuery: {
        fromId: '',
        toId: '',
        edgeLabel: '',
        maxDepth: 10
      },
      pathResult: null,
      pathLoading: false
    }
  },
  computed: {
    canCreateIndex() {
      return this.newIndex.name.trim() && this.newIndex.propertyKey.trim()
    },
    canFindPath() {
      return this.pathQuery.fromId.trim() && this.pathQuery.toId.trim()
    }
  },
  mounted() {
    this.loadIndexes()
  },
  methods: {
    async loadIndexes() {
      this.loading = true
      try {
        const response = await listIndexes()
        this.indexes = response.data
      } catch (error) {
        console.error('Failed to load indexes:', error)
      } finally {
        this.loading = false
      }
    },
    async createIndex() {
      try {
        await createIndexApi(this.newIndex.name, this.newIndex.elementType, this.newIndex.propertyKey)
        this.newIndex.name = ''
        this.newIndex.propertyKey = ''
        this.loadIndexes()
      } catch (error) {
        alert('Failed to create index: ' + (error.response?.data?.error || error.message))
      }
    },
    async dropIndex(indexName, elementType) {
      if (!confirm(`Drop index "${indexName}"?`)) return
      try {
        await dropIndexApi(indexName, elementType)
        this.loadIndexes()
      } catch (error) {
        alert('Failed to drop index: ' + (error.response?.data?.error || error.message))
      }
    },
    async findPath() {
      this.pathLoading = true
      try {
        const response = await findShortestPath(
          this.pathQuery.fromId,
          this.pathQuery.toId,
          this.pathQuery.edgeLabel,
          this.pathQuery.maxDepth
        )
        this.pathResult = response.data
        this.$emit('path-found', response.data)
      } catch (error) {
        alert('Failed to find path: ' + (error.response?.data?.error || error.message))
        this.pathResult = null
      } finally {
        this.pathLoading = false
      }
    }
  }
}
</script>

<style scoped>
.tools-panel {
  background: #313244;
  border-radius: 8px;
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-tabs {
  display: flex;
  background: #45475a;
  border-bottom: 1px solid #585b70;
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  background: transparent;
  color: #a6adc8;
  border: none;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: #585b70;
}

.tab-btn.active {
  background: #313244;
  color: #cdd6f4;
  font-weight: 500;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

h4 {
  margin: 0 0 12px 0;
  color: #cdd6f4;
  font-size: 13px;
  font-weight: 600;
}

.form-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.form-input {
  flex: 1;
  padding: 8px 12px;
  background: #1e1e2e;
  border: 1px solid #585b70;
  border-radius: 6px;
  color: #cdd6f4;
  font-size: 13px;
}

.form-input:focus {
  border-color: #89b4fa;
}

.form-input.small {
  width: 80px;
  flex: none;
}

.form-select {
  padding: 8px 12px;
  background: #1e1e2e;
  border: 1px solid #585b70;
  border-radius: 6px;
  color: #cdd6f4;
  font-size: 13px;
  cursor: pointer;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.btn-primary:hover:not(:disabled) {
  background: #b4befe;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.index-form {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #45475a;
}

.index-group {
  margin-bottom: 12px;
}

.index-group-label {
  font-size: 12px;
  color: #a6adc8;
  margin-right: 8px;
}

.index-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.index-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #585b70;
  border-radius: 4px;
  font-size: 12px;
  color: #cdd6f4;
}

.drop-btn {
  background: transparent;
  border: none;
  color: #f38ba8;
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}

.drop-btn:hover {
  color: #eba0ac;
}

.empty {
  color: #6c7086;
  font-size: 12px;
}

.loading {
  color: #6c7086;
  font-size: 13px;
  padding: 20px 0;
  text-align: center;
}

.path-form {
  margin-bottom: 20px;
}

.path-result {
  padding: 12px;
  background: #1e1e2e;
  border-radius: 6px;
}

.path-found {
  color: #a6e3a1;
}

.path-success {
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 13px;
}

.path-nodes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.path-node {
  padding: 4px 8px;
  background: #f38ba8;
  color: #1e1e2e;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.path-arrow {
  color: #f38ba8;
  font-weight: bold;
}

.path-not-found {
  color: #f38ba8;
  font-size: 13px;
}
</style>
