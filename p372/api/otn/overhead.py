from typing import List, Dict, Any, Optional


class PMOverhead:
    def __init__(self):
        self.tti: List[int] = [0] * 64
        self.bdi: bool = False
        self.tim: bool = False
        self.bei: int = 0
        self.biae: bool = False
        self.status: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tti": self.tti,
            "bdi": self.bdi,
            "tim": self.tim,
            "bei": self.bei,
            "biae": self.biae,
            "status": self.status,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PMOverhead":
        pm = cls()
        pm.tti = data.get("tti", [0] * 64)
        pm.bdi = data.get("bdi", False)
        pm.tim = data.get("tim", False)
        pm.bei = data.get("bei", 0)
        pm.biae = data.get("biae", False)
        pm.status = data.get("status", 0)
        return pm


class TCMOverhead:
    def __init__(self, level: int = 1):
        self.level = level
        self.tti: List[int] = [0] * 64
        self.bdi: bool = False
        self.tim: bool = False
        self.bei: int = 0
        self.status: int = 0
        self.ltc: bool = False
        self.ais: bool = False
        self.oci: bool = False
        self.lck: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "level": self.level,
            "tti": self.tti,
            "bdi": self.bdi,
            "tim": self.tim,
            "bei": self.bei,
            "status": self.status,
            "ltc": self.ltc,
            "ais": self.ais,
            "oci": self.oci,
            "lck": self.lck,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TCMOverhead":
        tcm = cls(data.get("level", 1))
        tcm.tti = data.get("tti", [0] * 64)
        tcm.bdi = data.get("bdi", False)
        tcm.tim = data.get("tim", False)
        tcm.bei = data.get("bei", 0)
        tcm.status = data.get("status", 0)
        tcm.ltc = data.get("ltc", False)
        tcm.ais = data.get("ais", False)
        tcm.oci = data.get("oci", False)
        tcm.lck = data.get("lck", False)
        return tcm


class OPUkOverhead:
    def __init__(self):
        self.pt: int = 0x20
        self.psi: List[int] = [0] * 256
        self.jc: List[int] = [0] * 4
        self.jo: List[int] = [0] * 4
        self.njo: int = 0
        self.pjo: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pt": self.pt,
            "psi": self.psi,
            "jc": self.jc,
            "jo": self.jo,
            "njo": self.njo,
            "pjo": self.pjo,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "OPUkOverhead":
        opuk = cls()
        opuk.pt = data.get("pt", 0x20)
        opuk.psi = data.get("psi", [0] * 256)
        opuk.jc = data.get("jc", [0] * 4)
        opuk.jo = data.get("jo", [0] * 4)
        opuk.njo = data.get("njo", 0)
        opuk.pjo = data.get("pjo", 0)
        return opuk


class ODUOverhead:
    def __init__(self):
        self.fas: List[int] = [0xF6, 0xF6, 0xF6, 0x28, 0x28, 0x28]
        self.mfas: int = 0
        self.pm: PMOverhead = PMOverhead()
        self.tcm: List[TCMOverhead] = [TCMOverhead(level=i) for i in range(1, 7)]
        self.aps: List[int] = [0, 0, 0, 0]
        self.exp: List[int] = [0, 0]
        self.opuk: OPUkOverhead = OPUkOverhead()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fas": self.fas,
            "mfas": self.mfas,
            "pm": self.pm.to_dict(),
            "tcm": [t.to_dict() for t in self.tcm],
            "aps": self.aps,
            "exp": self.exp,
            "opuk": self.opuk.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ODUOverhead":
        oh = cls()
        oh.fas = data.get("fas", [0xF6, 0xF6, 0xF6, 0x28, 0x28, 0x28])
        oh.mfas = data.get("mfas", 0)
        if "pm" in data:
            oh.pm = PMOverhead.from_dict(data["pm"])
        if "tcm" in data:
            oh.tcm = [TCMOverhead.from_dict(t) for t in data["tcm"]]
        oh.aps = data.get("aps", [0, 0, 0, 0])
        oh.exp = data.get("exp", [0, 0])
        if "opuk" in data:
            oh.opuk = OPUkOverhead.from_dict(data["opuk"])
        return oh

    def validate(self) -> List[str]:
        errors: List[str] = []
        if len(self.fas) != 6:
            errors.append("FAS必须是6字节")
        if not (0 <= self.mfas <= 255):
            errors.append("MFAS必须在0-255范围内")
        if not (0 <= self.opuk.pt <= 255):
            errors.append("PT必须在0-255范围内")
        for i, tcm in enumerate(self.tcm):
            if not (0 <= tcm.bei <= 7):
                errors.append(f"TCM{i + 1} BEI必须在0-7范围内")
        return errors

    def apply_to_frame(self, frame):
        for row in range(frame.rows):
            for i, val in enumerate(self.fas):
                frame.data[row][i] = val
        frame.data[0][7] = self.mfas & 0xFF
        pm_row1_start = 9
        frame.data[0][pm_row1_start] = (self.pm.tti[0] if self.pm.tti else 0) & 0xFF
        frame.data[0][pm_row1_start + 1] = (self.pm.bei << 4) | (1 if self.pm.bdi else 0) | (1 if self.pm.biae else 0)
        frame.data[0][pm_row1_start + 2] = self.pm.status & 0xFF
        for i in range(4):
            frame.data[i][14] = self.opuk.pt & 0xFF
        for i, jc_val in enumerate(self.opuk.jc):
            if i < frame.rows:
                frame.data[i][15] = jc_val & 0xFF
        for i in range(min(len(self.opuk.psi), 256)):
            psi_col = 16
            frame.data[0][psi_col] = self.opuk.psi[0] & 0xFF
