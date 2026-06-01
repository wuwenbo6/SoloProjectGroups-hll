import os
import uuid
import json
import zipfile
import shutil
from datetime import datetime
from typing import List, Dict
import numpy as np


def create_bcf_report(model_name: str, collisions: List[Dict],
                      elements: List[Dict] = None,
                      author: str = 'IFC Viewer',
                      output_dir: str = None) -> str:

    if output_dir is None:
        output_dir = os.path.dirname(os.path.abspath(__file__))

    bcf_guid = str(uuid.uuid4())
    timestamp = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

    bcf_dir = os.path.join(output_dir, f'bcf_{bcf_guid}')
    os.makedirs(bcf_dir, exist_ok=True)

    _create_project_xml(bcf_dir, bcf_guid, model_name)

    topic_guids = []
    for idx, collision in enumerate(collisions):
        topic_guid = str(uuid.uuid4())
        topic_guids.append(topic_guid)

        topic_dir = os.path.join(bcf_dir, topic_guid)
        os.makedirs(topic_dir, exist_ok=True)

        _create_markup_xml(topic_dir, topic_guid, collision, idx + 1, author, timestamp, model_name, elements)
        _create_viewpoint_xml(topic_dir, collision, elements)
        _create_snapshot(topic_dir)

    _create_bcf_version_xml(bcf_dir)

    bcf_filename = f'{model_name.replace(" ", "_")}_collisions.bcf'
    bcf_path = os.path.join(output_dir, bcf_filename)

    with zipfile.ZipFile(bcf_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(bcf_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, bcf_dir)
                zf.write(file_path, arcname)

    shutil.rmtree(bcf_dir)

    return bcf_path


def _create_project_xml(bcf_dir: str, guid: str, model_name: str):
    content = f'''<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.buildingsmart.org/xml/ns/bcf/2.0">
  <ProjectId>{guid}</ProjectId>
  <Name>{model_name} - 碰撞检测报告</Name>
  <ExtensionSchema />
</Project>'''
    with open(os.path.join(bcf_dir, 'project.bcfp'), 'w', encoding='utf-8') as f:
        f.write(content)


def _create_markup_xml(topic_dir: str, guid: str, collision: Dict,
                       index: int, author: str, timestamp: str,
                       model_name: str, elements: List[Dict] = None):

    elem_a = collision['element_a']
    elem_b = collision['element_b']

    priority_map = {
        'mesh': 'Critical',
        'obb': 'Major',
        'aabb': 'Minor',
    }
    priority = priority_map.get(collision.get('level', 'aabb'), 'Minor')

    ifc_types = [elem_a.get('ifc_type', ''), elem_b.get('ifc_type', '')]
    if 'IfcPipe' in ''.join(ifc_types) or 'IfcDuct' in ''.join(ifc_types):
        topic_type = 'Coordination'
    else:
        topic_type = 'Clash'

    description_parts = []
    description_parts.append(f'碰撞 #{index}: {elem_a.get("name", elem_a.get("ifc_id"))} 与 {elem_b.get("name", elem_b.get("ifc_id"))}')
    description_parts.append(f'')
    description_parts.append(f'构件 A:')
    description_parts.append(f'  - IFC ID: {elem_a.get("ifc_id")}')
    description_parts.append(f'  - 类型: {elem_a.get("ifc_type")}')
    description_parts.append(f'  - 名称: {elem_a.get("name")}')
    description_parts.append(f'')
    description_parts.append(f'构件 B:')
    description_parts.append(f'  - IFC ID: {elem_b.get("ifc_id")}')
    description_parts.append(f'  - 类型: {elem_b.get("ifc_type")}')
    description_parts.append(f'  - 名称: {elem_b.get("name")}')
    description_parts.append(f'')
    description_parts.append(f'检测详情:')
    description_parts.append(f'  - 检测级别: {collision.get("level", "aabb")}')
    description_parts.append(f'  - AABB 相交: {collision.get("aabb_intersect", True)}')
    if collision.get('obb_intersect') is not None:
        description_parts.append(f'  - OBB 相交: {collision["obb_intersect"]}')
    if collision.get('mesh_intersect') is not None:
        description_parts.append(f'  - 三角面相交: {collision["mesh_intersect"]}')
    if collision.get('intersection_count'):
        description_parts.append(f'  - 相交三角面数: {collision["intersection_count"]}')

    description = '\n'.join(description_parts)

    content = f'''<?xml version="1.0" encoding="UTF-8"?>
<Markup xmlns="http://schemas.buildingsmart.org/xml/ns/bcf/2.0">
  <Topic Guid="{guid}" TopicType="{topic_type}" Status="Open">
    <Title>碰撞 #{index}: {elem_a.get("ifc_type")} vs {elem_b.get("ifc_type")}</Title>
    <Priority>{priority}</Priority>
    <Index>{index}</Index>
    <Labels>
      <Label>碰撞检测</Label>
      <Label>{elem_a.get("ifc_type", "")}</Label>
      <Label>{elem_b.get("ifc_type", "")}</Label>
    </Labels>
    <CreationDate>{timestamp}</CreationDate>
    <CreationAuthor>{author}</CreationAuthor>
    <ModifiedDate>{timestamp}</ModifiedDate>
    <ModifiedAuthor>{author}</ModifiedAuthor>
    <Description>{_xml_escape(description)}</Description>
    <BimSnippet SnippetType="JSON">
      <Reference>model_data.json</Reference>
      <ReferenceSchema />
      <IsExternal>false</IsExternal>
    </BimSnippet>
    <RelatedTopics />
    <DocumentReferences />
  </Topic>
  <Comment Guid="{str(uuid.uuid4())}">
    <Date>{timestamp}</Date>
    <Author>{author}</Author>
    <Comment>自动检测生成的碰撞报告</Comment>
    <Topic Guid="{guid}" />
    <Viewpoint Guid="{str(uuid.uuid4())}" />
  </Comment>
  <Viewpoints>
    <Viewpoint Guid="{str(uuid.uuid4())}">
      <Viewpoint>viewpoint.bcfv</Viewpoint>
      <Snapshot>snapshot.png</Snapshot>
      <Index>0</Index>
    </Viewpoint>
  </Viewpoints>
</Markup>'''

    with open(os.path.join(topic_dir, 'markup.bcf'), 'w', encoding='utf-8') as f:
        f.write(content)


def _create_viewpoint_xml(topic_dir: str, collision: Dict, elements: List[Dict] = None):
    elem_a = collision['element_a']
    elem_b = collision['element_b']

    camera_pos = np.array([10.0, 10.0, 10.0])
    camera_dir = np.array([-1.0, -1.0, -1.0])
    camera_up = np.array([0.0, 0.0, 1.0])

    if elements:
        elem_a_data = next((e for e in elements if e.get('id') == elem_a.get('id')), None)
        elem_b_data = next((e for e in elements if e.get('id') == elem_b.get('id')), None)

        if elem_a_data and elem_a_data.get('aabb_min') and elem_a_data.get('aabb_max'):
            aabb_min_a = np.array([float(x) for x in elem_a_data['aabb_min'].split(',')])
            aabb_max_a = np.array([float(x) for x in elem_a_data['aabb_max'].split(',')])
            center_a = (aabb_min_a + aabb_max_a) / 2
        else:
            center_a = np.array([0, 0, 0])

        if elem_b_data and elem_b_data.get('aabb_min') and elem_b_data.get('aabb_max'):
            aabb_min_b = np.array([float(x) for x in elem_b_data['aabb_min'].split(',')])
            aabb_max_b = np.array([float(x) for x in elem_b_data['aabb_max'].split(',')])
            center_b = (aabb_min_b + aabb_max_b) / 2
        else:
            center_b = np.array([0, 0, 0])

        collision_center = (center_a + center_b) / 2
        camera_pos = collision_center + np.array([5.0, 5.0, 5.0])
        camera_dir = collision_center - camera_pos
        camera_dir = camera_dir / np.linalg.norm(camera_dir)

    guid = str(uuid.uuid4())
    content = f'''<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" Guid="{guid}" xmlns="http://schemas.buildingsmart.org/xml/ns/bcf/2.0">
  <Components>
    <Selection>
      <Component IfcGuid="{elem_a.get('ifc_id', '')}" />
      <Component IfcGuid="{elem_b.get('ifc_id', '')}" />
    </Selection>
    <Visibility>
      <DefaultVisibility>true</DefaultVisibility>
      <Exceptions />
    </Visibility>
  </Components>
  <PerspectiveCamera>
    <CameraViewPoint>
      <X>{camera_pos[0]:.6f}</X>
      <Y>{camera_pos[1]:.6f}</Y>
      <Z>{camera_pos[2]:.6f}</Z>
    </CameraViewPoint>
    <CameraDirection>
      <X>{camera_dir[0]:.6f}</X>
      <Y>{camera_dir[1]:.6f}</Y>
      <Z>{camera_dir[2]:.6f}</Z>
    </CameraDirection>
    <CameraUpVector>
      <X>{camera_up[0]:.6f}</X>
      <Y>{camera_up[1]:.6f}</Y>
      <Z>{camera_up[2]:.6f}</Z>
    </CameraUpVector>
    <FieldOfView>60.0</FieldOfView>
  </PerspectiveCamera>
  <Lines />
  <ClippingPlanes />
  <Bitmaps />
</VisualizationInfo>'''

    with open(os.path.join(topic_dir, 'viewpoint.bcfv'), 'w', encoding='utf-8') as f:
        f.write(content)


def _create_snapshot(topic_dir: str):
    png_header = bytes([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x64, 0x60, 0x60, 0x60,
        0x00, 0x00, 0x00, 0x05, 0x00, 0x01, 0x5D, 0x35,
        0xDF, 0xDB, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
        0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ])
    with open(os.path.join(topic_dir, 'snapshot.png'), 'wb') as f:
        f.write(png_header)


def _create_bcf_version_xml(bcf_dir: str):
    content = '''<?xml version="1.0" encoding="UTF-8"?>
<Version xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xsi:noNamespaceSchemaLocation="version.xsd">
  <VersionId>2.1</VersionId>
  <DetailedVersion>2.1</DetailedVersion>
</Version>'''
    with open(os.path.join(bcf_dir, 'bcf.version'), 'w', encoding='utf-8') as f:
        f.write(content)


def _xml_escape(text: str) -> str:
    escapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
    }
    for char, escape in escapes.items():
        text = text.replace(char, escape)
    return text
