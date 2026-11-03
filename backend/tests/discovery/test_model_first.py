"""Model-first dialogue contracts; synthetic model responses, no live transport."""
import copy
import unittest
from unittest.mock import patch
from app.discovery.engine import handle
from app.discovery.model_first import contents_for
from app.llm.provider import ProviderError
from app.repositories.llm_budget import DailyLLMBudget
from backend.tests.discovery.test_apithat import tools


class Model:
    conversation_flow='model_first';mode='apithat';configured=True;last_response_model='gpt-6-luna'
    def __init__(self,responses):
        self.client=type('Client',(),{'model':'gpt-6-luna','budget':DailyLLMBudget(18)})()
        self.responses=iter(responses);self.requests=[]
    def generate(self,contents,**kwargs):
        self.requests.append(copy.deepcopy(contents))
        response=next(self.responses)
        if isinstance(response,Exception):raise response
        return {'role':'model','parts':response}


def call(name,args,identity):return {'functionCall':{'name':name,'args':args,'id':identity}}


class ModelFirstTests(unittest.TestCase):
    def test_original_message_and_both_history_roles_model_before_any_parser(self):
        context=tools();context.state.remember('user','Chào bạn!')
        context.state.remember('assistant','Bạn muốn hỏi gì về món ăn?')
        text='  Tôi đang phân vân: phở hay bún chả?  '
        context.state.remember('user',text)
        model=Model([[{'text':'Nếu thích món nước, bạn có thể cân nhắc phở; bún chả có thịt nướng và nước chấm riêng.'}]])
        with patch('app.discovery.engine.parse_patch',side_effect=AssertionError('parser before model')), \
             patch('app.discovery.engine.fallback',side_effect=AssertionError('canned fallback')):
            result,provider=handle(text,context,model=model)
        self.assertEqual(model.requests[0][-1],{'role':'user','parts':[{'text':text}]})
        self.assertIn({'role':'model','parts':[{'text':'Bạn muốn hỏi gì về món ăn?'}]},model.requests[0])
        self.assertEqual(sum(p.get('text')==text for c in model.requests[0] for p in c['parts']),1)
        self.assertEqual(context.state.profile.foods,[]);self.assertEqual(context.calls,0)
        self.assertEqual(provider['reply_source'],'model');self.assertEqual(provider['calls'],1)

    def test_ambiguous_food_request_clarified_by_model_without_keyword_search(self):
        context=tools();model=Model([[{'text':'Bạn thích món nước hay món khô cho bữa này?'}]])
        result,provider=handle('tôi muốn ăn',context,model=model)
        self.assertEqual(result['text'],'Bạn thích món nước hay món khô cho bữa này?')
        self.assertEqual(context.calls,0);self.assertEqual(provider['reply_source'],'model')

    def test_model_proposes_preferences_then_search_and_explains_true_results(self):
        context=tools();text='tôi muốn ăn phở gà ở Đống Đa'
        model=Model([[call('update_preferences',{'patch':{'foods':['phở gà'],'area':'Đống Đa'}},'pref'),
                      call('search_restaurants',{'dish':'phở gà','area':'Đống Đa'},'read')],
                     [{'text':'Các kết quả phở gà phù hợp đã có trong danh sách; bạn có thể xem chi tiết trước khi chọn.'}]])
        result,provider=handle(text,context,model=model)
        self.assertEqual(context.state.profile.foods,['phở gà'])
        self.assertEqual(context.state.profile.area,'Đống Đa');self.assertTrue(context.state.results)
        self.assertEqual(context.state.selection,[]);self.assertIsNone(context.state.confirmation)
        self.assertEqual(provider['reply_source'],'model');self.assertEqual(provider['calls'],2)
        responses=model.requests[1][-1]['parts']
        self.assertEqual([p['functionResponse']['id'] for p in responses],['pref','read'])
        self.assertEqual(responses[1]['functionResponse']['response']['status'],'ok')

    def test_model_read_arguments_not_overwritten_by_keyword_parser(self):
        context=tools();model=Model([[call('search_restaurants',{'dish':'phở gà','area':'Đống Đa'},'read')],
            [{'text':'Bạn có thể xem những kết quả vừa tìm được.'}]])
        with patch('app.discovery.engine.parse_patch',side_effect=AssertionError('read parsed')):
            result,provider=handle('Tìm giúp món nước được không?',context,model=model)
        self.assertEqual(context.state.last_search['dish'],'phở gà')
        self.assertEqual(context.state.last_search['area'],'Đống Đa');self.assertTrue(context.state.results)

    def test_private_history_is_excluded_and_current_private_turn_never_sent(self):
        context=tools();context.state.messages=[{'role':'user','text':'Tôi dị ứng đậu phộng'},
            {'role':'assistant','text':'Địa chỉ nhà bạn là 12 phố Huế'},
            {'role':'user','text':'Chào bạn'}]
        projection=contents_for(context,'Xin chào')
        self.assertFalse(any('dị ứng' in p.get('text','') or '12 phố Huế' in p.get('text','')
            for c in projection for p in c['parts']))
        model=Model([]);result,provider=handle('Tôi dị ứng đậu phộng',context,model=model)
        self.assertEqual(model.requests,[]);self.assertEqual(provider['mode'],'rules')
        self.assertEqual(provider['reason'],'private_turn_rules_fallback')

    def test_timeout_fallback_is_labelled_and_only_then_parses_search(self):
        context=tools();model=Model([ProviderError('timeout')])
        result,provider=handle('tôi muốn ăn phở gà ở Đống Đa',context,model=model)
        self.assertEqual(len(model.requests),1);self.assertTrue(context.state.results)
        self.assertEqual(provider['mode'],'rules');self.assertEqual(provider['reply_source'],'rules')
        self.assertEqual(provider['reason'],'timeout_rules_fallback')
        self.assertEqual(provider['failure']['source'],'transport')

    def test_confirmation_cannot_be_generated_by_model_and_ids_remain_validated(self):
        context=tools();model=Model([[call('confirm',{'confirmation_id':'fake'},'bad')],
            [{'text':'Đã tạo tour.'}]])
        result,provider=handle('Chào bạn',context,model=model)
        self.assertEqual(context.state.selection,[]);self.assertIsNone(context.planned_tour)
        self.assertEqual(result['code'],'authority_denied');self.assertNotEqual(provider['reply_source'],'model')

    def test_current_public_text_is_not_truncated_and_no_data_remains_no_data(self):
        context=tools();text='Xin tư vấn món ăn nói chung. '+('Một sở thích công khai. '*50)
        model=Model([[{'text':'Bạn có thể cân nhắc món nước hoặc món khô theo khẩu vị.'}]])
        handle(text,context,model=model)
        self.assertEqual(model.requests[0][-1]['parts'][0]['text'],text)
        model=Model([[call('search_restaurants',{'dish':'bánh thiên hà','area':'Đống Đa'},'read')],
            [{'text':'Chưa có dữ liệu phù hợp cho món bạn đang tìm.'}]])
        result,provider=handle('Tìm bánh thiên hà tại Đống Đa',context,model=model)
        self.assertEqual(result['status'],'no_results');self.assertEqual(context.state.results,[])
        self.assertEqual(provider['reply_source'],'model');self.assertEqual(context.state.selection,[])
