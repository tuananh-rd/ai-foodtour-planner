import unittest
from app.main import PlanRequest,plan,app
from fastapi.testclient import TestClient

class PlannerTests(unittest.TestCase):
    def setUp(self):
        # Explicit synthetic legacy rows: this suite must work without private data/venues.json.
        self.rows = [dict(id=f'SYN-LEGACY-{i}', name=f'[SYNTHETIC] Legacy venue {i}',
                          city='Hà Nội', lat=21.03 + i * .001, lon=105.85,
                          venue_types='Quán ăn', geo_status='ok', price_status='ok',
                          price_max_vnd_norm=40000, dish_groups='Phở', cuisine_styles='Món Việt',
                          source_url='https://example.invalid/synthetic') for i in range(3)]
        self.rows.append(dict(self.rows[0], id='SYN-UNKNOWN-PRICE', price_status='unknown', price_max_vnd_norm=None))
        self.rows.append(dict(self.rows[0], id='SYN-ONLINE', venue_types='Shop Online'))
    def request(self,**kwargs):
        return PlanRequest(**({'lat':21.03,'lon':105.85,'budget_vnd':200000,'duration_min':120}|kwargs))
    def test_strict_refuses_unknown(self):
        self.assertEqual(plan(self.request(mode='strict'),self.rows)['status'],'insufficient_evidence')
    def test_budget_and_source(self):
        result=plan(self.request(),self.rows)
        self.assertTrue(result['stops'])
        self.assertLessEqual(result['venue_range_upper_sum_vnd'],200000)
        self.assertFalse(result['budget_guaranteed'])
        for r in result['stops']:
            self.assertNotIn('Shop Online',r['venue_types'])
            self.assertEqual(r['source_url'],'https://example.invalid/synthetic')
    def test_no_match(self):
        self.assertEqual(plan(self.request(city='Unknown'),self.rows)['stops'],[])
    def test_unknown_price_never_free(self):
        self.assertNotIn('SYN-UNKNOWN-PRICE',[r['id'] for r in plan(self.request(budget_vnd=10000000),self.rows)['stops']])
    def test_validation(self):
        c=TestClient(app)
        self.assertEqual(c.post('/v1/plans',json={'lat':999}).status_code,422)
        self.assertEqual(c.post('/v1/plans',json=self.request().model_dump()).status_code,200)

if __name__=='__main__': unittest.main()
