from dataclasses import dataclass, field
from typing import List, Optional, Generator, BinaryIO, Dict, Any
import struct
import io
import os
import xml.etree.ElementTree as ET
from xml.dom import minidom


@dataclass
class FileDescriptor:
    file_type: str
    shareable: bool
    file_characteristics: str


@dataclass
class AccessPermissions:
    delete: str = "N/A"
    terminate: str = "N/A"
    activate: str = "N/A"
    deactivate: str = "N/A"
    read: str = "N/A"
    update: str = "N/A"
    write: str = "N/A"
    read_binary: str = "N/A"
    update_binary: str = "N/A"
    read_record: str = "N/A"
    update_record: str = "N/A"
    append_record: str = "N/A"


@dataclass
class EFRecord:
    record_number: int
    offset: int
    data: bytes
    hex_data: str = ""
    parsed_fields: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ISO7816File:
    fid: str
    name: str
    file_type: str
    path: str = ""
    descriptor: Optional[FileDescriptor] = None
    access_permissions: AccessPermissions = field(default_factory=AccessPermissions)
    size: int = 0
    children: List['ISO7816File'] = field(default_factory=list)
    parent: Optional['ISO7816File'] = None
    lifecycle: str = "N/A"
    file_offset: int = 0
    data_length: int = 0
    record_size: int = 0
    record_count: int = 0
    records: List[EFRecord] = field(default_factory=list)
    ef_type: str = ""
    raw_data: bytes = b""


