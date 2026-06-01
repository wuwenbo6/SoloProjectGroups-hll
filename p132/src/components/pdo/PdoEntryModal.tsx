
import React, { useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, Row, Col } from 'antd';
import { PdoEntry, DataType, DataTypeBitLength } from '../../types';

interface PdoEntryModalProps {
  open: boolean;
  entry: PdoEntry | null;
  onOk: (values: Omit<PdoEntry, 'id'>) => void;
  onCancel: () => void;
}

const PdoEntryModal: React.FC<PdoEntryModalProps> = ({
  open,
  entry,
  onOk,
  onCancel,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (entry) {
      form.setFieldsValue({
        index: entry.index,
        subIndex: entry.subIndex,
        name: entry.name,
        dataType: entry.dataType,
        bitLength: entry.bitLength,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        dataType: DataType.UINT16,
        bitLength: 16,
      });
    }
  }, [entry, open, form]);

  const handleDataTypeChange = (value: DataType) => {
    form.setFieldsValue({
      bitLength: DataTypeBitLength[value],
    });
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onOk(values as Omit<PdoEntry, 'id'>);
    } catch (err) {
      console.error('Validation failed:', err);
    }
  };

  return (
    <Modal
      title={entry ? '编辑PDO条目' : '添加PDO条目'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      width={500}
      okText="确定"
      cancelText="取消"
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          dataType: DataType.UINT16,
          bitLength: 16,
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="index"
              label="索引 (Index)"
              rules={[
                { required: true, message: '请输入索引' },
                {
                  type: 'number',
                  min: 0x1000,
                  max: 0xFFFF,
                  message: '索引应在0x1000到0xFFFF之间',
                },
              ]}
            >
              <InputNumber
                className="w-full"
                formatter={(value) =>
                  value ? `0x${value.toString(16).toUpperCase().padStart(4, '0')}` : ''
                }
                parser={(value) => {
                  const hex = value?.replace('0x', '') || '0';
                  return parseInt(hex, 16);
                }}
                placeholder="0x6000"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="subIndex"
              label="子索引 (SubIndex)"
              rules={[
                { required: true, message: '请输入子索引' },
                {
                  type: 'number',
                  min: 0x00,
                  max: 0xFF,
                  message: '子索引应在0x00到0xFF之间',
                },
              ]}
            >
              <InputNumber
                className="w-full"
                formatter={(value) =>
                  value !== undefined ? `0x${value.toString(16).toUpperCase().padStart(2, '0')}` : ''
                }
                parser={(value) => {
                  const hex = value?.replace('0x', '') || '0';
                  return parseInt(hex, 16);
                }}
                placeholder="0x00"
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, message: '请输入名称' }]}
        >
          <Input placeholder="例如: Control Word" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="dataType"
              label="数据类型"
              rules={[{ required: true, message: '请选择数据类型' }]}
            >
              <Select onChange={handleDataTypeChange}>
                {Object.values(DataType).map((type) => (
                  <Select.Option key={type} value={type}>
                    {type}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="bitLength"
              label="位长度"
              rules={[
                { required: true, message: '请输入位长度' },
                { type: 'number', min: 1, message: '位长度必须大于0' },
              ]}
            >
              <InputNumber className="w-full" min={1} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default PdoEntryModal;
