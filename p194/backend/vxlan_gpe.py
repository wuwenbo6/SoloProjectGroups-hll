from scapy.packet import Packet, bind_layers
from scapy.fields import (
    ByteEnumField, ByteField, X3BytesField, XByteField, FlagsField,
    BitField, BitEnumField, ShortField, XShortField, IntField,
)
from scapy.layers.inet import IP, UDP
from scapy.layers.l2 import Ether


VXLAN_GPE_NEXT_PROTOCOL = {
    1: "IPv4",
    2: "IPv6",
    3: "Ethernet",
    4: "NSH",
}


class VXLAN_GPE(Packet):
    name = "VXLAN_GPE"
    fields_desc = [
        FlagsField("flags", 0x0c, 8, ["OAM", "R", "R", "I", "R", "R", "R", "R"]),
        ByteField("reserved1", 0),
        ByteField("reserved2", 0),
        ByteEnumField("next_protocol", 3, VXLAN_GPE_NEXT_PROTOCOL),
        X3BytesField("vni", 0),
        XByteField("reserved3", 0),
    ]

    def mysummary(self):
        return self.sprintf("VXLAN_GPE(vni=%VXLAN_GPE.vni%, next=%VXLAN_GPE.next_protocol%)")


NSH_VERSION = {0: "Draft-ietf-sfc-nsh-01", 1: "RFC 8300"}


NSH_NEXT_PROTOCOL = {
    1: "IPv4",
    2: "IPv6",
    3: "Ethernet",
}


NSH_MD_TYPE = {
    1: "Fixed Length (12-byte Context Header)",
    2: "Variable Length (TLVs)",
    3: "Reserved",
    4: "Reserved",
}


class NSH(Packet):
    name = "NSH"
    fields_desc = [
        ByteField("word0_byte0", 0),
        ByteEnumField("md_type", 1, NSH_MD_TYPE),
        ByteEnumField("next_protocol", 3, NSH_NEXT_PROTOCOL),
        ByteField("word0_byte3", 0),
        X3BytesField("spi", 0),
        ByteField("si", 0),
    ]

    def __init__(self, *args, **kwargs):
        ver = kwargs.pop("ver", 0)
        oam = kwargs.pop("oam", 0)
        length = kwargs.pop("length", 6)
        if "word0_byte0" not in kwargs:
            kwargs["word0_byte0"] = ((ver & 0x3) << 6) | ((oam & 0x1) << 5)
        if "word0_byte3" not in kwargs:
            kwargs["word0_byte3"] = ((length & 0x3f) << 2)
        super().__init__(*args, **kwargs)

    @property
    def ver(self):
        return (self.word0_byte0 >> 6) & 0x3

    @property
    def oam(self):
        return (self.word0_byte0 >> 5) & 0x1

    @property
    def length(self):
        return (self.word0_byte3 >> 2) & 0x3f


class NSH_Context_Header(Packet):
    name = "NSH_Context"
    fields_desc = [
        IntField("context_platform", 0),
        IntField("context_shared", 0),
        IntField("context_service_index", 0),
        IntField("context_reserved", 0),
    ]


bind_layers(UDP, VXLAN_GPE, dport=4790)
bind_layers(VXLAN_GPE, IP, next_protocol=1)
bind_layers(VXLAN_GPE, IP, next_protocol=2)
bind_layers(VXLAN_GPE, Ether, next_protocol=3)
bind_layers(VXLAN_GPE, NSH, next_protocol=4)
bind_layers(NSH, NSH_Context_Header, md_type=1)
bind_layers(NSH_Context_Header, Ether, {})
bind_layers(NSH, Ether, md_type=2)