class StreamISO7816Parser:
    CHUNK_SIZE = 64 * 1024

    def __init__(self, stream: Optional[BinaryIO] = None, chunk_size: int = CHUNK_SIZE):
        self.stream = stream
        self.chunk_size = chunk_size
        self.root = None
        self._buffer = b""
        self._buffer_offset = 0
        self._file_offset = 0
        self._known_files = self._init_known_files()

    def _init_known_files(self) -> Dict[str, str]:
        return {
            '3F00': 'MF (Master File)',
            '7F10': 'DF TELECOM',
            '7F20': 'DF GSM',
            '7F21': 'DF USIM',
            '7F22': 'DF ISIM',
            '7F23': 'DF CSIM',
            '7F24': 'DF EAP',
            '7F25': 'DF DFPK',
            '7F40': 'DF ISIM',
            '7F41': 'DF IPSEC',
            '7F42': 'DF IWLAN',
            '7F43': 'DF GBA',
            '7F44': 'DF MBMS',
            '7F45': 'DF V2X',
            '7F46': 'DF PROSe',
            '7F47': 'DF 5GS',
            '7F48': 'DF SUCI',
            '7F49': 'DF SOR',
            '7F4A': 'DF OMA',
            '7F4B': 'DF SNPN',
            '7F4C': 'DF UE_POLICY',
            '7F4D': 'DF LADN',
            '7F4E': 'DF NSSAA',
            '7F4F': 'DF EAS',
            '7F50': 'DF PCSC',
            '7F51': 'DF CTM',
            '7F52': 'DF M2M',
            '7F53': 'DF RACS',
            '7F54': 'DF SEAC',
            '7F55': 'DF SPIR',
            '7F56': 'DF SAE',
            '7F57': 'DF HPS',
            '7F58': 'DF V2X2',
            '7F59': 'DF N5GC',
            '7F5A': 'DF ACE',
            '7F5B': 'DF RSU',
            '7F5C': 'DF MCX',
            '7F5D': 'DF MCVIDEO',
            '7F5E': 'DF MCDATA',
            '7F5F': 'DF MCPTT',
            '7F60': 'DF MCS',
            '7F61': 'DF MCSH',
            '7F62': 'DF MCSX',
            '7F63': 'DF MCAD',
            '7F64': 'DF MCBC',
            '7F65': 'DF MCPOL',
            '7F66': 'DF MCGPS',
            '7F67': 'DF MCLOC',
            '7F68': 'DF MCQA',
            '7F69': 'DF MCSDS',
            '7F6A': 'DF MCID',
            '7F6B': 'DF MCUE',
            '7F6C': 'DF MCSER',
            '7F6D': 'DF MCGRP',
            '7F6E': 'DF MCUSR',
            '7F6F': 'DF MCSCFG',
            '7F70': 'DF MCPTT_ID',
            '7F71': 'DF MCPTT_CFG',
            '7F72': 'DF MCPTT_GRP',
            '7F73': 'DF MCPTT_USR',
            '7F74': 'DF MCPTT_SVC',
            '7F75': 'DF MCPTT_POL',
            '7F76': 'DF MCPTT_PRI',
            '7F77': 'DF MCPTT_EMG',
            '7F78': 'DF MCPTT_ALERT',
            '7F79': 'DF MCPTT_IMG',
            '7F7A': 'DF MCPTT_VIDEO',
            '7F7B': 'DF MCPTT_DATA',
            '7F7C': 'DF MCPTT_LOC',
            '7F7D': 'DF MCPTT_GPS',
            '7F7E': 'DF MCPTT_QA',
            '7F7F': 'DF MCPTT_SDS',
            '6F05': 'EF ICCID',
            '6F07': 'EF IMSI',
            '6F20': 'EF MSISDN',
            '6F30': 'EF SMS',
            '6F31': 'EF ADN',
            '6F32': 'EF FDN',
            '6F3E': 'EF EXT1',
            '6F3A': 'EF SPN',
            '6FAD': 'EF PHASE',
            '6F06': 'EF PLMNsel',
            '6F78': 'EF ACC',
            '6F7B': 'EF FPLMN',
            '6F40': 'EF LP',
            '6F43': 'EF SST',
            '6F45': 'EF ACM',
            '6F46': 'EF ACMMAX',
            '6F47': 'EF GID1',
            '6F48': 'EF GID2',
            '6F49': 'EF PUCT',
            '6F4B': 'EF CBMI',
            '6F4C': 'EF CBMR',
            '6F4D': 'EF CBMID',
            '6F4E': 'EF ECC',
            '6F50': 'EF BCCH',
            '6F52': 'EF ACC',
            '6F53': 'EF FQDN',
            '6F60': 'EF LOCI',
            '6F61': 'EF AD',
            '6F62': 'EF Kc',
            '6F63': 'EF AGE',
            '6F74': 'EF RAND',
            '6F75': 'EF KcGPRS',
            '6F76': 'EF TMSI',
            '6F77': 'EF TMSIS',
            '6F78': 'EF LOCIGPRS',
            '6F79': 'EF SAI',
            '6F80': 'EF AUMN',
            '6F81': 'EF ADNshort',
            '6F82': 'EF BDN',
            '6F83': 'EF BDNext',
            '6F84': 'EF SMSR',
            '6F85': 'EF SMSP',
            '6F86': 'EF SMSS',
            '6F87': 'EF SIM',
            '6F88': 'EF AOC',
            '6F89': 'EF AOCE',
            '6F8A': 'EF TA',
            '6F8B': 'EF AAeM',
            '6F8C': 'EF SUME',
            '6F8D': 'EF PLMNwAcT',
            '6F8E': 'EF OPLMNwAcT',
            '6F8F': 'EF HPLMNwAcT',
            '6F90': 'EF CMIR',
            '6F91': 'EF CMI',
            '6F92': 'EF PSLOCI',
            '6F93': 'EF KcEPS',
            '6F94': 'EF NASKEYS',
            '6F95': 'EF EPSLOCI',
            '6F96': 'EF EPLMNwAcT',
            '6F97': 'EF AUTH_POLICY',
            '6F98': 'EF USIM_SERVICES',
            '6F99': 'EF UICC_CAT',
            '6F9A': 'EF START_HFN',
            '6F9B': 'EF THRESHOLD',
            '6F9C': 'EF MAX_HFN',
            '6F9D': 'EF AKA_KEYS',
            '6F9E': 'EF IK',
            '6F9F': 'EF CK',
            '6FA0': 'EF EF_IMG',
            '6FA1': 'EF EF_LI',
            '6FA2': 'EF EF_ARR',
            '6FA3': 'EF EF_ICI',
            '6FA4': 'EF EF_ICI2',
            '6FA5': 'EF EF_GBAPUB',
            '6FA6': 'EF EF_GBANL',
            '6FA7': 'EF EF_MMSN',
            '6FA8': 'EF EF_MMSISDN',
            '6FA9': 'EF EF_MMSUP',
            '6FAA': 'EF EF_MMSUCP',
            '6FAB': 'EF EF_MMSUSER',
            '6FAC': 'EF EF_PNN',
            '6FAD': 'EF EF_OPL',
            '6FAE': 'EF EF_MBDN',
            '6FAF': 'EF EF_EXT6',
            '6FB0': 'EF EF_EXT7',
            '6FB1': 'EF EF_MBI',
            '6FB2': 'EF EF_MWIS',
            '6FB3': 'EF EF_CFIS',
            '6FB4': 'EF EF_EXT2',
            '6FB5': 'EF EF_SPDI',
            '6FB6': 'EF EF_MMSICP',
            '6FB7': 'EF EF_MMSI',
            '6FB8': 'EF EF_NIA',
            '6FB9': 'EF EF_VGCS',
            '6FBA': 'EF EF_VGCSS',
            '6FBB': 'EF EF_VBS',
            '6FBC': 'EF EF_VBSS',
            '6FBD': 'EF EF_PSEUDO',
            '6FBE': 'EF EF_AA',
            '6FBF': 'EF EF_ECC',
            '6FC0': 'EF EF_ECCREC',
            '6FC1': 'EF EF_GID3',
            '6FC2': 'EF EF_GID4',
            '6FC3': 'EF EF_MSISDN',
            '6FC4': 'EF EF_SMSS',
            '6FC5': 'EF EF_SMES',
            '6FC6': 'EF EF_SMSSS',
            '6FC7': 'EF EF_SMSSR',
            '6FC8': 'EF EF_SMSP',
            '6FC9': 'EF EF_SMSR',
            '6FCA': 'EF EF_SMSS',
            '6FCB': 'EF EF_SMS',
            '6FCC': 'EF EF_SMSP',
            '6FCD': 'EF EF_SMSR',
            '6FCE': 'EF EF_SMSS',
            '6FCF': 'EF EF_SMS',
            '6FD0': 'EF EF_ECC',
            '6FD1': 'EF EF_ECCREC',
            '6FD2': 'EF EF_NAA',
            '6FD3': 'EF EF_BROADCAST',
            '6FD4': 'EF EF_DCK',
            '6FD5': 'EF EF_EPDGID',
            '6FD6': 'EF EF_EPDGAUTH',
            '6FD7': 'EF EF_UICCIARI',
            '6FD8': 'EF EF_IMG',
            '6FD9': 'EF EF_LI',
            '6FDA': 'EF EF_ARR',
            '6FDB': 'EF EF_GBAPUB',
            '6FDC': 'EF EF_GBANL',
            '6FDD': 'EF EF_MMSN',
            '6FDE': 'EF EF_MMSISDN',
            '6FDF': 'EF EF_MMSUP',
            '6FE0': 'EF EF_MMSUCP',
            '6FE1': 'EF EF_MMSUSER',
            '6FE2': 'EF EF_PNN',
            '6FE3': 'EF EF_OPL',
            '6FE4': 'EF EF_MBDN',
            '6FE5': 'EF EF_EXT6',
            '6FE6': 'EF EF_EXT7',
            '6FE7': 'EF EF_MBI',
            '6FE8': 'EF EF_MWIS',
            '6FE9': 'EF EF_CFIS',
            '6FEA': 'EF EF_EXT2',
            '6FEB': 'EF EF_SPDI',
            '6FEC': 'EF EF_MMSICP',
            '6FED': 'EF EF_MMSI',
            '6FEE': 'EF EF_NIA',
            '6FEF': 'EF EF_VGCS',
        }

    def _init_ef_record_configs(self) -> Dict[str, Dict[str, Any]]:
        return {
            '6F3A': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'SPN', 'offset': 0, 'length': 16, 'type': 'string'},
                    {'name': 'CPHS Service Table', 'offset': 16, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F05': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'ICCID', 'offset': 0, 'length': 10, 'type': 'bcd'},
                ]
            },
            '6F07': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'IMSI', 'offset': 0, 'length': 9, 'type': 'bcd'},
                ]
            },
            '6F31': {
                'ef_type': 'linear_fixed',
                'record_size': 14,
                'fields': [
                    {'name': 'Length of BCD Number', 'offset': 0, 'length': 1, 'type': 'uint8'},
                    {'name': 'TON/NPI', 'offset': 1, 'length': 1, 'type': 'hex'},
                    {'name': 'Dialling Number', 'offset': 2, 'length': 10, 'type': 'bcd'},
                    {'name': 'Cap/Config Id', 'offset': 12, 'length': 1, 'type': 'hex'},
                    {'name': 'Extension1', 'offset': 13, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F32': {
                'ef_type': 'linear_fixed',
                'record_size': 14,
                'fields': [
                    {'name': 'Length of BCD Number', 'offset': 0, 'length': 1, 'type': 'uint8'},
                    {'name': 'TON/NPI', 'offset': 1, 'length': 1, 'type': 'hex'},
                    {'name': 'Dialling Number', 'offset': 2, 'length': 10, 'type': 'bcd'},
                    {'name': 'Cap/Config Id', 'offset': 12, 'length': 1, 'type': 'hex'},
                    {'name': 'Extension1', 'offset': 13, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F82': {
                'ef_type': 'linear_fixed',
                'record_size': 14,
                'fields': [
                    {'name': 'Length of BCD Number', 'offset': 0, 'length': 1, 'type': 'uint8'},
                    {'name': 'TON/NPI', 'offset': 1, 'length': 1, 'type': 'hex'},
                    {'name': 'Dialling Number', 'offset': 2, 'length': 10, 'type': 'bcd'},
                    {'name': 'Cap/Config Id', 'offset': 12, 'length': 1, 'type': 'hex'},
                    {'name': 'Extension1', 'offset': 13, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F30': {
                'ef_type': 'linear_fixed',
                'record_size': 176,
                'fields': [
                    {'name': 'TPDU Data', 'offset': 0, 'length': 176, 'type': 'hex'},
                ]
            },
            '6F84': {
                'ef_type': 'linear_fixed',
                'record_size': 255,
                'fields': [
                    {'name': 'SMS Status Report', 'offset': 0, 'length': 255, 'type': 'hex'},
                ]
            },
            '6F85': {
                'ef_type': 'linear_fixed',
                'record_size': 255,
                'fields': [
                    {'name': 'SMS Status Report', 'offset': 0, 'length': 255, 'type': 'hex'},
                ]
            },
            '6F86': {
                'ef_type': 'linear_fixed',
                'record_size': 50,
                'fields': [
                    {'name': 'Status', 'offset': 0, 'length': 1, 'type': 'hex'},
                    {'name': 'TPDU Data', 'offset': 1, 'length': 49, 'type': 'hex'},
                ]
            },
            '6F80': {
                'ef_type': 'linear_fixed',
                'record_size': 255,
                'fields': [
                    {'name': 'AUMN Data', 'offset': 0, 'length': 255, 'type': 'hex'},
                ]
            },
            '6F4B': {
                'ef_type': 'linear_fixed',
                'record_size': 3,
                'fields': [
                    {'name': 'Channel Id', 'offset': 0, 'length': 1, 'type': 'uint8'},
                    {'name': 'MI', 'offset': 1, 'length': 1, 'type': 'uint8'},
                    {'name': 'DCS', 'offset': 2, 'length': 1, 'type': 'uint8'},
                ]
            },
            '6F4C': {
                'ef_type': 'linear_fixed',
                'record_size': 12,
                'fields': [
                    {'name': 'MI', 'offset': 0, 'length': 1, 'type': 'uint8'},
                    {'name': 'MID', 'offset': 1, 'length': 8, 'type': 'hex'},
                    {'name': 'Total PDUs', 'offset': 9, 'length': 1, 'type': 'uint8'},
                    {'name': 'Session Id', 'offset': 10, 'length': 1, 'type': 'uint8'},
                    {'name': 'Rfu', 'offset': 11, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F4D': {
                'ef_type': 'linear_fixed',
                'record_size': 1,
                'fields': [
                    {'name': 'CBMI Id', 'offset': 0, 'length': 1, 'type': 'uint8'},
                ]
            },
            '6F4E': {
                'ef_type': 'linear_fixed',
                'record_size': 5,
                'fields': [
                    {'name': 'ECC Data', 'offset': 0, 'length': 5, 'type': 'bcd'},
                ]
            },
            '6F06': {
                'ef_type': 'linear_fixed',
                'record_size': 2,
                'fields': [
                    {'name': 'PLMN', 'offset': 0, 'length': 2, 'type': 'bcd'},
                ]
            },
            '6F7B': {
                'ef_type': 'linear_fixed',
                'record_size': 3,
                'fields': [
                    {'name': 'MCC/MNC', 'offset': 0, 'length': 2, 'type': 'bcd'},
                    {'name': 'Rfu', 'offset': 2, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F8D': {
                'ef_type': 'linear_fixed',
                'record_size': 5,
                'fields': [
                    {'name': 'PLMN', 'offset': 0, 'length': 2, 'type': 'bcd'},
                    {'name': 'AcT', 'offset': 2, 'length': 2, 'type': 'uint16'},
                    {'name': 'Rfu', 'offset': 4, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F8E': {
                'ef_type': 'linear_fixed',
                'record_size': 5,
                'fields': [
                    {'name': 'PLMN', 'offset': 0, 'length': 2, 'type': 'bcd'},
                    {'name': 'AcT', 'offset': 2, 'length': 2, 'type': 'uint16'},
                    {'name': 'Rfu', 'offset': 4, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F8F': {
                'ef_type': 'linear_fixed',
                'record_size': 5,
                'fields': [
                    {'name': 'PLMN', 'offset': 0, 'length': 2, 'type': 'bcd'},
                    {'name': 'AcT', 'offset': 2, 'length': 2, 'type': 'uint16'},
                    {'name': 'Rfu', 'offset': 4, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F96': {
                'ef_type': 'linear_fixed',
                'record_size': 5,
                'fields': [
                    {'name': 'PLMN', 'offset': 0, 'length': 2, 'type': 'bcd'},
                    {'name': 'AcT', 'offset': 2, 'length': 2, 'type': 'uint16'},
                    {'name': 'Rfu', 'offset': 4, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F60': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'TMSI/P-TMSI', 'offset': 0, 'length': 4, 'type': 'uint32'},
                    {'name': 'LAI', 'offset': 4, 'length': 5, 'type': 'hex'},
                    {'name': 'TMSI Time', 'offset': 9, 'length': 1, 'type': 'uint8'},
                    {'name': 'MSP', 'offset': 10, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F76': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'TMSI/P-TMSI', 'offset': 0, 'length': 4, 'type': 'uint32'},
                    {'name': 'LAI', 'offset': 4, 'length': 5, 'type': 'hex'},
                    {'name': 'TMSI Time', 'offset': 9, 'length': 1, 'type': 'uint8'},
                    {'name': 'MSP', 'offset': 10, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F77': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'TMSI/P-TMSI', 'offset': 0, 'length': 4, 'type': 'uint32'},
                    {'name': 'LAI', 'offset': 4, 'length': 5, 'type': 'hex'},
                    {'name': 'TMSI Time', 'offset': 9, 'length': 1, 'type': 'uint8'},
                    {'name': 'MSP', 'offset': 10, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F78': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'PS-Location', 'offset': 0, 'length': 11, 'type': 'hex'},
                    {'name': 'MSP', 'offset': 11, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F61': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'Admin Data', 'offset': 0, 'length': 4, 'type': 'hex'},
                ]
            },
            '6F62': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'Kc', 'offset': 0, 'length': 8, 'type': 'hex'},
                ]
            },
            '6F63': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'Age', 'offset': 0, 'length': 1, 'type': 'uint8'},
                ]
            },
            '6F75': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'KcGPRS', 'offset': 0, 'length': 8, 'type': 'hex'},
                ]
            },
            '6F79': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'SAI', 'offset': 0, 'length': 4, 'type': 'uint32'},
                ]
            },
            '6F92': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'PS-Location', 'offset': 0, 'length': 16, 'type': 'hex'},
                    {'name': 'MSP', 'offset': 16, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F93': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'KcEPS', 'offset': 0, 'length': 8, 'type': 'hex'},
                ]
            },
            '6F94': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'NAS keys', 'offset': 0, 'length': 32, 'type': 'hex'},
                ]
            },
            '6F95': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'EPS-Location', 'offset': 0, 'length': 18, 'type': 'hex'},
                    {'name': 'MSP', 'offset': 18, 'length': 1, 'type': 'hex'},
                ]
            },
            '6F40': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'LP Data', 'offset': 0, 'length': 3, 'type': 'hex'},
                ]
            },
            '6F41': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'ICP', 'offset': 0, 'length': 1, 'type': 'uint8'},
                ]
            },
            '6F43': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'SST', 'offset': 0, 'length': 4, 'type': 'hex'},
                ]
            },
            '6F45': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'ACM', 'offset': 0, 'length': 3, 'type': 'uint24'},
                ]
            },
            '6F46': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'ACMmax', 'offset': 0, 'length': 3, 'type': 'uint24'},
                ]
            },
            '6F47': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'GID1', 'offset': 0, 'length': 3, 'type': 'hex'},
                ]
            },
            '6F48': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'GID2', 'offset': 0, 'length': 3, 'type': 'hex'},
                ]
            },
            '6F49': {
                'ef_type': 'transarent',
                'record_size': 0,
                'fields': [
                    {'name': 'PUCT', 'offset': 0, 'length': 5, 'type': 'hex'},
                ]
            },
        }

    def get_file_name(self, fid: str) -> str:
        return self._known_files.get(fid.upper(), fid)

    def _build_path(self, parent: Optional[ISO7816File], fid: str) -> str:
        if parent is None:
            return fid
        if parent.path:
            return f"{parent.path}/{fid}"
        return f"{parent.fid}/{fid}"

    def _read_chunk(self) -> bytes:
        if self.stream is None:
            return b""
        chunk = self.stream.read(self.chunk_size)
        return chunk

    def _read_bytes(self, size: int) -> bytes:
        while len(self._buffer) < size:
            chunk = self._read_chunk()
            if not chunk:
                break
            self._buffer += chunk
        result = self._buffer[:size]
        self._buffer = self._buffer[size:]
        self._file_offset += len(result)
        return result

    def _seek(self, offset: int, whence: int = os.SEEK_SET) -> int:
        if self.stream is not None:
            self._buffer = b""
            self._file_offset = self.stream.seek(offset, whence)
            return self._file_offset
        return self._file_offset

    def _tell(self) -> int:
        return self._file_offset

    def parse_access_conditions(self, ac_bytes: bytes) -> AccessPermissions:
        perms = AccessPermissions()
        if len(ac_bytes) >= 1:
            ac1 = ac_bytes[0]
            perms.terminate = self._ac_to_string(ac1 >> 4 & 0x0F)
            perms.delete = self._ac_to_string(ac1 & 0x0F)
        if len(ac_bytes) >= 2:
            ac2 = ac_bytes[1]
            perms.deactivate = self._ac_to_string(ac2 >> 4 & 0x0F)
            perms.activate = self._ac_to_string(ac2 & 0x0F)
        if len(ac_bytes) >= 3:
            ac3 = ac_bytes[2]
            perms.read = self._ac_to_string(ac3 >> 4 & 0x0F)
            perms.update = self._ac_to_string(ac3 & 0x0F)
        if len(ac_bytes) >= 4:
            ac4 = ac_bytes[3]
            perms.read_binary = self._ac_to_string(ac4 >> 4 & 0x0F)
            perms.update_binary = self._ac_to_string(ac4 & 0x0F)
        if len(ac_bytes) >= 5:
            ac5 = ac_bytes[4]
            perms.read_record = self._ac_to_string(ac5 >> 4 & 0x0F)
            perms.update_record = self._ac_to_string(ac5 & 0x0F)
        if len(ac_bytes) >= 6:
            ac6 = ac_bytes[5]
            perms.append_record = self._ac_to_string(ac6 >> 4 & 0x0F)
            perms.write = self._ac_to_string(ac6 & 0x0F)
        return perms

    def _ac_to_string(self, ac: int) -> str:
        if ac == 0x0:
            return "Always"
        elif ac == 0x1:
            return "CHV1"
        elif ac == 0x2:
            return "CHV2"
        elif ac == 0x3:
            return "RFU"
        elif ac == 0x4:
            return "ADM1"
        elif ac == 0x5:
            return "ADM2"
        elif ac == 0x6:
            return "ADM3"
        elif ac == 0x7:
            return "ADM4"
        elif ac == 0x8:
            return "ADM5"
        elif ac == 0x9:
            return "Never"
        elif ac == 0xA:
            return "ADM6"
        elif ac == 0xB:
            return "ADM7"
        elif ac == 0xC:
            return "ADM8"
        elif ac == 0xD:
            return "ADM9"
        elif ac == 0xE:
            return "ADM10"
        elif ac == 0xF:
            return "N/A"
        return f"0x{ac:02X}"

    def parse_fcp(self, fcp_data: bytes) -> Dict[str, Any]:
        result = {
            'file_size': 0,
            'file_descriptor': None,
            'file_id': None,
            'access_conditions': AccessPermissions(),
            'lifecycle': 'N/A',
            'df_name': None,
            'proprietary_info': None
        }
        offset = 0
        while offset < len(fcp_data):
            if offset >= len(fcp_data):
                break
            tag = fcp_data[offset]
            offset += 1
            if tag == 0x00:
                break
            if offset >= len(fcp_data):
                break
            length = fcp_data[offset]
            offset += 1
            if length == 0xFF and offset + 2 <= len(fcp_data):
                length = struct.unpack('>H', fcp_data[offset:offset+2])[0]
                offset += 2
            if offset + length > len(fcp_data):
                break
            data = fcp_data[offset:offset+length]
            if tag == 0x80:
                if length == 1:
                    result['file_size'] = data[0]
                elif length == 2:
                    result['file_size'] = struct.unpack('>H', data)[0]
                elif length == 4:
                    result['file_size'] = struct.unpack('>I', data)[0]
            elif tag == 0x81:
                if length == 1:
                    result['file_size'] = data[0]
                elif length == 2:
                    result['file_size'] = struct.unpack('>H', data)[0]
            elif tag == 0x82:
                if len(data) >= 1:
                    fd_byte = data[0]
                    file_type = "Unknown"
                    if (fd_byte & 0x38) == 0x00:
                        file_type = "Working EF"
                    elif (fd_byte & 0x38) == 0x08:
                        file_type = "Internal EF"
                    elif (fd_byte & 0x38) == 0x38:
                        file_type = "DF or ADF"
                    elif (fd_byte & 0x38) == 0x10:
                        file_type = "Transparent EF"
                    elif (fd_byte & 0x38) == 0x11:
                        file_type = "Linear Fixed EF"
                    elif (fd_byte & 0x38) == 0x12:
                        file_type = "Cyclic EF"
                    elif (fd_byte & 0x38) == 0x13:
                        file_type = "Variable EF"
                    shareable = (fd_byte & 0x40) != 0
                    result['file_descriptor'] = FileDescriptor(
                        file_type=file_type,
                        shareable=shareable,
                        file_characteristics=f"0x{fd_byte:02X}"
                    )
                    result['file_type_raw'] = fd_byte & 0x38
            elif tag == 0x83:
                if length == 2:
                    result['file_id'] = data.hex().upper()
            elif tag == 0x84:
                result['df_name'] = data.hex().upper()
            elif tag == 0x85:
                result['proprietary_info'] = data.hex().upper()
            elif tag == 0x86:
                result['access_conditions'] = self.parse_access_conditions(data)
            elif tag == 0x87:
                pass
            elif tag == 0x88:
                pass
            elif tag == 0x8A:
                if len(data) >= 1:
                    lc_byte = data[0]
                    if lc_byte == 0x00:
                        result['lifecycle'] = "No Information"
                    elif lc_byte == 0x01:
                        result['lifecycle'] = "Creation"
                    elif lc_byte == 0x03:
                        result['lifecycle'] = "Initialization"
                    elif lc_byte == 0x05:
                        result['lifecycle'] = "Operational (Activated)"
                    elif lc_byte == 0x04:
                        result['lifecycle'] = "Operational (Deactivated)"
                    elif lc_byte == 0x06:
                        result['lifecycle'] = "Termination"
                    elif lc_byte == 0x07:
                        result['lifecycle'] = "Terminated"
                    else:
                        result['lifecycle'] = f"0x{lc_byte:02X}"
            elif tag == 0x8B:
                pass
            elif tag == 0x8C:
                pass
            elif tag == 0x80 | 0x20:
                pass
            elif tag == 0xA5:
                pass
            elif tag == 0xC6:
                pass
            offset += length
        return result

    def _detect_file_type_from_fid(self, fid: str) -> str:
        fid_upper = fid.upper()
        if fid_upper == '3F00':
            return 'MF'
        elif fid_upper.startswith('7F') or fid_upper.startswith('5F'):
            return 'DF'
        elif fid_upper.startswith('6F') or fid_upper.startswith('4F'):
            return 'EF'
        return 'Unknown'

    def _get_default_children(self, fid: str) -> List[str]:
        fid_upper = fid.upper()
        if fid_upper == '3F00':
            return [
                '7F10', '7F20', '7F21', '7F22', '7F23', '7F24', '7F25',
                '7F40', '7F41', '7F42', '7F43', '7F44', '7F45', '7F46', '7F47',
                '6F05', '6F07', '6F20', '6F30', '6F31', '6F32', '6F3A', '6F06',
                '6F7B', '6F40', '6F43', '6F47', '6F48', '6F4E', '6F60', '6F74'
            ]
        elif fid_upper == '7F10':
            return [
                '6F3A', '6F30', '6F31', '6F32', '6F3E', '6F42', '6F44',
                '6F84', '6F85', '6F86', '6F4B', '6F4C', '6F4D'
            ]
        elif fid_upper == '7F20':
            return [
                '6F05', '6F07', '6F06', '6F30', '6F31', '6F32', '6F40',
                '6F41', '6F43', '6F45', '6F46', '6F47', '6F48', '6F49',
                '6F4B', '6F4C', '6F4D', '6F4E', '6F50', '6F60', '6F61',
                '6F62', '6F63', '6F74', '6F75', '6F76', '6F78', '6F7B',
                '6F7E', '6F7F', '6FAD', '6FAE', '6FB0', '6FB1'
            ]
        elif fid_upper == '7F21':
            return [
                '6F05', '6F07', '6F08', '6F31', '6F3A', '6F3B', '6F3C',
                '6F40', '6F41', '6F43', '6F48', '6F49', '6F50', '6F51',
                '6F52', '6F53', '6F54', '6F55', '6F56', '6F57', '6F58',
                '6F60', '6F61', '6F62', '6F73', '6F74', '6F75', '6F76',
                '6F77', '6F78', '6F79', '6F7A', '6F7B', '6F7C', '6F7D'
            ]
        elif fid_upper == '7F22':
            return [
                '6F02', '6F03', '6F04', '6F09', '6F0A', '6F0B', '6F0C',
                '6F0D', '6F0E', '6F11', '6F12', '6F13', '6F14', '6F15',
                '6F16', '6F17', '6F18', '6F19', '6F1A', '6F1B', '6F1C'
            ]
        else:
            return [
                '6F05', '6F07', '6F20', '6F30', '6F31', '6F32', '6F3A',
                '6F06', '6F7B', '6F40', '6F43', '6F47', '6F48', '6F4E',
                '6F60', '6F74', '6F3E', '6FAD', '6F61', '6F62'
            ]

    def _parse_bcd(self, data: bytes) -> str:
        result = []
        for byte in data:
            result.append(str(byte & 0x0F))
            result.append(str(byte >> 4))
        return ''.join(result)

    def _parse_field(self, field: Dict[str, Any], data: bytes) -> Any:
        offset = field.get('offset', 0)
        length = field.get('length', 0)
        field_type = field.get('type', 'hex')
        name = field.get('name', '')
        if offset + length > len(data):
            return {'name': name, 'value': 'N/A', 'hex': data[offset:offset+length].hex().upper() if offset < len(data) else ''}
        field_data = data[offset:offset+length]
        try:
            if field_type == 'string':
                value = field_data.decode('utf-8', errors='ignore').rstrip('\x00')
            elif field_type == 'bcd':
                value = self._parse_bcd(field_data)
            elif field_type == 'uint8':
                value = field_data[0]
            elif field_type == 'uint16':
                value = struct.unpack('>H', field_data)[0] if length >= 2 else 0
            elif field_type == 'uint24':
                value = int.from_bytes(field_data[:3], 'big') if length >= 3 else 0
            elif field_type == 'uint32':
                value = struct.unpack('>I', field_data)[0] if length >= 4 else 0
            elif field_type == 'hex':
                value = field_data.hex().upper()
            else:
                value = field_data.hex().upper()
        except Exception:
            value = field_data.hex().upper()
        return {
            'name': name,
            'value': value,
            'hex': field_data.hex().upper(),
            'offset': offset,
            'length': length,
            'type': field_type
        }

    def _parse_ef_records(self, ef_file: ISO7816File, ef_config: Dict[str, Any]):
        if not ef_file.raw_data:
            return
        data = ef_file.raw_data
        fields = ef_config.get('fields', [])
        ef_type = ef_config.get('ef_type', 'transarent')
        if ef_type == 'linear_fixed' or ef_type == 'cyclic':
            record_size = ef_config.get('record_size', 0)
            if record_size > 0 and len(data) >= record_size:
                record_count = len(data) // record_size
                ef_file.record_count = record_count
                ef_file.record_size = record_size
                for i in range(record_count):
                    record_offset = i * record_size
                    record_data = data[record_offset:record_offset + record_size]
                    parsed_fields = [self._parse_field(field, record_data) for field in fields]
                    record = EFRecord(
                        record_number=i + 1,
                        offset=record_offset,
                        data=record_data,
                        hex_data=record_data.hex().upper(),
                        parsed_fields={'fields': parsed_fields}
                    )
                    ef_file.records.append(record)
        elif ef_type == 'transarent':
            parsed_fields = [self._parse_field(field, data) for field in fields]
            record = EFRecord(
                record_number=1,
                offset=0,
                data=data,
                hex_data=data.hex().upper(),
                parsed_fields={'fields': parsed_fields}
            )
            ef_file.records.append(record)

    def _get_ef_config(self, fid: str) -> Optional[Dict[str, Any]]:
        configs = self._init_ef_record_configs()
        return configs.get(fid.upper())

    def parse(self, total_size: int = 0, parse_records: bool = True) -> ISO7816File:
        self.root = ISO7816File(
            fid='3F00',
            name=self.get_file_name('3F00'),
            file_type='MF',
            path='3F00',
            size=total_size,
            file_offset=0,
            data_length=total_size
        )
        self._parse_df_recursive(self.root, depth=0, parse_records=parse_records)
        return self.root

    def _parse_df_recursive(self, parent: ISO7816File, depth: int = 0, parse_records: bool = True):
        if depth > 10:
            return
        children = self._get_default_children(parent.fid)
        for fid in children:
            file_type = self._detect_file_type_from_fid(fid)
            path = self._build_path(parent, fid)
            if file_type == 'DF':
                df = ISO7816File(
                    fid=fid,
                    name=self.get_file_name(fid),
                    file_type='DF',
                    path=path,
                    parent=parent,
                    file_offset=self._tell()
                )
                parent.children.append(df)
                self._parse_df_recursive(df, depth + 1, parse_records)
            elif file_type == 'EF':
                ef_size = self._get_ef_size(fid)
                ef_config = self._get_ef_config(fid)
                ef_type = ef_config.get('ef_type', '') if ef_config else ''
                ef = ISO7816File(
                    fid=fid,
                    name=self.get_file_name(fid),
                    file_type='EF',
                    path=path,
                    parent=parent,
                    size=ef_size,
                    file_offset=self._tell(),
                    data_length=ef_size,
                    ef_type=ef_type
                )
                if parse_records and ef_config:
                    self._parse_ef_records(ef, ef_config)
                parent.children.append(ef)

    def _get_ef_size(self, fid: str) -> int:
        ef_sizes = {
            '6F05': 10,
            '6F07': 9,
            '6F08': 17,
            '6F20': 14,
            '6F30': 255,
            '6F31': 255,
            '6F32': 255,
            '6F3A': 17,
            '6F06': 16,
            '6F7B': 12,
            '6F40': 3,
            '6F41': 1,
            '6F43': 4,
            '6F45': 3,
            '6F46': 3,
            '6F47': 3,
            '6F48': 3,
            '6F49': 5,
            '6F4E': 5,
            '6F60': 11,
            '6F61': 4,
            '6F62': 8,
            '6F63': 1,
            '6F74': 16,
            '6F75': 8,
            '6F76': 11,
            '6F77': 16,
            '6F78': 17,
            '6F7E': 2,
            '6F7F': 4,
            '6FAD': 1,
            '6FAE': 8,
            '6FB0': 8,
            '6FB1': 4,
            '6F3E': 10,
            '6F42': 255,
            '6F44': 10,
            '6F84': 255,
            '6F85': 255,
            '6F86': 50,
            '6F4B': 10,
            '6F4C': 5,
            '6F4D': 10,
        }
        return ef_sizes.get(fid.upper(), 0)

    def parse_stream_generator(self, total_size: int = 0, parse_records: bool = True) -> Generator[ISO7816File, None, None]:
        self.root = ISO7816File(
            fid='3F00',
            name=self.get_file_name('3F00'),
            file_type='MF',
            path='3F00',
            size=total_size,
            file_offset=0,
            data_length=total_size
        )
        yield self.root
        yield from self._parse_df_generator(self.root, depth=0, parse_records=parse_records)

    def _parse_df_generator(self, parent: ISO7816File, depth: int = 0, parse_records: bool = True) -> Generator[ISO7816File, None, None]:
        if depth > 10:
            return
        children = self._get_default_children(parent.fid)
        for fid in children:
            file_type = self._detect_file_type_from_fid(fid)
            path = self._build_path(parent, fid)
            if file_type == 'DF':
                df = ISO7816File(
                    fid=fid,
                    name=self.get_file_name(fid),
                    file_type='DF',
                    path=path,
                    parent=parent,
                    file_offset=self._tell()
                )
                parent.children.append(df)
                yield df
                yield from self._parse_df_generator(df, depth + 1, parse_records)
            elif file_type == 'EF':
                ef_size = self._get_ef_size(fid)
                ef_config = self._get_ef_config(fid)
                ef_type = ef_config.get('ef_type', '') if ef_config else ''
                ef = ISO7816File(
                    fid=fid,
                    name=self.get_file_name(fid),
                    file_type='EF',
                    path=path,
                    parent=parent,
                    size=ef_size,
                    file_offset=self._tell(),
                    data_length=ef_size,
                    ef_type=ef_type
                )
                if parse_records and ef_config:
                    self._parse_ef_records(ef, ef_config)
                parent.children.append(ef)
                yield ef

    def to_dict(self, file_obj: ISO7816File, include_records: bool = True) -> Dict[str, Any]:
        result = {
            'fid': file_obj.fid,
            'name': file_obj.name,
            'file_type': file_obj.file_type,
            'path': file_obj.path,
            'size': file_obj.size,
            'lifecycle': file_obj.lifecycle,
            'file_offset': file_obj.file_offset,
            'data_length': file_obj.data_length,
            'ef_type': file_obj.ef_type,
            'record_size': file_obj.record_size,
            'record_count': file_obj.record_count,
            'access_permissions': {
                'read': file_obj.access_permissions.read,
                'update': file_obj.access_permissions.update,
                'write': file_obj.access_permissions.write,
                'delete': file_obj.access_permissions.delete,
                'activate': file_obj.access_permissions.activate,
                'deactivate': file_obj.access_permissions.deactivate,
                'read_binary': file_obj.access_permissions.read_binary,
                'update_binary': file_obj.access_permissions.update_binary,
                'read_record': file_obj.access_permissions.read_record,
                'update_record': file_obj.access_permissions.update_record,
                'append_record': file_obj.access_permissions.append_record
            },
            'children': [self.to_dict(child, include_records) for child in file_obj.children]
        }
        if include_records and file_obj.records:
            result['records'] = [
                {
                    'record_number': r.record_number,
                    'offset': r.offset,
                    'hex_data': r.hex_data,
                    'parsed_fields': r.parsed_fields
                }
                for r in file_obj.records
            ]
        return result

    def to_xml(self, file_obj: Optional[ISO7816File] = None, pretty: bool = True) -> str:
        if file_obj is None:
            file_obj = self.root
        if file_obj is None:
            return ''
        root = ET.Element('SIMCardFileSystem')
        root.set('version', '2.0')
        self._file_to_xml(file_obj, root)
        xml_str = ET.tostring(root, encoding='unicode')
        if pretty:
            try:
                dom = minidom.parseString(xml_str)
                xml_str = dom.toprettyxml(indent='  ', encoding='UTF-8').decode('UTF-8')
            except Exception:
                pass
        return xml_str

    def _file_to_xml(self, file_obj: ISO7816File, parent_element: ET.Element):
        file_elem = ET.SubElement(parent_element, 'File')
        file_elem.set('fid', file_obj.fid)
        file_elem.set('name', file_obj.name)
        file_elem.set('type', file_obj.file_type)
        file_elem.set('path', file_obj.path)
        file_elem.set('size', str(file_obj.size))
        file_elem.set('offset', str(file_obj.file_offset))
        if file_obj.ef_type:
            file_elem.set('ef_type', file_obj.ef_type)
        if file_obj.record_size > 0:
            file_elem.set('record_size', str(file_obj.record_size))
        if file_obj.record_count > 0:
            file_elem.set('record_count', str(file_obj.record_count))
        if file_obj.lifecycle:
            file_elem.set('lifecycle', file_obj.lifecycle)
        if file_obj.access_permissions:
            perm_elem = ET.SubElement(file_elem, 'AccessPermissions')
            perm_elem.set('read', file_obj.access_permissions.read)
            perm_elem.set('write', file_obj.access_permissions.write)
            perm_elem.set('update', file_obj.access_permissions.update)
            perm_elem.set('delete', file_obj.access_permissions.delete)
            perm_elem.set('activate', file_obj.access_permissions.activate)
            perm_elem.set('deactivate', file_obj.access_permissions.deactivate)
            perm_elem.set('read_binary', file_obj.access_permissions.read_binary)
            perm_elem.set('update_binary', file_obj.access_permissions.update_binary)
            perm_elem.set('read_record', file_obj.access_permissions.read_record)
            perm_elem.set('update_record', file_obj.access_permissions.update_record)
            perm_elem.set('append_record', file_obj.access_permissions.append_record)
        if file_obj.records:
            records_elem = ET.SubElement(file_elem, 'Records')
            for record in file_obj.records:
                record_elem = ET.SubElement(records_elem, 'Record')
                record_elem.set('number', str(record.record_number))
                record_elem.set('offset', str(record.offset))
                record_elem.set('hex', record.hex_data)
                if record.parsed_fields and 'fields' in record.parsed_fields:
                    fields_elem = ET.SubElement(record_elem, 'Fields')
                    for field in record.parsed_fields['fields']:
                        field_elem = ET.SubElement(fields_elem, 'Field')
                        field_elem.set('name', str(field.get('name', '')))
                        field_elem.set('offset', str(field.get('offset', 0)))
                        field_elem.set('length', str(field.get('length', 0)))
                        field_elem.set('type', str(field.get('type', '')))
                        field_elem.text = str(field.get('value', ''))
        for child in file_obj.children:
            self._file_to_xml(child, file_elem)

    def find_file_by_path(self, path: str) -> Optional[ISO7816File]:
        if not self.root:
            return None
        parts = path.strip('/').split('/')
        current = self.root
        for part in parts[1:]:
            found = False
            for child in current.children:
                if child.fid.upper() == part.upper():
                    current = child
                    found = True
                    break
            if not found:
                return None
        return current

    def find_files_by_type(self, file_type: str) -> List[ISO7816File]:
        result = []
        if not self.root:
            return result
        self._find_files_by_type_recursive(self.root, file_type, result)
        return result

    def _find_files_by_type_recursive(self, node: ISO7816File, file_type: str, result: List[ISO7816File]):
        if node.file_type.upper() == file_type.upper():
            result.append(node)
        for child in node.children:
            self._find_files_by_type_recursive(child, file_type, result)

    def get_all_paths(self) -> List[str]:
        paths = []
        if not self.root:
            return paths
        self._collect_paths_recursive(self.root, paths)
        return paths

    def _collect_paths_recursive(self, node: ISO7816File, paths: List[str]):
        paths.append(node.path)
        for child in node.children:
            self._collect_paths_recursive(child, paths)

    def print_tree(self, node: Optional[ISO7816File] = None, prefix: str = "", is_last: bool = True):
        if node is None:
            node = self.root
        if node is None:
            return
        connector = "└── " if is_last else "├── "
        ef_info = f" [{node.ef_type}]" if node.ef_type else ""
        records_info = f" ({node.record_count} records)" if node.record_count > 0 else ""
        print(f"{prefix}{connector}[{node.file_type}] {node.fid} - {node.name}{ef_info} ({node.path}){records_info}")
        if node.children:
            extension = "    " if is_last else "│   "
            for i, child in enumerate(node.children):
                self.print_tree(child, prefix + extension, i == len(node.children) - 1)


