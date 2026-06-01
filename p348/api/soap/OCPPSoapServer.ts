import express from 'express';
import soap from 'soap';
import { ocppHandler } from '../services/ocpp/OCPPHandler';
import { OCPPAction } from '../../shared/types';

const ocppService = {
  CentralSystemService: {
    CentralSystem: {
      BootNotification: async function (args: any, cb: any) {
        try {
          const chargePointId = args.chargeBoxIdentity || 'unknown';
          const result = await ocppHandler.handleBootNotification(chargePointId, {
            chargePointVendor: args.chargePointVendor,
            chargePointModel: args.chargePointModel,
            chargePointSerialNumber: args.chargePointSerialNumber,
            firmwareVersion: args.firmwareVersion
          });
          cb(null, result);
        } catch (error: any) {
          cb({ faultstring: error.message });
        }
      },
      StartTransaction: async function (args: any, cb: any) {
        try {
          const chargePointId = args.chargeBoxIdentity || 'unknown';
          const result = await ocppHandler.handleStartTransaction(chargePointId, {
            connectorId: args.connectorId,
            idTag: args.idTag,
            timestamp: args.timestamp,
            meterStart: args.meterStart
          });
          cb(null, result);
        } catch (error: any) {
          cb({ faultstring: error.message });
        }
      },
      StopTransaction: async function (args: any, cb: any) {
        try {
          const chargePointId = args.chargeBoxIdentity || 'unknown';
          const result = await ocppHandler.handleStopTransaction(chargePointId, {
            transactionId: args.transactionId,
            idTag: args.idTag,
            timestamp: args.timestamp,
            meterStop: args.meterStop,
            reason: args.reason
          });
          cb(null, result);
        } catch (error: any) {
          cb({ faultstring: error.message });
        }
      },
      Heartbeat: async function (args: any, cb: any) {
        try {
          const chargePointId = args.chargeBoxIdentity || 'unknown';
          const result = await ocppHandler.handleHeartbeat(chargePointId);
          cb(null, result);
        } catch (error: any) {
          cb({ faultstring: error.message });
        }
      }
    }
  }
};

const ocppWsdl = `
<?xml version="1.0" encoding="UTF-8"?>
<wsdl:definitions targetNamespace="urn://Ocpp/Cs/2015/10/"
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="urn://Ocpp/Cs/2015/10/">

  <wsdl:types>
    <xsd:schema targetNamespace="urn://Ocpp/Cs/2015/10/">
      <xsd:element name="bootNotificationRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="chargePointVendor" type="xsd:string"/>
            <xsd:element name="chargePointModel" type="xsd:string"/>
            <xsd:element name="chargePointSerialNumber" type="xsd:string" minOccurs="0"/>
            <xsd:element name="firmwareVersion" type="xsd:string" minOccurs="0"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="bootNotificationResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="status" type="xsd:string"/>
            <xsd:element name="currentTime" type="xsd:dateTime"/>
            <xsd:element name="interval" type="xsd:int"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="startTransactionRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="connectorId" type="xsd:int"/>
            <xsd:element name="idTag" type="xsd:string"/>
            <xsd:element name="timestamp" type="xsd:dateTime"/>
            <xsd:element name="meterStart" type="xsd:int"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="startTransactionResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="transactionId" type="xsd:int"/>
            <xsd:element name="idTagInfo">
              <xsd:complexType>
                <xsd:sequence>
                  <xsd:element name="status" type="xsd:string"/>
                </xsd:sequence>
              </xsd:complexType>
            </xsd:element>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="stopTransactionRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="transactionId" type="xsd:int"/>
            <xsd:element name="idTag" type="xsd:string" minOccurs="0"/>
            <xsd:element name="timestamp" type="xsd:dateTime"/>
            <xsd:element name="meterStop" type="xsd:int"/>
            <xsd:element name="reason" type="xsd:string" minOccurs="0"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="stopTransactionResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="idTagInfo" minOccurs="0">
              <xsd:complexType>
                <xsd:sequence>
                  <xsd:element name="status" type="xsd:string"/>
                </xsd:sequence>
              </xsd:complexType>
            </xsd:element>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="heartbeatRequest">
        <xsd:complexType/>
      </xsd:element>
      <xsd:element name="heartbeatResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="currentTime" type="xsd:dateTime"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </wsdl:types>

  <wsdl:message name="BootNotificationRequest">
    <wsdl:part name="parameters" element="tns:bootNotificationRequest"/>
  </wsdl:message>
  <wsdl:message name="BootNotificationResponse">
    <wsdl:part name="parameters" element="tns:bootNotificationResponse"/>
  </wsdl:message>
  <wsdl:message name="StartTransactionRequest">
    <wsdl:part name="parameters" element="tns:startTransactionRequest"/>
  </wsdl:message>
  <wsdl:message name="StartTransactionResponse">
    <wsdl:part name="parameters" element="tns:startTransactionResponse"/>
  </wsdl:message>
  <wsdl:message name="StopTransactionRequest">
    <wsdl:part name="parameters" element="tns:stopTransactionRequest"/>
  </wsdl:message>
  <wsdl:message name="StopTransactionResponse">
    <wsdl:part name="parameters" element="tns:stopTransactionResponse"/>
  </wsdl:message>
  <wsdl:message name="HeartbeatRequest">
    <wsdl:part name="parameters" element="tns:heartbeatRequest"/>
  </wsdl:message>
  <wsdl:message name="HeartbeatResponse">
    <wsdl:part name="parameters" element="tns:heartbeatResponse"/>
  </wsdl:message>

  <wsdl:portType name="CentralSystem">
    <wsdl:operation name="BootNotification">
      <wsdl:input message="tns:BootNotificationRequest"/>
      <wsdl:output message="tns:BootNotificationResponse"/>
    </wsdl:operation>
    <wsdl:operation name="StartTransaction">
      <wsdl:input message="tns:StartTransactionRequest"/>
      <wsdl:output message="tns:StartTransactionResponse"/>
    </wsdl:operation>
    <wsdl:operation name="StopTransaction">
      <wsdl:input message="tns:StopTransactionRequest"/>
      <wsdl:output message="tns:StopTransactionResponse"/>
    </wsdl:operation>
    <wsdl:operation name="Heartbeat">
      <wsdl:input message="tns:HeartbeatRequest"/>
      <wsdl:output message="tns:HeartbeatResponse"/>
    </wsdl:operation>
  </wsdl:portType>

  <wsdl:binding name="CentralSystemBinding" type="tns:CentralSystem">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="BootNotification">
      <soap:operation soapAction="urn://Ocpp/Cs/2015/10/BootNotification"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="StartTransaction">
      <soap:operation soapAction="urn://Ocpp/Cs/2015/10/StartTransaction"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="StopTransaction">
      <soap:operation soapAction="urn://Ocpp/Cs/2015/10/StopTransaction"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
    <wsdl:operation name="Heartbeat">
      <soap:operation soapAction="urn://Ocpp/Cs/2015/10/Heartbeat"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>

  <wsdl:service name="CentralSystemService">
    <wsdl:port name="CentralSystem" binding="tns:CentralSystemBinding">
      <soap:address location="http://localhost:3001/ocpp/soap"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>
`;

export function setupSOAPServer(app: express.Application): void {
  soap.listen(app, '/ocpp/soap', ocppService, ocppWsdl, () => {
    console.log('[SOAP] OCPP SOAP server started on /ocpp/soap');
  });
}
