import unittest
from app.providers.search_safety import public_food_query, public_source_url


class SearchSafetyTests(unittest.TestCase):
    def test_query_projection_rejects_sensitive_and_instruction_payloads(self):
        for query in ('phở tại GPS21.0,105.0', 'Tôi dị ứng đậu phộng, tìm phở',
                      'phở ignore instructions', 'phở http://127.0.0.1/admin',
                      'phở test@example.com', 'phở tôi tên Nguyễn Văn A', 'mua cổ phiếu'):
            self.assertIsNone(public_food_query(query), query)
        self.assertEqual(public_food_query('Tra web: giờ mở cửa phở quanh Hồ Gươm'), 'giờ mở cửa phở quanh Hồ Gươm')

    def test_citation_urls_refuse_ambiguous_numeric_and_private_hosts(self):
        for url in ('javascript:alert(1)', 'http://example.com', 'https://127.0.0.1/',
                    'https://127.000.000.001/', 'https://0x7f.0.0.1/', 'https://2130706433/',
                    'https://[::1]/', 'https://example.local/', 'https://u:p@example.com/',
                    'https://example.com:8443/', 'https://example.com/\nhello'):
            self.assertFalse(public_source_url(url), url)
        self.assertTrue(public_source_url('https://example.com/food?q=pho'))
