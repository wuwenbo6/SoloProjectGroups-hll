
import React, { useState } from 'react';
import { Layout, Menu, Typography, Badge } from 'antd';
import {
  SettingOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  FolderOutlined,
  DatabaseOutlined,
  CodeOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEsiStore } from '../../store/useEsiStore';

const { Sider, Content, Header } = Layout;
const { Title } = Typography;

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { isDirty, activeTemplate } = useEsiStore();

  const menuItems = [
    {
      key: '/',
      icon: <SettingOutlined />,
      label: 'PDO配置',
    },
    {
      key: '/coe',
      icon: <CodeOutlined />,
      label: 'CoE参数',
    },
    {
      key: '/esi-generator',
      icon: <FileTextOutlined />,
      label: 'ESI生成',
    },
    {
      key: '/validation',
      icon: <CheckCircleOutlined />,
      label: '在线校验',
    },
    {
      key: '/templates',
      icon: <FolderOutlined />,
      label: '模板管理',
    },
    {
      key: '/multi-slave',
      icon: <NodeIndexOutlined />,
      label: '多从站管理',
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Layout>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        className="shadow-lg"
        width={200}
        collapsedWidth={80}
      >
        <div className="flex items-center justify-center h-16 bg-gradient-to-r from-blue-600 to-blue-700">
          <DatabaseOutlined className="text-white text-2xl" />
          {!collapsed && (
            <Title level={4} className="text-white ml-2 mb-0">
              EtherCAT
            </Title>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          className="mt-2"
        />
      </Sider>
      <Layout>
        <Header className="bg-white shadow-sm px-6 flex items-center justify-between">
          <div className="flex items-center">
            <Title level={4} className="mb-0 text-gray-800">
              {menuItems.find((item) => item.key === location.pathname)?.label ||
                'EtherCAT配置工具'}
            </Title>
          </div>
          <div className="flex items-center gap-4">
            {activeTemplate && (
              <Badge status="success" text={`模板: ${activeTemplate.name}`} />
            )}
            {isDirty && (
              <Badge status="processing" text="未保存" />
            )}
          </div>
        </Header>
        <Content className="m-6 bg-gray-50 rounded-lg p-6 min-h-[calc(100vh-112px)]">
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