def parse_sim_file(data: bytes, parse_records: bool = True) -> Dict[str, Any]:
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    root = parser.parse(total_size=len(data), parse_records=parse_records)
    return parser.to_dict(root)


def parse_sim_file_streaming(file_path: str, chunk_size: int = 64 * 1024, parse_records: bool = True) -> Dict[str, Any]:
    file_size = os.path.getsize(file_path)
    with open(file_path, 'rb') as f:
        parser = StreamISO7816Parser(f, chunk_size=chunk_size)
        root = parser.parse(total_size=file_size, parse_records=parse_records)
        return parser.to_dict(root)


def parse_sim_file_generator(file_path: str, chunk_size: int = 64 * 1024, parse_records: bool = True) -> Generator[Dict[str, Any], None, None]:
    file_size = os.path.getsize(file_path)
    with open(file_path, 'rb') as f:
        parser = StreamISO7816Parser(f, chunk_size=chunk_size)
        for file_obj in parser.parse_stream_generator(total_size=file_size, parse_records=parse_records):
            yield {
                'fid': file_obj.fid,
                'name': file_obj.name,
                'file_type': file_obj.file_type,
                'path': file_obj.path,
                'size': file_obj.size,
                'file_offset': file_obj.file_offset,
                'ef_type': file_obj.ef_type,
                'record_count': file_obj.record_count,
                'records': [
                    {
                        'record_number': r.record_number,
                        'offset': r.offset,
                        'hex_data': r.hex_data,
                        'parsed_fields': r.parsed_fields
                    }
                    for r in file_obj.records
                ]
            }


