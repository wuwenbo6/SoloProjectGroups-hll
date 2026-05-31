import csv
import io
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from .database import PassengerCount, ProbeData


class ReportExporter:
    @staticmethod
    def export_passenger_count_csv(
        db: Session,
        zone: str = None,
        start_time: datetime = None,
        end_time: datetime = None
    ) -> str:
        if not start_time:
            start_time = datetime.utcnow() - timedelta(hours=24)
        if not end_time:
            end_time = datetime.utcnow()

        query = db.query(PassengerCount).filter(
            PassengerCount.timestamp >= start_time,
            PassengerCount.timestamp <= end_time
        )

        if zone:
            query = query.filter(PassengerCount.zone == zone)

        records = query.order_by(PassengerCount.timestamp).all()

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            '区域', '时间', '原始设备数', '调整后设备数',
            '估算人数', '置信下限', '置信上限', '置信度',
            '探针总数', '随机MAC比例', '是否节假日', '节假日类型'
        ])

        for r in records:
            writer.writerow([
                r.zone,
                r.timestamp.isoformat(),
                r.raw_count,
                r.adjusted_count or '',
                r.estimated_count,
                r.lower_bound,
                r.upper_bound,
                r.confidence,
                r.total_probes or '',
                r.random_mac_ratio or '',
                r.is_holiday or 0,
                r.holiday_type or ''
            ])

        return output.getvalue()

    @staticmethod
    def export_hourly_summary_csv(
        db: Session,
        zone: str = None,
        start_time: datetime = None,
        end_time: datetime = None
    ) -> str:
        if not start_time:
            start_time = datetime.utcnow() - timedelta(hours=24)
        if not end_time:
            end_time = datetime.utcnow()

        query = db.query(PassengerCount).filter(
            PassengerCount.timestamp >= start_time,
            PassengerCount.timestamp <= end_time
        )

        if zone:
            query = query.filter(PassengerCount.zone == zone)

        records = query.order_by(PassengerCount.timestamp).all()

        hourly_data: Dict[str, List[float]] = {}
        for r in records:
            hour_key = r.timestamp.strftime('%Y-%m-%d %H:00')
            if hour_key not in hourly_data:
                hourly_data[hour_key] = []
            hourly_data[hour_key].append(r.estimated_count)

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            '小时', '平均人数', '最高人数', '最低人数', '样本数'
        ])

        for hour_key in sorted(hourly_data.keys()):
            values = hourly_data[hour_key]
            writer.writerow([
                hour_key,
                round(sum(values) / len(values), 1),
                round(max(values), 1),
                round(min(values), 1),
                len(values)
            ])

        return output.getvalue()

    @staticmethod
    def generate_daily_report(
        db: Session,
        report_date: datetime = None
    ) -> Dict:
        if not report_date:
            report_date = datetime.utcnow()

        start_time = report_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(days=1)

        query = db.query(PassengerCount).filter(
            PassengerCount.timestamp >= start_time,
            PassengerCount.timestamp < end_time
        )
        records = query.all()

        if not records:
            return {
                'date': report_date.strftime('%Y-%m-%d'),
                'total_records': 0,
                'message': '无数据'
            }

        zones = set(r.zone for r in records)
        zone_reports = {}

        for zone in zones:
            zone_records = [r for r in records if r.zone == zone]
            counts = [r.estimated_count for r in zone_records]

            peak_hour = 0
            peak_count = 0
            hourly_counts: Dict[int, List[float]] = {}
            for r in zone_records:
                hour = r.timestamp.hour
                if hour not in hourly_counts:
                    hourly_counts[hour] = []
                hourly_counts[hour].append(r.estimated_count)

            for hour, values in hourly_counts.items():
                avg = sum(values) / len(values)
                if avg > peak_count:
                    peak_count = avg
                    peak_hour = hour

            zone_reports[zone] = {
                'avg_count': round(sum(counts) / len(counts), 1),
                'max_count': round(max(counts), 1),
                'min_count': round(min(counts), 1),
                'peak_hour': peak_hour,
                'peak_count': round(peak_count, 1),
                'total_samples': len(zone_records)
            }

        all_counts = [r.estimated_count for r in records]

        return {
            'date': report_date.strftime('%Y-%m-%d'),
            'total_records': len(records),
            'zones': list(zones),
            'overall_avg': round(sum(all_counts) / len(all_counts), 1),
            'overall_max': round(max(all_counts), 1),
            'overall_min': round(min(all_counts), 1),
            'zone_reports': zone_reports,
            'generated_at': datetime.utcnow().isoformat()
        }

    @staticmethod
    def export_probe_data_csv(
        db: Session,
        zone: str = None,
        start_time: datetime = None,
        end_time: datetime = None,
        limit: int = 10000
    ) -> str:
        if not start_time:
            start_time = datetime.utcnow() - timedelta(hours=1)
        if not end_time:
            end_time = datetime.utcnow()

        query = db.query(ProbeData).filter(
            ProbeData.timestamp >= start_time,
            ProbeData.timestamp <= end_time
        )

        if zone:
            query = query.filter(ProbeData.zone == zone)

        records = query.order_by(ProbeData.timestamp.desc()).limit(limit).all()

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            'MAC地址', 'RSSI', 'AP设备', '区域', '时间'
        ])

        for r in records:
            writer.writerow([
                r.mac_address,
                r.rssi,
                r.ap_id,
                r.zone,
                r.timestamp.isoformat()
            ])

        return output.getvalue()

    @staticmethod
    def get_report_summary(
        db: Session,
        start_time: datetime = None,
        end_time: datetime = None
    ) -> Dict:
        if not start_time:
            start_time = datetime.utcnow() - timedelta(hours=24)
        if not end_time:
            end_time = datetime.utcnow()

        records = db.query(PassengerCount).filter(
            PassengerCount.timestamp >= start_time,
            PassengerCount.timestamp <= end_time
        ).all()

        probe_count = db.query(ProbeData).filter(
            ProbeData.timestamp >= start_time,
            ProbeData.timestamp <= end_time
        ).count()

        unique_macs = db.query(ProbeData.mac_address).filter(
            ProbeData.timestamp >= start_time,
            ProbeData.timestamp <= end_time
        ).distinct().count()

        if not records:
            return {
                'period_start': start_time.isoformat(),
                'period_end': end_time.isoformat(),
                'total_probe_records': probe_count,
                'unique_devices': unique_macs,
                'passenger_records': 0,
                'message': '无客流数据'
            }

        counts = [r.estimated_count for r in records]
        zones = set(r.zone for r in records)

        return {
            'period_start': start_time.isoformat(),
            'period_end': end_time.isoformat(),
            'total_probe_records': probe_count,
            'unique_devices': unique_macs,
            'passenger_records': len(records),
            'zones': list(zones),
            'avg_passengers': round(sum(counts) / len(counts), 1),
            'max_passengers': round(max(counts), 1),
            'min_passengers': round(min(counts), 1),
            'total_data_points': len(records)
        }
