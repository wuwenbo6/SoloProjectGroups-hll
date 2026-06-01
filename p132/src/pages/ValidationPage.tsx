
import React, { useState, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  List,
  Tag,
  Collapse,
  Alert,
  Statistic,
  Row,
  Col,
  Empty,
  Spin,
} from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  CloseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useEsiStore } from '../store/useEsiStore';
import { ValidationError } from '../types';
import { validateEsiConfig } from '../utils/validator';

const { Title, Paragraph, Text } = Typography;
const { Panel } = Collapse;

const ValidationPage: React.FC = () => {
  const { config } = useEsiStore();
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ReturnType<
    typeof validateEsiConfig
  > | null>(null);

  const handleValidate = useCallback(async () => {
    setValidating(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const result = validateEsiConfig(config);
    setValidationResult(result);
    setValidating(false);
  }, [config]);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <CloseCircleOutlined className="text-red-500" />;
      case 'warning':
        return <WarningOutlined className="text-yellow-500" />;
      case 'info':
        return <InfoCircleOutlined className="text-blue-500" />;
      default:
        return <InfoCircleOutlined />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'red';
      case 'warning':
        return 'orange';
      case 'info':
        return 'blue';
      default:
        return 'default';
    }
  };

  const renderErrorItem = (error: ValidationError) => (
    <List.Item key={error.id} className="px-4 py-3 hover:bg-gray-50">
      <div className="w-full">
        <div className="flex items-start gap-3">
          <div className="mt-1">{getSeverityIcon(error.severity)}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Text strong className="text-gray-800">
                {error.message}
              </Text>
              <Tag color={getSeverityColor(error.severity)} className="text-xs">
                {error.code}
              </Tag>
            </div>
            {error.suggestion && (
              <Collapse ghost className="mt-2">
                <Panel header="查看修复建议" key="1">
                  <Alert
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    message={error.suggestion}
                  />
                </Panel>
              </Collapse>
            )}
            {error.location && (
              <Text type="secondary" className="text-xs">
                位置: {error.location.xpath ||
                  (error.location.line
                    ? `第 ${error.location.line} 行`
                    : '')}
              </Text>
            )}
          </div>
        </div>
      </div>
    </List.Item>
  );

  return (
    <div className="space-y-6">
      <Card>
        <Title level={3} className="mb-2">
          在线校验
        </Title>
        <Paragraph type="secondary" className="mb-0">
          根据ETG.2000标准校验当前配置是否符合EtherCAT规范，
          包括XML结构验证、PDO映射规则检查等。
        </Paragraph>
      </Card>

      <Card
        title={
          <div className="flex items-center gap-2">
            <FileTextOutlined />
            <span>当前配置</span>
          </div>
        }
        extra={
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleValidate}
            loading={validating}
          >
            开始校验
          </Button>
        }
      >
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="TxPDO条目"
              value={config.txPdO.length}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="RxPDO条目"
              value={config.rxPdO.length}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="从站名称"
              value={config.slaveInfo.slaveName}
              valueStyle={{ fontSize: '16px' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="厂商ID"
              value={config.slaveInfo.vendorId}
              valueStyle={{ fontSize: '16px' }}
            />
          </Col>
        </Row>
      </Card>

      {validating ? (
        <Card>
          <div className="flex items-center justify-center py-12">
            <Spin size="large" />
            <div className="ml-4">
              <Text className="text-lg">正在校验...</Text>
            </div>
          </div>
        </Card>
      ) : validationResult ? (
        <>
          <Card>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="校验状态"
                  value={validationResult.isValid ? '通过' : '未通过'}
                  prefix={
                    validationResult.isValid ? (
                      <CheckCircleOutlined className="text-green-500" />
                    ) : (
                      <CloseCircleOutlined className="text-red-500" />
                    )
                  }
                  valueStyle={{
                    color: validationResult.isValid ? '#52c41a' : '#f5222d',
                  }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="错误数"
                  value={validationResult.errors.length}
                  prefix={<CloseCircleOutlined className="text-red-500" />}
                  valueStyle={{ color: '#f5222d' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="警告数"
                  value={validationResult.warnings.length}
                  prefix={<WarningOutlined className="text-yellow-500" />}
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
            </Row>
          </Card>

          {validationResult.isValid ? (
            <Alert
              message="校验通过"
              description="当前配置符合ETG标准要求，可以生成ESI文件。"
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
            />
          ) : (
            <Alert
              message="校验未通过"
              description="请修复以下错误后再生成ESI文件。"
              type="error"
              showIcon
              icon={<CloseCircleOutlined />}
            />
          )}

          {validationResult.errors.length > 0 && (
            <Card
              title={
                <div className="flex items-center gap-2">
                  <CloseCircleOutlined className="text-red-500" />
                  <span>错误 ({validationResult.errors.length})</span>
                </div>
              }
              className="border-red-200"
            >
              <List
                dataSource={validationResult.errors}
                renderItem={renderErrorItem}
                locale={{ emptyText: '没有错误' }}
              />
            </Card>
          )}

          {validationResult.warnings.length > 0 && (
            <Card
              title={
                <div className="flex items-center gap-2">
                  <WarningOutlined className="text-yellow-500" />
                  <span>警告 ({validationResult.warnings.length})</span>
                </div>
              }
              className="border-yellow-200"
            >
              <List
                dataSource={validationResult.warnings}
                renderItem={renderErrorItem}
                locale={{ emptyText: '没有警告' }}
              />
            </Card>
          )}
        </>
      ) : (
        <Card>
          <Empty
            description="点击上方按钮开始校验"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      )}
    </div>
  );
};

export default ValidationPage;