def export_to_xml(file_obj: Optional[ISO7816File] = None, pretty: bool = True) -> str:
    if file_obj is None:
        return ''
    root = ET.Element('SIMCardFileSystem')
    root.set('version', '2.0')
    root.set('description', 'ISO 7816-4 Smart Card File System')
    _file_to_xml_export(file_obj, root)
    xml_str = ET.tostring(root, encoding='unicode')
    if pretty:
        try:
            dom = minidom.parseString(xml_str)
            xml_str = dom.toprettyxml(indent='  ', encoding='UTF-8').decode('UTF-8')
        except Exception:
            pass
    return xml_str


def _file_to_xml_export(file_obj: ISO7816File, parent_element: ET.Element):
    file_elem = ET.SubElement(parent_element, 'File')
    file_elem.set('fid', file_obj.fid)
    file_elem.set('name', file_obj.name)
    file_elem.set('type', file_obj.file_type)
    file_elem.set('path', file_obj.path)
    file_elem.set('size', str(file_obj.size))
    file_elem.set('offset', str(file_obj.file_offset))
    if file_obj.ef_type:
        file_elem.set('ef_type', file_obj.ef_type)
    if file_obj.record_size > 0:
        file_elem.set('record_size', str(file_obj.record_size))
    if file_obj.record_count > 0:
        file_elem.set('record_count', str(file_obj.record_count))
    if file_obj.lifecycle and file_obj.lifecycle != 'N/A':
        file_elem.set('lifecycle', file_obj.lifecycle)
    if file_obj.access_permissions:
        perm_elem = ET.SubElement(file_elem, 'AccessPermissions')
        perm_elem.set('read', file_obj.access_permissions.read)
        perm_elem.set('write', file_obj.access_permissions.write)
        perm_elem.set('update', file_obj.access_permissions.update)
        perm_elem.set('delete', file_obj.access_permissions.delete)
        perm_elem.set('activate', file_obj.access_permissions.activate)
        perm_elem.set('deactivate', file_obj.access_permissions.deactivate)
        perm_elem.set('read_binary', file_obj.access_permissions.read_binary)
        perm_elem.set('update_binary', file_obj.access_permissions.update_binary)
        perm_elem.set('read_record', file_obj.access_permissions.read_record)
        perm_elem.set('update_record', file_obj.access_permissions.update_record)
        perm_elem.set('append_record', file_obj.access_permissions.append_record)
    if file_obj.records:
        records_elem = ET.SubElement(file_elem, 'Records')
        for record in file_obj.records:
            record_elem = ET.SubElement(records_elem, 'Record')
            record_elem.set('number', str(record.record_number))
            record_elem.set('offset', str(record.offset))
            record_elem.set('hex', record.hex_data)
            if record.parsed_fields and 'fields' in record.parsed_fields:
                fields_elem = ET.SubElement(record_elem, 'Fields')
                for field in record.parsed_fields['fields']:
                    field_elem = ET.SubElement(fields_elem, 'Field')
                    field_elem.set('name', str(field.get('name', '')))
                    field_elem.set('offset', str(field.get('offset', 0)))
                    field_elem.set('length', str(field.get('length', 0)))
                    field_elem.set('type', str(field.get('type', '')))
                    field_elem.text = str(field.get('value', ''))
    for child in file_obj.children:
        _file_to_xml_export(child, file_elem)


def export_file_to_xml(file_obj: ISO7816File, output_path: str, pretty: bool = True) -> bool:
    try:
        xml_content = export_to_xml(file_obj, pretty)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(xml_content)
        return True
    except Exception:
        return False