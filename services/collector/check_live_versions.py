import json
import collector
from test_version_matching import MAC, FORTI
for query in (MAC, FORTI):
    try:
        payload = collector.collect(query)
        print(json.dumps({'product': query['product'], 'version': query['version'], 'nvdTotalResults': payload['nvdTotalResults'], 'retained': len(payload['vulnerabilities']), 'confirmed': [v['id'] for v in payload['vulnerabilities'] if v['confidence']=='confirmed']}, ensure_ascii=False), flush=True)
    except Exception as error:
        print(type(error).__name__ + ': ' + str(error), flush=True)
