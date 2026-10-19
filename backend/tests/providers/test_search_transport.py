import unittest
from unittest.mock import patch

from app.llm.provider import ProviderError
from app.providers.search_transport import public_addresses, tavily_post, tavily_usage


class SearchTransportTests(unittest.TestCase):
    def test_private_or_mixed_dns_fails_closed(self):
        for addresses in ([], ['127.0.0.1'], ['169.254.169.254'], ['::1'], ['8.8.8.8', '10.0.0.1']):
            resolver = lambda *a, **kw: [(None, None, None, None, (ip, 443)) for ip in addresses]
            with self.assertRaises(ProviderError):
                public_addresses(resolver)
        self.assertEqual(public_addresses(lambda *a, **kw: [(None, None, None, None, ('8.8.8.8', 443))]), ['8.8.8.8'])

    def test_redirect_and_quota_statuses_are_not_followed(self):
        for status in (302, 429, 432, 433):
            with patch('app.providers.search_transport.public_addresses', return_value=['8.8.8.8']), \
                 patch('app.providers.search_transport.PinnedTavilyConnection') as connection:
                connection.return_value.getresponse.return_value.status = status
                with self.assertRaises(ProviderError) as error:
                    tavily_post({}, 'synthetic-test-only')
                self.assertEqual(error.exception.kind, 'quota' if status in (429, 432, 433) else 'unavailable')
                self.assertEqual(error.exception.status, status)
                self.assertEqual(connection.return_value.request.call_count, 1)
                self.assertEqual(connection.return_value.request.call_args.args[:2], ('POST', '/search'))
                connection.return_value.close.assert_called_once()


class UsageTransportTests(unittest.TestCase):
    def test_read_only_usage_has_fixed_endpoint_and_no_redirects(self):
        with patch('app.providers.search_transport.timed_public_addresses', return_value=['8.8.8.8']), \
             patch('app.providers.search_transport.PinnedTavilyConnection') as connection:
            connection.return_value.getresponse.return_value.status = 302
            with self.assertRaises(ProviderError):
                tavily_usage('SYNTHETIC_TEST_ONLY')
            self.assertEqual(connection.return_value.request.call_args.args[:2], ('GET', '/usage'))
            self.assertIsNone(connection.return_value.request.call_args.kwargs['body'])
            self.assertEqual(connection.return_value.request.call_count, 1)
            connection.return_value.close.assert_called_once()
