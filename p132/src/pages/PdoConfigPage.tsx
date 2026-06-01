
import React from 'react';
import { Row, Col, Card, Typography } from 'antd';
import PdoConfigPanel from '../components/pdo/PdoConfigPanel';
import ObjectDictionarySelector from '../components/pdo/ObjectDictionarySelector';

const { Title, Paragraph } = Typography;

const PdoConfigPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <Title level={3} className="mb-2">
          PDO映射配置
        </Title>
        <Paragraph type="secondary" className="mb-0">
          配置EtherCAT从站的TxPDO（发送PDO）和RxPDO（接收PDO）映射。
          可以从左侧对象字典中快速添加预定义的对象，或手动添加自定义PDO条目。
        </Paragraph>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <ObjectDictionarySelector />
        </Col>
        <Col xs={24} lg={8}>
          <PdoConfigPanel
            type="TxPDO"
            title="TxPDO 映射"
            description="从站发送到主站的过程数据"
            color="#1890ff"
          />
        </Col>
        <Col xs={24} lg={8}>
          <PdoConfigPanel
            type="RxPDO"
            title="RxPDO 映射"
            description="主站发送到从站的过程数据"
            color="#52c41a"
          />
        </Col>
      </Row>
    </div>
  );
};

export default PdoConfigPage;
