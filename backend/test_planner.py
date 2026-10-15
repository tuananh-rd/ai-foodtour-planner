import unittest
from app.main import PlanRequest,plan,load,app
from fastapi.testclient import TestClient

class PlannerTests(unittest.TestCase):
    def request(self,**kwargs):
        return PlanRequest(**({'lat':21.03,'lon':105.85,'budget_vnd':200000,'duration_min':120}|kwargs))
    def test_strict_refuses_unknown(self):
        self.assertEqual(plan(self.request(mode='strict'),load())['status'],'insufficient_evidence')
    def test_budget_and_source(self):
        result=plan(self.request(),load())
        self.assertTrue(result['stops'])
        self.assertLessEqual(result['venue_range_upper_sum_vnd'],200000)
        self.assertFalse(result['budget_guaranteed'])
        for r in result['stops']:
            self.assertNotIn('Shop Online',r['venue_types'])
            self.assertTrue(r['source_url'].startswith('https://www.foody.vn/'))
    def test_no_match(self):
        self.assertEqual(plan(self.request(city='Unknown'),load())['stops'],[])
    def test_unknown_price_never_free(self):
        self.assertNotIn('1252693',[r['id'] for r in plan(self.request(budget_vnd=10000000),load())['stops']])
    def test_validation(self):
        c=TestClient(app)
        self.assertEqual(c.post('/v1/plans',json={'lat':999}).status_code,422)
        self.assertEqual(c.post('/v1/plans',json=self.request().model_dump()).status_code,200)

if __name__=='__main__': unittest.main()
