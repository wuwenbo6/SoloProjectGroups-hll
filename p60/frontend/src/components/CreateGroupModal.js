import { useState } from 'react';

function CreateGroupModal({ users, onClose, onCreate }) {
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);

  const toggleMember = (userId) => {
    setSelectedMembers(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (groupName && selectedMembers.length > 0) {
      onCreate(groupName, selectedMembers);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>创建群组</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-content">
          <div className="form-group">
            <label>群组名称</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="输入群组名称"
              required
            />
          </div>
          <div className="form-group">
            <label>选择成员</label>
            <div className="member-list">
              {users.map(user => (
                <label 
                  key={user.id} 
                  className={`member-item ${selectedMembers.includes(user.id) ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(user.id)}
                    onChange={() => toggleMember(user.id)}
                  />
                  <div className="avatar small">{user.username.charAt(0).toUpperCase()}</div>
                  <span>{user.username}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary" disabled={!groupName || selectedMembers.length === 0}>
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateGroupModal;
