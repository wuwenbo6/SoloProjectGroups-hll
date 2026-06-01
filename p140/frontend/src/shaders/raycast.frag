precision highp float;
precision highp sampler3D;

uniform sampler3D uVolumeData;
uniform vec3 uVolumeDimensions;
uniform vec3 uVolumeSpacing;
uniform float uWindowWidth;
uniform float uWindowLevel;
uniform float uOpacityThreshold;
uniform float uSampleDistance;
uniform int uRenderMode;
uniform vec3 uClipPlaneX;
uniform vec3 uClipPlaneY;
uniform vec3 uClipPlaneZ;
uniform bool uClipXEnabled;
uniform bool uClipYEnabled;
uniform bool uClipZEnabled;

uniform vec3 uCameraPosition;
uniform mat4 uInverseModelMatrix;

varying vec3 vWorldPosition;
varying vec3 vLocalPosition;

vec2 intersectBox(vec3 rayOrigin, vec3 rayDir, vec3 boxMin, vec3 boxMax) {
  vec3 invDir = 1.0 / rayDir;
  vec3 tMin = (boxMin - rayOrigin) * invDir;
  vec3 tMax = (boxMax - rayOrigin) * invDir;
  vec3 t1 = min(tMin, tMax);
  vec3 t2 = max(tMin, tMax);
  float tNear = max(max(t1.x, t1.y), t1.z);
  float tFar = min(min(t2.x, t2.y), t2.z);
  return vec2(tNear, tFar);
}

float getNormalizedValue(float rawValue) {
  float minVal = uWindowLevel - uWindowWidth / 2.0;
  float maxVal = uWindowLevel + uWindowWidth / 2.0;
  return clamp((rawValue - minVal) / (maxVal - minVal), 0.0, 1.0);
}

float sampleVolume(vec3 position) {
  vec3 texCoord = position / uVolumeDimensions + 0.5;
  texCoord = clamp(texCoord, 0.001, 0.999);
  
  float rawValue = texture(uVolumeData, texCoord).r;
  return rawValue;
}

float sampleVolumeTrilinear(vec3 position) {
  vec3 texCoord = position / uVolumeDimensions + 0.5;
  texCoord = clamp(texCoord, 0.001, 0.999);
  
  vec3 voxel = texCoord * (uVolumeDimensions - 1.0);
  vec3 base = floor(voxel);
  vec3 frac = voxel - base;
  
  vec3 uv000 = (base + vec3(0.0)) / uVolumeDimensions;
  vec3 uv100 = (base + vec3(1.0, 0.0, 0.0)) / uVolumeDimensions;
  vec3 uv010 = (base + vec3(0.0, 1.0, 0.0)) / uVolumeDimensions;
  vec3 uv110 = (base + vec3(1.0, 1.0, 0.0)) / uVolumeDimensions;
  vec3 uv001 = (base + vec3(0.0, 0.0, 1.0)) / uVolumeDimensions;
  vec3 uv101 = (base + vec3(1.0, 0.0, 1.0)) / uVolumeDimensions;
  vec3 uv011 = (base + vec3(0.0, 1.0, 1.0)) / uVolumeDimensions;
  vec3 uv111 = (base + vec3(1.0)) / uVolumeDimensions;
  
  float v000 = texture(uVolumeData, uv000).r;
  float v100 = texture(uVolumeData, uv100).r;
  float v010 = texture(uVolumeData, uv010).r;
  float v110 = texture(uVolumeData, uv110).r;
  float v001 = texture(uVolumeData, uv001).r;
  float v101 = texture(uVolumeData, uv101).r;
  float v011 = texture(uVolumeData, uv011).r;
  float v111 = texture(uVolumeData, uv111).r;
  
  float x00 = mix(v000, v100, frac.x);
  float x10 = mix(v010, v110, frac.x);
  float x01 = mix(v001, v101, frac.x);
  float x11 = mix(v011, v111, frac.x);
  
  float y0 = mix(x00, x10, frac.y);
  float y1 = mix(x01, x11, frac.y);
  
  float value = mix(y0, y1, frac.z);
  return value;
}

