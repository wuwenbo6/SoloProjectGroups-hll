import asyncio
import json
import os
from aiohttp import web
from pon_simulator import PONSimulator


simulator = PONSimulator()


async def handle_index(request):
    return web.FileResponse(os.path.join(os.path.dirname(__file__), 'static', 'index.html'))


async def handle_status(request):
    status = simulator.get_status()
    return web.json_response(status)


async def handle_start(request):
    try:
        data = await request.json()
        onu_count = int(data.get('onu_count', 4))
    except:
        onu_count = 4
    simulator.reset()
    simulator.start(onu_count)
    return web.json_response({'status': 'started', 'onu_count': onu_count})


async def handle_stop(request):
    simulator.stop()
    return web.json_response({'status': 'stopped'})


async def handle_reset(request):
    simulator.reset()
    return web.json_response({'status': 'reset'})


async def handle_export_timeline(request):
    csv_data = simulator.export_timeline_csv()
    return web.Response(
        body=csv_data,
        content_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename="pon_timeline.csv"'}
    )


async def handle_export_dba(request):
    csv_data = simulator.export_dba_csv()
    return web.Response(
        body=csv_data,
        content_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename="pon_dba_history.csv"'}
    )


def create_app():
    app = web.Application()
    app.router.add_get('/', handle_index)
    app.router.add_get('/api/status', handle_status)
    app.router.add_post('/api/start', handle_start)
    app.router.add_post('/api/stop', handle_stop)
    app.router.add_post('/api/reset', handle_reset)
    app.router.add_get('/api/export/timeline', handle_export_timeline)
    app.router.add_get('/api/export/dba', handle_export_dba)
    app.router.add_static('/static', path=os.path.join(os.path.dirname(__file__), 'static'))
    return app


async def main():
    app = create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 8080)
    await site.start()
    print("PON系统模拟器服务器已启动: http://localhost:8080")
    while True:
        await asyncio.sleep(3600)


if __name__ == '__main__':
    asyncio.run(main())
