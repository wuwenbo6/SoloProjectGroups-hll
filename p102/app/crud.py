from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
from app import models, schemas
from datetime import datetime


async def create_stream(db: AsyncSession, stream: schemas.StreamCreate):
    db_stream = models.Stream(name=stream.name, rtsp_url=stream.rtsp_url)
    db.add(db_stream)
    await db.commit()
    await db.refresh(db_stream)
    return db_stream


async def get_stream(db: AsyncSession, stream_id: int):
    result = await db.execute(select(models.Stream).where(models.Stream.id == stream_id))
    return result.scalar_one_or_none()


async def get_all_streams(db: AsyncSession, skip: int = 0, limit: int = 100):
    result = await db.execute(
        select(models.Stream).order_by(desc(models.Stream.created_at)).offset(skip).limit(limit)
    )
    return result.scalars().all()


async def update_stream(db: AsyncSession, stream_id: int, stream_update: schemas.StreamUpdate):
    db_stream = await get_stream(db, stream_id)
    if not db_stream:
        return None
    
    update_data = stream_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_stream, key, value)
    
    await db.commit()
    await db.refresh(db_stream)
    return db_stream


async def delete_stream(db: AsyncSession, stream_id: int):
    db_stream = await get_stream(db, stream_id)
    if db_stream:
        await db.delete(db_stream)
        await db.commit()
    return db_stream


async def create_tracking_record(db: AsyncSession, record: schemas.TrackingRecordCreate):
    db_record = models.TrackingRecord(**record.model_dump())
    db.add(db_record)
    await db.commit()
    await db.refresh(db_record)
    return db_record


async def get_tracking_records_by_stream(
    db: AsyncSession, 
    stream_id: int, 
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 1000
):
    query = select(models.TrackingRecord).where(models.TrackingRecord.stream_id == stream_id)
    
    if start_time:
        query = query.where(models.TrackingRecord.frame_timestamp >= start_time)
    if end_time:
        query = query.where(models.TrackingRecord.frame_timestamp <= end_time)
    
    query = query.order_by(desc(models.TrackingRecord.frame_timestamp)).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()
