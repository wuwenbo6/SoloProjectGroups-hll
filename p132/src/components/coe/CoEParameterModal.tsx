
import React, { useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, Row, Col, Checkbox } from 'antd';
import { CoEParameter, DataType, CoEAccessType } from '../../types';

interface CoEParameterModalProps {
  open: boolean;
  parameter: CoEParameter | null;
  onOk: (values: Omit<CoEParameter, 'id'>) => void;
  onCancel: () => void;
}

const CoEParameterModal: React.FC<CoEParameterModalProps> = ({
  open,
  parameter,
  onOk,
  onCancel,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (parameter) {
      form.setFieldsValue({
        index: parameter.index,
        subIndex: parameter.subIndex,
        name: parameter.name,
        dataType: parameter.dataType,
        accessType: parameter.accessType,
        defaultValue: parameter.defaultValue,
        lowLimit: parameter.lowLimit,
        highLimit: parameter.highLimit,
        description: parameter.description,
        pdoMapping: parameter.pdoMapping,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        dataType: DataType.UINT16,
        accessType: CoEAccessType.RW,
        pdoMapping: false,
      });
    }
  }, [parameter, open, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onOk(values as Omit<CoEParameter, 'id'>);
    } catch (err) {
      console.error('Validation failed:', err);
    }
  };

  return (
    <Modal
      title={parameter ? '编辑CoE参数' : '添加CoE参数'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      width={600}
      okText="确定"
      cancelText="取消"
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          dataType: DataType.UINT16,
          accessType: CoEAccessType.RW,
          pdoMapping: false,
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
          label="参数名称"
          rules={[{ required: true, message: '请输入参数名称' }]}
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
              <Select>
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
              name="accessType"
              label="访问类型"
              rules={[{ required: true, message: '请选择访问类型' }]}
            >
              <Select>
                <Select.Option value={CoEAccessType.RO}>只读 (ro)</Select.Option>
                <Select.Option value={CoEAccessType.RW}>读写 (rw)</Select.Option>
                <Select.Option value={CoEAccessType.WO}>只写 (wo)</Select.Option>
                <Select.Option value={CoEAccessType.CONST}>常量 (const)</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="defaultValue" label="默认值">
              <Input placeholder="可选" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="lowLimit" label="下限">
              <Input placeholder="可选" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="highLimit" label="上限">
              <Input placeholder="可选" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="description"
          label="描述"
        >
          <Input.TextArea rows={2} placeholder="参数描述" />
        </Form.Item>
        <Form.Item
          name="pdoMapping"
          valuePropName="checked"
        >
          <Checkbox>支持PDO映射</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CoEParameterModal;
