from ryu.app.wsgi import ControllerBase, WSGIApplication, route
from ryu.lib import hub
import json
import group_controller


class RestApiController(ControllerBase):
    def __init__(self, req, link, data, **config):
        super(RestApiController, self).__init__(req, link, data, **config)
        self.group_test_app = data['group_test_app']

    @route('test', '/api/test/{group_type}', methods=['POST'])
    def start_test(self, req, group_type, **kwargs):
        group_map = self.group_test_app.group_map

        if group_type not in group_map:
            return Response(status='400 Bad Request', body=json.dumps({'error': 'Invalid group type'}))

        group_id = group_map[group_type]
        self.group_test_app.start_test(group_type, group_id)

        body = json.dumps({'status': 'started', 'group_type': group_type, 'group_id': group_id})
        return Response(content_type='application/json', body=body)

    @route('chain_test', '/api/chain_test/{chain_type}', methods=['POST'])
    def start_chain_test(self, req, chain_type, **kwargs):
        chain_map = self.group_test_app.chain_map

        if chain_type not in chain_map:
            return Response(status='400 Bad Request', body=json.dumps({'error': 'Invalid chain type'}))

        self.group_test_app.start_chain_test(chain_type)

        body = json.dumps({'status': 'started', 'chain_type': chain_type, 'group_id': chain_map[chain_type]})
        return Response(content_type='application/json', body=body)

    @route('results', '/api/results', methods=['GET'])
    def get_results(self, req, **kwargs):
        results = self.group_test_app.get_test_results()
        body = json.dumps(results)
        return Response(content_type='application/json', body=body)

    @route('chain_results', '/api/chain_results', methods=['GET'])
    def get_chain_results(self, req, **kwargs):
        results = self.group_test_app.get_chain_results()
        body = json.dumps(results)
        return Response(content_type='application/json', body=body)

    @route('cpu', '/api/cpu', methods=['GET'])
    @route('cpu', '/api/cpu/{label}', methods=['GET'])
    def get_cpu_stats(self, req, label=None, **kwargs):
        stats = self.group_test_app.get_cpu_stats(label)
        body = json.dumps(stats)
        return Response(content_type='application/json', body=body)

    @route('all_cpu', '/api/all_cpu', methods=['GET'])
    def get_all_cpu_stats(self, req, **kwargs):
        stats = self.group_test_app.get_all_cpu_stats()
        body = json.dumps(stats)
        return Response(content_type='application/json', body=body)

    @route('reset', '/api/reset', methods=['POST'])
    def reset_flows(self, req, **kwargs):
        self.group_test_app.reset_all_flows()
        body = json.dumps({'status': 'reset'})
        return Response(content_type='application/json', body=body)

    @route('groups', '/api/groups', methods=['GET'])
    def get_groups(self, req, **kwargs):
        groups = [
            {'type': 'all', 'id': 1, 'description': 'All buckets are applied (multicast)'},
            {'type': 'indirect', 'id': 2, 'description': 'Single bucket for indirect grouping'},
            {'type': 'fast_failover', 'id': 3, 'description': 'First live bucket is used'}
        ]
        body = json.dumps(groups)
        return Response(content_type='application/json', body=body)

    @route('chains', '/api/chains', methods=['GET'])
    def get_chains(self, req, **kwargs):
        chains = [
            {
                'type': 'all_indirect',
                'id': 20,
                'description': 'ALL -> INDIRECT chain: outer ALL group references INDIRECT groups',
                'structure': 'Group 20 (ALL) -> [Group 10 (INDIRECT->Port2), Group 11 (INDIRECT->Port3), Group 12 (INDIRECT->Port4)]'
            },
            {
                'type': 'ff_indirect',
                'id': 21,
                'description': 'FAST_FAILOVER -> INDIRECT chain: FF group with watch_port, referencing INDIRECT groups',
                'structure': 'Group 21 (FF) -> [watch:Port2->Group10, watch:Port3->Group11, watch:Port4->Group12]'
            },
            {
                'type': 'indirect_indirect',
                'id': 22,
                'description': 'INDIRECT -> INDIRECT chain: nested INDIRECT for multi-level indirection',
                'structure': 'Group 22 (INDIRECT) -> Group 13 (INDIRECT->Port2)'
            }
        ]
        body = json.dumps(chains)
        return Response(content_type='application/json', body=body)

    @route('ports', '/api/ports', methods=['GET'])
    @route('ports', '/api/ports/{dpid}', methods=['GET'])
    def get_port_status(self, req, dpid=None, **kwargs):
        if dpid:
            dpid = int(dpid)
        status = self.group_test_app.get_port_status(dpid)
        body = json.dumps(status)
        return Response(content_type='application/json', body=body)

    @route('events', '/api/events', methods=['GET'])
    @route('events', '/api/events/{dpid}', methods=['GET'])
    def get_switch_events(self, req, dpid=None, **kwargs):
        if dpid:
            dpid = int(dpid)
        events = self.group_test_app.get_switch_events(dpid)
        body = json.dumps(events)
        return Response(content_type='application/json', body=body)

    @route('flow_status', '/api/flow_status/{dpid}/{group_type}', methods=['GET'])
    def get_flow_status(self, req, dpid, group_type, **kwargs):
        dpid = int(dpid)
        installed = self.group_test_app.is_flow_installed(dpid, group_type)
        body = json.dumps({
            'dpid': dpid,
            'group_type': group_type,
            'flow_installed': installed
        })
        return Response(content_type='application/json', body=body)


class Response(object):
    def __init__(self, status=None, content_type=None, body=None):
        self.status = status or '200 OK'
        self.content_type = content_type or 'text/plain'
        self.body = body or ''

    def __call__(self, environ, start_response):
        headers = [
            ('Content-Type', self.content_type),
            ('Access-Control-Allow-Origin', '*'),
            ('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'),
            ('Access-Control-Allow-Headers', 'Content-Type')
        ]
        start_response(self.status, headers)
        return [self.body.encode('utf-8')]


class GroupTestRestApp(group_controller.GroupTestController):
    _CONTEXTS = {'wsgi': WSGIApplication}

    def __init__(self, *args, **kwargs):
        super(GroupTestRestApp, self).__init__(*args, **kwargs)
        wsgi = kwargs['wsgi']
        wsgi.register(RestApiController, {'group_test_app': self})