vec4 applyColorTransferFunction(float normalizedValue) {
  float gray = normalizedValue;
  
  float opacity = 0.0;
  if (normalizedValue > uOpacityThreshold) {
    opacity = (normalizedValue - uOpacityThreshold) / (1.0 - uOpacityThreshold);
    opacity = pow(opacity, 1.5) * 0.15;
  }
  
  return vec4(gray, gray, gray, opacity);
}

bool isClipped(vec3 position) {
  if (uClipXEnabled) {
    vec3 planeNormal = vec3(1.0, 0.0, 0.0);
    float signedDist = dot(position - uClipPlaneX, planeNormal);
    if (signedDist > 0.0) return true;
  }
  if (uClipYEnabled) {
    vec3 planeNormal = vec3(0.0, 1.0, 0.0);
    float signedDist = dot(position - uClipPlaneY, planeNormal);
    if (signedDist > 0.0) return true;
  }
  if (uClipZEnabled) {
    vec3 planeNormal = vec3(0.0, 0.0, 1.0);
    float signedDist = dot(position - uClipPlaneZ, planeNormal);
    if (signedDist > 0.0) return true;
  }
  return false;
}

vec4 compositeMIP(vec3 rayOrigin, vec3 rayDir, float tNear, float tFar) {
  float maxValue = 0.0;
  float stepSize = uSampleDistance * 0.5;
  int maxSteps = int((tFar - tNear) / stepSize);
  maxSteps = min(maxSteps, 512);
  
  for (int i = 0; i < 512; i++) {
    if (i >= maxSteps) break;
    
    float t = tNear + float(i) * stepSize;
    vec3 pos = rayOrigin + rayDir * t;
    
    if (isClipped(pos)) continue;
    
    float value = sampleVolumeTrilinear(pos);
    float normalized = getNormalizedValue(value);
    maxValue = max(maxValue, normalized);
  }
  
  return vec4(maxValue, maxValue, maxValue, 1.0);
}

vec4 compositeVR(vec3 rayOrigin, vec3 rayDir, float tNear, float tFar) {
  vec3 resultColor = vec3(0.0);
  float resultOpacity = 0.0;
  
  float stepSize = uSampleDistance * 0.5;
  int maxSteps = int((tFar - tNear) / stepSize);
  maxSteps = min(maxSteps, 256);
  
  for (int i = 0; i < 256; i++) {
    if (i >= maxSteps) break;
    if (resultOpacity >= 0.95) break;
    
    float t = tNear + float(i) * stepSize;
    vec3 pos = rayOrigin + rayDir * t;
    
    if (isClipped(pos)) continue;
    
    float value = sampleVolumeTrilinear(pos);
    float normalized = getNormalizedValue(value);
    vec4 color = applyColorTransferFunction(normalized);
    
    resultColor = resultColor + color.rgb * color.a * (1.0 - resultOpacity);
    resultOpacity = resultOpacity + color.a * (1.0 - resultOpacity);
  }
  
  return vec4(resultColor, resultOpacity);
}

void main() {
  vec3 localCamPos = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz;
  vec3 rayDir = normalize(vLocalPosition - localCamPos);
  vec3 rayOrigin = localCamPos;
  
  vec3 boxMin = -uVolumeDimensions * 0.5;
  vec3 boxMax = uVolumeDimensions * 0.5;
  
  vec2 t = intersectBox(rayOrigin, rayDir, boxMin, boxMax);
  
  if (t.x > t.y) {
    discard;
  }
  
  t.x = max(t.x, 0.0);
  
  vec4 finalColor;
  
  if (uRenderMode == 0) {
    finalColor = compositeMIP(rayOrigin, rayDir, t.x, t.y);
  } else {
    finalColor = compositeVR(rayOrigin, rayDir, t.x, t.y);
  }
  
  if (finalColor.a < 0.01) {
    discard;
  }
  
  gl_FragColor = finalColor;
}