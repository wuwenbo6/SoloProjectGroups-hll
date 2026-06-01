import pywbem
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Optional

from models import (
    ProviderInfo,
    StoragePool,
    StorageVolume,
    MaskingView,
    TopologyNode,
    TopologyEdge,
)


def _bytes_to_gb(value: Optional[int]) -> float:
    if value is None:
        return 0.0
    return round(value / (1024 ** 3), 2)


def _map_health_state(health_state: Optional[int]) -> str:
    mapping = {
        0: "Unknown",
        5: "OK",
        10: "Degraded/Warning",
        15: "Minor Failure",
        20: "Major Failure",
        25: "Critical Failure",
        30: "Non-recoverable Error",
    }
    if health_state is None:
        return "Unknown"
    return mapping.get(health_state, "Unknown")


def _get_instance_id(instance: pywbem.CIMInstance) -> str:
    key_props = instance.path.keybindings
    if key_props:
        parts = [f"{k}={v}" for k, v in key_props.items()]
        return ":".join(parts)
    return str(instance.path)


def _get_pool_type(pool_type: Optional[int]) -> str:
    mapping = {
        0: "Unknown",
        1: "Other",
        2: "Unrestricted",
        3: "Restricted",
        4: "Legacy",
    }
    if pool_type is None:
        return "Unknown"
    return mapping.get(pool_type, "Unknown")


def _safe_associators(
    conn: pywbem.WBEMConnection,
    object_path: pywbem.CIMInstanceName,
    AssocClass: Optional[str] = None,
    ResultClass: Optional[str] = None,
    Role: Optional[str] = None,
    ResultRole: Optional[str] = None,
) -> list[pywbem.CIMInstance]:
    try:
        return conn.Associators(
            object_path,
            AssocClass=AssocClass,
            ResultClass=ResultClass,
            Role=Role,
            ResultRole=ResultRole,
        )
    except pywbem.Error:
        return []
    except Exception:
        return []


def _safe_enumerate(
    conn: pywbem.WBEMConnection,
    class_name: str,
    namespace: Optional[str] = None,
) -> list[pywbem.CIMInstance]:
    try:
        kwargs = {}
        if namespace:
            kwargs["namespace"] = namespace
        return conn.EnumerateInstances(class_name, **kwargs)
    except pywbem.Error:
        return []
    except Exception:
        return []


