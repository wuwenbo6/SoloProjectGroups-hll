import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { calculateArea, calculateVolume, exportRtstruct } from '../utils/api';
import type { RoiPoint, RoiContour } from '../types/dicom';

export const useMeasurement = () => {
  const { series, rois, updateRoi, setError, setLoading } = useAppStore();

  const computeArea = useCallback(
    async (points: RoiPoint[]): Promise<number> => {
      if (!series || points.length < 3) return 0;

      try {
        const result = await calculateArea(points, series.pixelSpacing);
        return result.areaMm2;
      } catch (err) {
        console.error('Failed to calculate area:', err);
        return 0;
      }
    },
    [series]
  );

  const computeVolume = useCallback(
    async (contours: RoiContour[]): Promise<number> => {
      if (!series || contours.length < 1) return 0;

      try {
        const result = await calculateVolume(
          contours,
          series.pixelSpacing,
          series.sliceThickness
        );
        return result.volumeMm3;
      } catch (err) {
        console.error('Failed to calculate volume:', err);
        return 0;
      }
    },
    [series]
  );

  const updateRoiMeasurements = useCallback(
    async (roiId: string) => {
      const roi = rois.find((r) => r.id === roiId);
      if (!roi || !series) return;

      try {
        const totalArea = await Promise.all(
          roi.contours.map(async (contour) => {
            if (contour.points.length >= 3) {
              const area = await computeArea(contour.points);
              return area;
            }
            return 0;
          })
        );

        const sumArea = totalArea.reduce((a, b) => a + b, 0);
        const volume = await computeVolume(roi.contours);

        updateRoi(roiId, {
          areaMm2: sumArea,
          volumeMm3: volume,
        });
      } catch (err) {
        console.error('Failed to update ROI measurements:', err);
      }
    },
    [rois, series, computeArea, computeVolume, updateRoi]
  );

  const updateAllMeasurements = useCallback(async () => {
    for (const roi of rois) {
      await updateRoiMeasurements(roi.id);
    }
  }, [rois, updateRoiMeasurements]);

  const exportToRtstruct = useCallback(async (): Promise<string | null> => {
    if (!series || rois.length === 0) {
      setError('No series or ROIs to export');
      return null;
    }

    setLoading(true);
    try {
      let outputPath: string | null = null;
      if (window.electronAPI) {
        outputPath = await window.electronAPI.selectExportPath();
      }

      if (!outputPath) {
        outputPath = `RTSTRUCT_${Date.now()}.dcm`;
      }

      const roisWithMeasurements = await Promise.all(
        rois.map(async (roi) => {
          if (roi.areaMm2 === undefined || roi.volumeMm3 === undefined) {
            const totalArea = await Promise.all(
              roi.contours.map(async (contour) => {
                if (contour.points.length >= 3) {
                  return computeArea(contour.points);
                }
                return 0;
              })
            );
            const sumArea = totalArea.reduce((a, b) => a + b, 0);
            const volume = await computeVolume(roi.contours);
            return { ...roi, areaMm2: sumArea, volumeMm3: volume };
          }
          return roi;
        })
      );

      const result = await exportRtstruct(
        series,
        roisWithMeasurements,
        outputPath
      );

      if (result.success) {
        return result.filePath;
      } else {
        setError(result.error || 'Failed to export RTSTRUCT');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export');
      return null;
    } finally {
      setLoading(false);
    }
  }, [series, rois, computeArea, computeVolume, setError, setLoading]);

  return {
    computeArea,
    computeVolume,
    updateRoiMeasurements,
    updateAllMeasurements,
    exportToRtstruct,
  };
};
