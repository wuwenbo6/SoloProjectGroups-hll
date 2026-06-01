<template>
  <div class="import-export">
    <button @click="showImportModal = true" class="btn btn-secondary">
      Import GraphSON
    </button>
    <button @click="exportGraph" class="btn btn-secondary">
      Export GraphSON
    </button>

    <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Import GraphSON</span>
          <button @click="showImportModal = false" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="upload-area" @click="$refs.fileInput.click()">
            <input ref="fileInput" type="file" accept=".json" @change="handleFileSelect" hidden>
            <div class="upload-icon">📁</div>
            <div class="upload-text">Click to select or drop GraphSON file</div>
            <div v-if="selectedFile" class="selected-file">{{ selectedFile.name }}</div>
          </div>
          <div class="divider">or paste GraphSON content</div>
          <textarea
            v-model="importContent"
            placeholder="Paste GraphSON JSON here..."
            class="graphson-textarea"
          ></textarea>
        </div>
        <div class="modal-footer">
          <button @click="showImportModal = false" class="btn btn-secondary">Cancel</button>
          <button @click="importGraph" :disabled="!canImport" class="btn btn-primary">Import</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { exportGraphSON, importGraphSON } from '../api'

export default {
  name: 'ImportExport',
  emits: ['graph-imported'],
  data() {
    return {
      showImportModal: false,
      importContent: '',
      selectedFile: null
    }
  },
  computed: {
    canImport() {
      return this.importContent.trim() || this.selectedFile
    }
  },
  methods: {
    async exportGraph() {
      try {
        const response = await exportGraphSON()
        const blob = new Blob([response.data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `graph-${Date.now()}.json`
        a.click()
        URL.revokeObjectURL(url)
      } catch (error) {
        alert('Export failed: ' + (error.response?.data?.error || error.message))
      }
    },
    handleFileSelect(event) {
      const file = event.target.files[0]
      if (file) {
        this.selectedFile = file
        const reader = new FileReader()
        reader.onload = (e) => {
          this.importContent = e.target.result
        }
        reader.readAsText(file)
      }
    },
    async importGraph() {
      if (!this.importContent.trim()) return
      try {
        await importGraphSON(this.importContent)
        this.showImportModal = false
        this.importContent = ''
        this.selectedFile = null
        this.$emit('graph-imported')
        alert('Graph imported successfully!')
      } catch (error) {
        alert('Import failed: ' + (error.response?.data?.error || error.message))
      }
    }
  }
}
</script>

<style scoped>
.import-export {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 500;
  font-size: 14px;
}

.btn-primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.btn-primary:hover:not(:disabled) {
  background: #b4befe;
}

.btn-secondary {
  background: #585b70;
  color: #cdd6f4;
}

.btn-secondary:hover {
  background: #6c7086;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #313244;
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #45475a;
  border-bottom: 1px solid #585b70;
}

.modal-title {
  font-weight: 600;
  color: #cdd6f4;
  font-size: 16px;
}

.close-btn {
  background: none;
  color: #a6adc8;
  font-size: 24px;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #cdd6f4;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.upload-area {
  border: 2px dashed #585b70;
  border-radius: 8px;
  padding: 30px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-area:hover {
  border-color: #89b4fa;
  background: rgba(137, 180, 250, 0.1);
}

.upload-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.upload-text {
  color: #a6adc8;
  font-size: 14px;
}

.selected-file {
  margin-top: 12px;
  color: #89b4fa;
  font-size: 13px;
}

.divider {
  text-align: center;
  color: #6c7086;
  font-size: 13px;
  margin: 16px 0;
}

.graphson-textarea {
  width: 100%;
  min-height: 200px;
  padding: 12px;
  background: #1e1e2e;
  border: 1px solid #585b70;
  border-radius: 8px;
  color: #cdd6f4;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  resize: vertical;
}

.graphson-textarea:focus {
  border-color: #89b4fa;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  background: #45475a;
  border-top: 1px solid #585b70;
}
</style>
