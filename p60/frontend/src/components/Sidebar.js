import { useState } from 'react';
import CreateGroupModal from './CreateGroupModal';

function Sidebar({ user, users, groups, activeChat, onSelectChat, onCreateGroup, onLogout }) {
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="user-info">
          <div className="avatar">{user.username.charAt(0).toUpperCase()}</div>
          <div>
            <div className="username">{user.username}</div>
            <div className="status">在线</div>
          </div>
        </div>
        <button onClick={onLogout} className="logout-btn">退出</button>
      </div>

      <div className="sidebar-tabs">
        <button 
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          用户
        </button>
        <button 
          className={`tab-btn ${activeTab === 'groups' ? 'active' : ''}`}
          onClick={() => setActiveTab('groups')}
        >
          群组
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="sidebar-content">
          <div className="chat-list">
            {users.map(u => (
              <div
                key={u.id}
                className={`chat-item ${activeChat?.type === 'private' && activeChat?.id === u.id ? 'active' : ''}`}
                onClick={() => onSelectChat({ type: 'private', id: u.id, name: u.username })}
              >
                <div className="avatar">{u.username.charAt(0).toUpperCase()}</div>
                <div className="chat-info">
                  <div className="chat-name">{u.username}</div>
                  <div className="chat-preview">点击开始聊天</div>
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <div className="empty-state">暂无其他用户</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'groups' && (
        <div className="sidebar-content">
          <button 
            className="create-group-btn"
            onClick={() => setShowCreateGroup(true)}
          >
            + 创建群组
          </button>
          <div className="chat-list">
            {groups.map(g => (
              <div
                key={g.id}
                className={`chat-item ${activeChat?.type === 'group' && activeChat?.id === g.id ? 'active' : ''}`}
                onClick={() => onSelectChat({ type: 'group', id: g.id, name: g.name })}
              >
                <div className="avatar group">👥</div>
                <div className="chat-info">
                  <div className="chat-name">{g.name}</div>
                  <div className="chat-preview">群组聊天</div>
                </div>
              </div>
            ))}
            {groups.length === 0 && (
              <div className="empty-state">暂无群组</div>
            )}
          </div>
        </div>
      )}

      {showCreateGroup && (
        <CreateGroupModal
          users={users}
          onClose={() => setShowCreateGroup(false)}
          onCreate={async (name, memberIds) => {
            await onCreateGroup(name, memberIds);
            setShowCreateGroup(false);
          }}
        />
      )}
    </div>
  );
}

export default Sidebar;
