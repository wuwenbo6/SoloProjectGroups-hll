import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Slider,
  IconButton,
  Box,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Lightbulb,
  LightbulbOutlined,
  SettingsBrightness,
} from '@mui/icons-material';

function DeviceCard({ device, onControl }) {
  const [brightness, setBrightness] = useState(device.brightness);
  const [colorTemp, setColorTemp] = useState(device.colorTemperature);
  const [isEditing, setIsEditing] = useState(false);

  const getColorTemperatureToRGB = (kelvin) => {
    const temp = kelvin / 100;
    let red, green, blue;

    if (temp <= 66) {
      red = 255;
      green = temp;
      if (temp <= 19) {
        green = 0;
      } else {
        green = temp - 10;
        green = 99.4708025861 * Math.log(green) - 161.1195681661;
      }
    } else {
      red = temp - 60;
      red = 329.698727446 * Math.pow(red, -0.1332047592);
      green = temp - 60;
      green = 288.1221695283 * Math.pow(green, -0.0755148492);
    }

    if (temp >= 66) {
      blue = 255;
    } else if (temp <= 19) {
      blue = 0;
    } else {
      blue = temp - 10;
      blue = 138.5177312231 * Math.log(blue) - 305.0447927307;
    }

    return {
      r: Math.min(255, Math.max(0, red)),
      g: Math.min(255, Math.max(0, green)),
      b: Math.min(255, Math.max(0, blue)),
    };
  };

  const rgb = getColorTemperatureToRGB(device.colorTemperature);
  const brightnessFactor = device.brightness / 100;

  const bulbColor = device.online
    ? `rgba(${rgb.r * brightnessFactor}, ${rgb.g * brightnessFactor}, ${
        rgb.b * brightnessFactor
      }, 1)`
    : '#666';

  const handleBrightnessChange = (event, newValue) => {
    setBrightness(newValue);
  };

  const handleColorTempChange = (event, newValue) => {
    setColorTemp(newValue);
  };

  const handleControl = () => {
    onControl(device.id, {
      brightness,
      colorTemperature: colorTemp,
    });
    setIsEditing(false);
  };

  return (
    <Card
      sx={{
        minWidth: 140,
        transition: 'all 0.3s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 6,
        },
        backgroundColor: device.online ? 'background.paper' : 'action.disabledBackground',
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}
        onClick={() => setIsEditing(!isEditing)}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Tooltip title={device.online ? '在线' : '离线'}>
            <IconButton size="small" disabled={!device.online}>
              {device.online ? (
                <Lightbulb sx={{ color: bulbColor, fontSize: 32 }} />
              ) : (
                <LightbulbOutlined sx={{ color: '#666', fontSize: 32 }} />
              )}
            </IconButton>
          </Tooltip>
          <Chip
            label={device.area}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem' }}
          />
        </Box>

        <Typography variant="body2" gutterBottom noWrap>
          {device.name}
        </Typography>

        <Box display="flex" alignItems="center" gap={1}>
          <SettingsBrightness fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary">
            {device.brightness}%
          </Typography>
        </Box>

        {isEditing && device.online && (
          <Box mt={2}>
            <Typography variant="caption" gutterBottom>
              亮度
            </Typography>
            <Slider
              value={brightness}
              onChange={handleBrightnessChange}
              min={0}
              max={100}
              size="small"
            />
            <Typography variant="caption" gutterBottom>
              色温
            </Typography>
            <Slider
              value={colorTemp}
              onChange={handleColorTempChange}
              min={2700}
              max={6500}
              step={100}
              size="small"
            />
            <Box mt={1} display="flex" justifyContent="flex-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleControl();
                }}
              >
                应用
              </button>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default DeviceCard;