class SMISService:
    def __init__(self) -> None:
        self._conn: Optional[pywbem.WBEMConnection] = None
        self._connected: bool = False
        self._provider_info: ProviderInfo = ProviderInfo()
        self._last_sync: Optional[str] = None
        self._cache: dict = {}

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def provider_info(self) -> ProviderInfo:
        return self._provider_info

    @property
    def last_sync(self) -> Optional[str]:
        return self._last_sync

    def connect(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        namespace: str = "root/SMI-S",
        ssl_verify: bool = False,
    ) -> tuple[bool, str, ProviderInfo]:
        try:
            url = f"https://{host}:{port}"
            creds = (username, password)
            self._conn = pywbem.WBEMConnection(
                url,
                creds,
                default_namespace=namespace,
                no_verification=not ssl_verify,
            )
            self._connected = True
            self._provider_info = self._get_provider_info()
            self._last_sync = datetime.now().isoformat()
            return True, "Connected successfully", self._provider_info
        except pywbem.Error as e:
            self._connected = False
            self._conn = None
            return False, str(e), ProviderInfo()
        except Exception as e:
            self._connected = False
            self._conn = None
            return False, str(e), ProviderInfo()

    def disconnect(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
        self._conn = None
        self._connected = False
        self._provider_info = ProviderInfo()
        self._cache = {}

    def _get_provider_info(self) -> ProviderInfo:
        if not self._connected or self._conn is None:
            return ProviderInfo()
        try:
            instances = _safe_enumerate(self._conn, "CIM_ObjectManager")
            if instances:
                inst = instances[0]
                return ProviderInfo(
                    product=str(inst.get("ElementName", "")),
                    version=str(inst.get("Version", "")),
                    vendor=str(inst.get("Manufacturer", "")),
                )
        except Exception:
            pass
        return ProviderInfo()

    def enumerate_storage_systems(self) -> list[dict]:
        if not self._connected or self._conn is None:
            return []
        instances = _safe_enumerate(self._conn, "CIM_StorageSystem")
        results = []
        for inst in instances:
            results.append({
                "instance": inst,
                "id": _get_instance_id(inst),
                "name": str(inst.get("ElementName", "")),
                "health_state": _map_health_state(inst.get("HealthState")),
                "total_size_gb": _bytes_to_gb(inst.get("TotalManagedSpace")),
                "used_size_gb": _bytes_to_gb(inst.get("UsedSpace")),
            })
        return results

    def enumerate_storage_pools(self) -> list[StoragePool]:
        if not self._connected or self._conn is None:
            return []
        systems = self.enumerate_storage_systems()
        results = []
        seen_paths = set()
        for sys_info in systems:
            pool_instances = _safe_associators(
                self._conn,
                sys_info["instance"].path,
                ResultClass="CIM_StoragePool",
                Role="Antecedent",
            )
            for inst in pool_instances:
                path_str = str(inst.path)
                if path_str in seen_paths:
                    continue
                seen_paths.add(path_str)
                total = inst.get("TotalManagedSpace")
                used = inst.get("UsedSpace")
                total_gb = _bytes_to_gb(total)
                used_gb = _bytes_to_gb(used) if used is not None else 0.0
                free_gb = round(total_gb - used_gb, 2) if total is not None and used is not None else 0.0
                results.append(StoragePool(
                    id=_get_instance_id(inst),
                    name=str(inst.get("ElementName", "")),
                    path=path_str,
                    total_size_gb=total_gb,
                    used_size_gb=used_gb,
                    free_size_gb=free_gb,
                    pool_type=_get_pool_type(inst.get("PoolType")),
                    health_state=_map_health_state(inst.get("HealthState")),
                    system_name=str(inst.get("SystemName", "")),
                ))
        if not results:
            instances = _safe_enumerate(self._conn, "CIM_StoragePool")
            for inst in instances:
                path_str = str(inst.path)
                if path_str in seen_paths:
                    continue
                seen_paths.add(path_str)
                total = inst.get("TotalManagedSpace")
                used = inst.get("UsedSpace")
                total_gb = _bytes_to_gb(total)
                used_gb = _bytes_to_gb(used) if used is not None else 0.0
                free_gb = round(total_gb - used_gb, 2) if total is not None and used is not None else 0.0
                results.append(StoragePool(
                    id=_get_instance_id(inst),
                    name=str(inst.get("ElementName", "")),
                    path=path_str,
                    total_size_gb=total_gb,
                    used_size_gb=used_gb,
                    free_size_gb=free_gb,
                    pool_type=_get_pool_type(inst.get("PoolType")),
                    health_state=_map_health_state(inst.get("HealthState")),
                    system_name=str(inst.get("SystemName", "")),
                ))
        return results

    def enumerate_storage_volumes(self) -> list[StorageVolume]:
        if not self._connected or self._conn is None:
            return []
        systems = self.enumerate_storage_systems()
        results = []
        seen_paths = set()
        for sys_info in systems:
            vol_instances = _safe_associators(
                self._conn,
                sys_info["instance"].path,
                ResultClass="CIM_StorageVolume",
                Role="Antecedent",
            )
            for inst in vol_instances:
                path_str = str(inst.path)
                if path_str in seen_paths:
                    continue
                seen_paths.add(path_str)
                vol_id = _get_instance_id(inst)
                pool_id = self._find_parent_pool_id(inst)
                block_size = inst.get("BlockSize")
                num_blocks = inst.get("NumberOfBlocks")
                size_bytes = block_size * num_blocks if block_size and num_blocks else None
                results.append(StorageVolume(
                    id=vol_id,
                    name=str(inst.get("ElementName", "")),
                    path=path_str,
                    size_gb=_bytes_to_gb(size_bytes),
                    volume_type=str(inst.get("Purpose", "")),
                    pool_id=pool_id,
                    health_state=_map_health_state(inst.get("HealthState")),
                    system_name=str(inst.get("SystemName", "")),
                ))
        if not results:
            instances = _safe_enumerate(self._conn, "CIM_StorageVolume")
            pool_map = self._build_volume_pool_map_fallback()
            for inst in instances:
                path_str = str(inst.path)
                if path_str in seen_paths:
                    continue
                seen_paths.add(path_str)
                vol_id = _get_instance_id(inst)
                pool_id = pool_map.get(vol_id, "")
                block_size = inst.get("BlockSize")
                num_blocks = inst.get("NumberOfBlocks")
                size_bytes = block_size * num_blocks if block_size and num_blocks else None
                results.append(StorageVolume(
                    id=vol_id,
                    name=str(inst.get("ElementName", "")),
                    path=path_str,
                    size_gb=_bytes_to_gb(size_bytes),
                    volume_type=str(inst.get("Purpose", "")),
                    pool_id=pool_id,
                    health_state=_map_health_state(inst.get("HealthState")),
                    system_name=str(inst.get("SystemName", "")),
                ))
        return results

    def _find_parent_pool_id(self, volume_inst: pywbem.CIMInstance) -> str:
        pool_instances = _safe_associators(
            self._conn,
            volume_inst.path,
            ResultClass="CIM_StoragePool",
            Role="Dependent",
        )
        if pool_instances:
            return _get_instance_id(pool_instances[0])
        return ""

    def _build_volume_pool_map_fallback(self) -> dict[str, str]:
        pool_map: dict[str, str] = {}
        if not self._connected or self._conn is None:
            return pool_map
        associations = _safe_enumerate(self._conn, "CIM_AllocatedFromStoragePool")
        for assoc in associations:
            dep = assoc.get("Dependent")
            ant = assoc.get("Antecedent")
            if dep and ant:
                pool_map[str(dep)] = str(ant)
        return pool_map

    def enumerate_masking_views(self) -> list[MaskingView]:
        if not self._connected or self._conn is None:
            return []
        volumes = self.enumerate_storage_volumes()
        volume_insts = self._get_volume_instances()
        results = []
        seen_paths = set()
        for vol_inst in volume_insts:
            mv_instances = _safe_associators(
                self._conn,
                vol_inst.path,
                ResultClass="CIM_MaskingView",
            )
            vol_id = _get_instance_id(vol_inst)
            vol_name = str(vol_inst.get("ElementName", ""))
            for inst in mv_instances:
                path_str = str(inst.path)
                if path_str in seen_paths:
                    continue
                seen_paths.add(path_str)
                mv_id = _get_instance_id(inst)
                initiator_ids = self._get_masking_view_initiators(inst)
                port_ids = self._get_masking_view_ports(inst)
                results.append(MaskingView(
                    id=mv_id,
                    name=str(inst.get("ElementName", "")),
                    path=path_str,
                    volume_id=vol_id,
                    volume_name=vol_name,
                    initiator_ids=initiator_ids,
                    port_ids=port_ids,
                    system_name=str(inst.get("SystemName", "")),
                ))
        if not results:
            instances = _safe_enumerate(self._conn, "CIM_MaskingView")
            for inst in instances:
                path_str = str(inst.path)
                if path_str in seen_paths:
                    continue
                seen_paths.add(path_str)
                mv_id = _get_instance_id(inst)
                vol_ids = self._get_masking_view_volumes(inst)
                first_vol_id = vol_ids[0] if vol_ids else ""
                initiator_ids = self._get_masking_view_initiators(inst)
                port_ids = self._get_masking_view_ports(inst)
                results.append(MaskingView(
                    id=mv_id,
                    name=str(inst.get("ElementName", "")),
                    path=path_str,
                    volume_id=first_vol_id,
                    volume_name="",
                    initiator_ids=initiator_ids,
                    port_ids=port_ids,
                    system_name=str(inst.get("SystemName", "")),
                ))
        return results

    def _get_volume_instances(self) -> list[pywbem.CIMInstance]:
        if not self._connected or self._conn is None:
            return []
        systems = self.enumerate_storage_systems()
        all_volumes = []
        seen = set()
        for sys_info in systems:
            vol_instances = _safe_associators(
                self._conn,
                sys_info["instance"].path,
                ResultClass="CIM_StorageVolume",
                Role="Antecedent",
            )
            for v in vol_instances:
                key = str(v.path)
                if key not in seen:
                    seen.add(key)
                    all_volumes.append(v)
        if not all_volumes:
            all_volumes = _safe_enumerate(self._conn, "CIM_StorageVolume")
        return all_volumes

    def _get_masking_view_volumes(self, mv_inst: pywbem.CIMInstance) -> list[str]:
        vol_instances = _safe_associators(
            self._conn,
            mv_inst.path,
            ResultClass="CIM_StorageVolume",
        )
        return [_get_instance_id(v) for v in vol_instances]

    def _get_masking_view_initiators(self, mv_inst: pywbem.CIMInstance) -> list[str]:
        init_instances = _safe_associators(
            self._conn,
            mv_inst.path,
            ResultClass="CIM_StorageHardwareID",
        )
        if not init_instances:
            init_instances = _safe_associators(
                self._conn,
                mv_inst.path,
                ResultClass="CIM_InitiatorPort",
            )
        return [_get_instance_id(i) for i in init_instances]

    def _get_masking_view_ports(self, mv_inst: pywbem.CIMInstance) -> list[str]:
        port_instances = _safe_associators(
            self._conn,
            mv_inst.path,
            ResultClass="CIM_TargetPort",
        )
        if not port_instances:
            port_instances = _safe_associators(
                self._conn,
                mv_inst.path,
                ResultClass="CIM_SCSIProtocolController",
            )
        return [_get_instance_id(p) for p in port_instances]

    def build_topology(self) -> tuple[list[TopologyNode], list[TopologyEdge]]:
        if not self._connected or self._conn is None:
            return [], []

        nodes: list[TopologyNode] = []
        edges: list[TopologyEdge] = []
        node_ids = set()

        def add_node(node: TopologyNode) -> None:
            if node.id not in node_ids:
                node_ids.add(node.id)
                nodes.append(node)

        systems = self.enumerate_storage_systems()

        for sys_info in systems:
            sys_id = sys_info["id"]
            add_node(TopologyNode(
                id=sys_id,
                label=sys_info["name"],
                type="system",
                status=sys_info["health_state"],
                properties={
                    "health_state": sys_info["health_state"],
                    "total_size_gb": sys_info["total_size_gb"],
                    "used_size_gb": sys_info["used_size_gb"],
                },
            ))

            pool_instances = _safe_associators(
                self._conn,
                sys_info["instance"].path,
                ResultClass="CIM_StoragePool",
                Role="Antecedent",
            )
            for pool_inst in pool_instances:
                pool_id = _get_instance_id(pool_inst)
                total = pool_inst.get("TotalManagedSpace")
                used = pool_inst.get("UsedSpace")
                total_gb = _bytes_to_gb(total)
                used_gb = _bytes_to_gb(used) if used is not None else 0.0
                free_gb = round(total_gb - used_gb, 2) if total is not None and used is not None else 0.0
                add_node(TopologyNode(
                    id=pool_id,
                    label=str(pool_inst.get("ElementName", "")),
                    type="pool",
                    status=_map_health_state(pool_inst.get("HealthState")),
                    properties={
                        "total_size_gb": total_gb,
                        "used_size_gb": used_gb,
                        "free_size_gb": free_gb,
                        "health_state": _map_health_state(pool_inst.get("HealthState")),
                        "pool_type": _get_pool_type(pool_inst.get("PoolType")),
                    },
                ))
                edges.append(TopologyEdge(source=sys_id, target=pool_id, relation="contains"))

                vol_instances = _safe_associators(
                    self._conn,
                    pool_inst.path,
                    ResultClass="CIM_StorageVolume",
                    Role="Antecedent",
                )
                for vol_inst in vol_instances:
                    vol_id = _get_instance_id(vol_inst)
                    block_size = vol_inst.get("BlockSize")
                    num_blocks = vol_inst.get("NumberOfBlocks")
                    size_bytes = block_size * num_blocks if block_size and num_blocks else None
                    add_node(TopologyNode(
                        id=vol_id,
                        label=str(vol_inst.get("ElementName", "")),
                        type="volume",
                        status=_map_health_state(vol_inst.get("HealthState")),
                        properties={
                            "size_gb": _bytes_to_gb(size_bytes),
                            "volume_type": str(vol_inst.get("Purpose", "")),
                            "health_state": _map_health_state(vol_inst.get("HealthState")),
                        },
                    ))
                    edges.append(TopologyEdge(source=pool_id, target=vol_id, relation="allocates"))

                    mv_instances = _safe_associators(
                        self._conn,
                        vol_inst.path,
                        ResultClass="CIM_MaskingView",
                    )
                    for mv_inst in mv_instances:
                        mv_id = _get_instance_id(mv_inst)
                        add_node(TopologyNode(
                            id=mv_id,
                            label=str(mv_inst.get("ElementName", "")),
                            type="masking_view",
                            status="OK",
                            properties={},
                        ))
                        edges.append(TopologyEdge(source=vol_id, target=mv_id, relation="exposes"))

                        init_instances = _safe_associators(
                            self._conn,
                            mv_inst.path,
                            ResultClass="CIM_StorageHardwareID",
                        )
                        if not init_instances:
                            init_instances = _safe_associators(
                                self._conn,
                                mv_inst.path,
                                ResultClass="CIM_InitiatorPort",
                            )
                        for init_inst in init_instances:
                            init_id = _get_instance_id(init_inst)
                            init_node_id = f"initiator_{init_id}"
                            add_node(TopologyNode(
                                id=init_node_id,
                                label=str(init_inst.get("ElementName", init_id)),
                                type="initiator",
                                status="OK",
                                properties={
                                    "wwn": str(init_inst.get("StorageID", "")),
                                },
                            ))
                            edges.append(TopologyEdge(source=mv_id, target=init_node_id, relation="maps_to"))

                        port_instances = _safe_associators(
                            self._conn,
                            mv_inst.path,
                            ResultClass="CIM_TargetPort",
                        )
                        if not port_instances:
                            port_instances = _safe_associators(
                                self._conn,
                                mv_inst.path,
                                ResultClass="CIM_SCSIProtocolController",
                            )
                        for port_inst in port_instances:
                            port_id = _get_instance_id(port_inst)
                            port_node_id = f"port_{port_id}"
                            add_node(TopologyNode(
                                id=port_node_id,
                                label=str(port_inst.get("ElementName", port_id)),
                                type="port",
                                status="OK",
                                properties={
                                    "wwn": str(port_inst.get("PortID", port_inst.get("Name", ""))),
                                },
                            ))
                            edges.append(TopologyEdge(source=mv_id, target=port_node_id, relation="uses"))

        return nodes, edges

    def simulate_create_lun(
        self,
        pool_id: str,
        name: str,
        size_gb: float,
        purpose: str = "",
    ) -> tuple[bool, str, str, str]:
        if not self._connected or self._conn is None:
            return False, "Not connected", "", ""

        try:
            pool_instances = _safe_enumerate(self._conn, "CIM_StoragePool")
            target_pool = None
            for inst in pool_instances:
                if _get_instance_id(inst) == pool_id:
                    target_pool = inst
                    break

            if target_pool is None:
                return False, f"Pool not found: {pool_id}", "", ""

            size_bytes = int(size_gb * 1024 ** 3)
            block_size = 512
            num_blocks = size_bytes // block_size

            vol_id = f"SIMULATED_VOL_{uuid.uuid4().hex[:8]}"
            vol_name = name or f"Vol_{uuid.uuid4().hex[:6]}"

            self._cache.setdefault("simulated_volumes", []).append({
                "id": vol_id,
                "name": vol_name,
                "pool_id": pool_id,
                "size_gb": size_gb,
                "size_bytes": size_bytes,
                "block_size": block_size,
                "num_blocks": num_blocks,
                "purpose": purpose,
                "health_state": "OK",
                "system_name": str(target_pool.get("SystemName", "")),
                "created_at": datetime.now().isoformat(),
                "simulated": True,
            })

            return True, f"LUN '{vol_name}' created successfully ({size_gb} GB)", vol_id, vol_name

        except Exception as e:
            return False, str(e), "", ""

    def simulate_create_masking_view(
        self,
        volume_id: str,
        view_name: str,
        initiator_wwns: list[str] = [],
        port_wwns: list[str] = [],
    ) -> tuple[bool, str, str, str]:
        if not self._connected or self._conn is None:
            return False, "Not connected", "", ""

        try:
            vol_found = False
            vol_name = ""
            vol_instances = _safe_enumerate(self._conn, "CIM_StorageVolume")
            for inst in vol_instances:
                if _get_instance_id(inst) == volume_id:
                    vol_found = True
                    vol_name = str(inst.get("ElementName", ""))
                    break

            if not vol_found:
                sim_vols = self._cache.get("simulated_volumes", [])
                for sv in sim_vols:
                    if sv["id"] == volume_id:
                        vol_found = True
                        vol_name = sv["name"]
                        break

            if not vol_found:
                return False, f"Volume not found: {volume_id}", "", ""

            mv_id = f"SIMULATED_MV_{uuid.uuid4().hex[:8]}"
            mv_name = view_name or f"MV_{uuid.uuid4().hex[:6]}"

            self._cache.setdefault("simulated_masking_views", []).append({
                "id": mv_id,
                "name": mv_name,
                "volume_id": volume_id,
                "volume_name": vol_name,
                "initiator_ids": initiator_wwns,
                "port_ids": port_wwns,
                "system_name": "",
                "created_at": datetime.now().isoformat(),
                "simulated": True,
            })

            return True, f"Masking view '{mv_name}' created successfully", mv_id, mv_name

        except Exception as e:
            return False, str(e), "", ""

    def get_simulated_volumes(self) -> list[StorageVolume]:
        sim_vols = self._cache.get("simulated_volumes", [])
        return [
            StorageVolume(
                id=sv["id"],
                name=sv["name"],
                path="",
                size_gb=sv["size_gb"],
                volume_type=sv.get("purpose", ""),
                pool_id=sv["pool_id"],
                health_state="OK",
                system_name=sv.get("system_name", ""),
            )
            for sv in sim_vols
        ]

    def get_simulated_masking_views(self) -> list[MaskingView]:
        sim_mvs = self._cache.get("simulated_masking_views", [])
        return [
            MaskingView(
                id=smv["id"],
                name=smv["name"],
                path="",
                volume_id=smv["volume_id"],
                volume_name=smv["volume_name"],
                initiator_ids=smv.get("initiator_ids", []),
                port_ids=smv.get("port_ids", []),
                system_name=smv.get("system_name", ""),
            )
            for smv in sim_mvs
        ]

    def export_xml(self) -> str:
        root = ET.Element("StorageConfiguration")
        root.set("exportedAt", datetime.now().isoformat())
        root.set("namespace", self._conn.default_namespace if self._conn else "root/SMI-S")

        provider_elem = ET.SubElement(root, "ProviderInfo")
        provider_elem.set("product", self._provider_info.product)
        provider_elem.set("version", self._provider_info.version)
        provider_elem.set("vendor", self._provider_info.vendor)

        systems = self.enumerate_storage_systems()
        for sys_info in systems:
            sys_elem = ET.SubElement(root, "StorageSystem")
            sys_elem.set("id", sys_info["id"])
            sys_elem.set("name", sys_info["name"])
            sys_elem.set("healthState", sys_info["health_state"])
            sys_elem.set("totalSizeGB", str(sys_info["total_size_gb"]))
            sys_elem.set("usedSizeGB", str(sys_info["used_size_gb"]))

            pools = self.enumerate_storage_pools()
            for pool in pools:
                if pool.system_name != sys_info["name"]:
                    continue
                pool_elem = ET.SubElement(sys_elem, "StoragePool")
                pool_elem.set("id", pool.id)
                pool_elem.set("name", pool.name)
                pool_elem.set("type", pool.pool_type)
                pool_elem.set("healthState", pool.health_state)
                pool_elem.set("totalSizeGB", str(pool.total_size_gb))
                pool_elem.set("usedSizeGB", str(pool.used_size_gb))
                pool_elem.set("freeSizeGB", str(pool.free_size_gb))

                volumes = self.enumerate_storage_volumes()
                for vol in volumes:
                    if vol.pool_id != pool.id:
                        continue
                    vol_elem = ET.SubElement(pool_elem, "StorageVolume")
                    vol_elem.set("id", vol.id)
                    vol_elem.set("name", vol.name)
                    vol_elem.set("sizeGB", str(vol.size_gb))
                    vol_elem.set("type", vol.volume_type)
                    vol_elem.set("healthState", vol.health_state)

                    views = self.enumerate_masking_views()
                    for mv in views:
                        if mv.volume_id != vol.id:
                            continue
                        mv_elem = ET.SubElement(vol_elem, "MaskingView")
                        mv_elem.set("id", mv.id)
                        mv_elem.set("name", mv.name)
                        for init_id in mv.initiator_ids:
                            init_elem = ET.SubElement(mv_elem, "Initiator")
                            init_elem.set("id", init_id)
                        for port_id in mv.port_ids:
                            port_elem = ET.SubElement(mv_elem, "TargetPort")
                            port_elem.set("id", port_id)

        sim_vols = self._cache.get("simulated_volumes", [])
        if sim_vols:
            sim_elem = ET.SubElement(root, "SimulatedOperations")
            sv_list_elem = ET.SubElement(sim_elem, "CreatedVolumes")
            for sv in sim_vols:
                sv_elem = ET.SubElement(sv_list_elem, "Volume")
                sv_elem.set("id", sv["id"])
                sv_elem.set("name", sv["name"])
                sv_elem.set("sizeGB", str(sv["size_gb"]))
                sv_elem.set("poolId", sv["pool_id"])
                sv_elem.set("createdAt", sv["created_at"])

        sim_mvs = self._cache.get("simulated_masking_views", [])
        if sim_mvs:
            if sim_vols is None:
                sim_elem = ET.SubElement(root, "SimulatedOperations")
            smv_list_elem = ET.SubElement(sim_elem, "CreatedMaskingViews")
            for smv in sim_mvs:
                smv_elem = ET.SubElement(smv_list_elem, "MaskingView")
                smv_elem.set("id", smv["id"])
                smv_elem.set("name", smv["name"])
                smv_elem.set("volumeId", smv["volume_id"])
                smv_elem.set("createdAt", smv["created_at"])
                for iwwn in smv.get("initiator_ids", []):
                    iw_elem = ET.SubElement(smv_elem, "InitiatorWWN")
                    iw_elem.text = iwwn
                for pwwn in smv.get("port_ids", []):
                    pw_elem = ET.SubElement(smv_elem, "PortWWN")
                    pw_elem.text = pwwn

        ET.indent(root, space="  ")
        return ET.tostring(root, encoding="unicode", xml_declaration=True)
