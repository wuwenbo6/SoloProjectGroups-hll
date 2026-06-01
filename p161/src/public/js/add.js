const API_BASE = '/api/v1';

const addKeyForm = document.getElementById('addKeyForm');
const alertContainer = document.getElementById('alertContainer');
const publicKeyInput = document.getElementById('publicKey');

const showAlert = (message, type = 'success') => {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alertContainer.appendChild(alert);
  
  setTimeout(() => {
    alert.remove();
  }, 5000);
};

addKeyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const publicKey = publicKeyInput.value.trim();
  
  if (!publicKey) {
    showAlert('请输入公钥内容', 'error');
    return;
  }
  
  const submitBtn = addKeyForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = '上传中...';
  submitBtn.disabled = true;
  
  try {
    const response = await fetch(`${API_BASE}/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ publicKey })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showAlert(`公钥上传成功！指纹: ${data.fingerprint}`, 'success');
      publicKeyInput.value = '';
      
      setTimeout(() => {
        window.location.href = `/key/${data.fingerprint}`;
      }, 1500);
    } else {
      showAlert(`上传失败: ${data.error}`, 'error');
    }
  } catch (error) {
    console.error('Upload failed:', error);
    showAlert('上传失败，请稍后重试', 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});
