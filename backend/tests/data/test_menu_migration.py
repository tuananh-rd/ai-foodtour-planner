"""Synthetic migration checks only. Production archives/config/servers are never mutated."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from app.data.menu_archive import read_menu_archive,MenuValidationError
from app.data.menu_migration import dry_run,stage,activate,activation_lock
from app.data.menu import load_menu_archive
from app.repositories.venues import VenueRepository
from app.discovery.state import State
from app.discovery.tools import Tools
from app.planner.interfaces import StraightLineEstimator
from backend.tests.discovery.test_menu_sample import menu_archive
from backend.tests.discovery.test_food_intent_matrix import matrix_data
from dataclasses import replace

ROOT=Path(__file__).resolve().parents[3]


def documents(path):
    with zipfile.ZipFile(path) as archive:
        return {n:json.loads(archive.read(n)) for n in archive.namelist()}


def write(path,docs):
    with zipfile.ZipFile(path,'w') as archive:
        for name,doc in docs.items():archive.writestr(name,json.dumps(doc,ensure_ascii=False))


class MenuMigrationTests(unittest.TestCase):
    def test_member_cap_is_bounded_independently_of_total(self):
        from app.data.menu_archive import MAX_MEMBER, MAX_EXPANDED
        self.assertEqual(MAX_MEMBER, 48*1024*1024)
        self.assertEqual(MAX_EXPANDED, 128*1024*1024)
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'oversized.zip'
            # Stored entries avoid triggering ratio checks instead of the member boundary.
            with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_STORED) as archive:
                archive.writestr('oversized.json', b' '*(MAX_MEMBER+1))
            with self.assertRaisesRegex(MenuValidationError,'archive_member_size_cap'):
                read_menu_archive(path)

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.input=self.root/'input.zip';menu_archive(self.input)
        self.docs=documents(self.input);self.store=self.root/'versions';self.active=self.root/'active.zip'
        self.active.write_bytes(self.input.read_bytes())

    def rejected(self,mutate,code):
        docs=copy.deepcopy(self.docs);mutate(docs);write(self.input,docs)
        with self.assertRaisesRegex(MenuValidationError,code):read_menu_archive(self.input)

    def test_default_dry_run_no_mutation_or_staging(self):
        before=self.active.read_bytes();original=self.input.read_bytes()
        report=dry_run(self.input)
        self.assertEqual(report['status'],'valid_not_activated')
        self.assertEqual(self.active.read_bytes(),before);self.assertEqual(self.input.read_bytes(),original)
        self.assertFalse(self.store.exists())
        self.assertNotIn('fried0',json.dumps(report));self.assertNotIn('Gà rán',json.dumps(report))

    def test_cli_safe_rejection_does_not_overwrite(self):
        self.input.write_bytes(b'not a zip')
        before=self.active.read_bytes()
        result=subprocess.run([sys.executable,str(ROOT/'tools/import_local_menu.py'),str(self.input),
            '--active-path',str(self.active)],capture_output=True,text=True)
        self.assertEqual(result.returncode,2)
        self.assertEqual(json.loads(result.stdout)['status'],'rejected_no_activation')
        self.assertNotIn(str(self.input),result.stdout+result.stderr)
        self.assertEqual(self.active.read_bytes(),before)

    def test_schema_and_boolean_types(self):
        self.rejected(lambda d:d['shopeefood_dishes.json'].update(schema='future/2'),'schema_unsupported')
        self.rejected(lambda d:d['shopeefood_dishes.json']['dishes'][0].update(is_dish='false'),'is_dish_type')

    def test_v6_or_mixed_export_requires_nonfood_flags_but_legacy_is_warned(self):
        d=copy.deepcopy(self.docs)
        d['shopeefood_dishes.json']['dishes'][0].pop('is_dish');write(self.input,d)
        with self.assertRaisesRegex(MenuValidationError,'nonfood_flag_required'):read_menu_archive(self.input)
        for filename,key in [('shopeefood_dishes.json','dishes'),('shopeefood_menu_items.json','items')]:
            for r in d[filename][key]:r.pop('is_dish',None)
        write(self.input,d)
        self.assertGreater(read_menu_archive(self.input).warnings['legacy_nonfood_flag_missing'],0)
        with zipfile.ZipFile(self.input,'a') as z:z.writestr('V6_DATA_SEMANTICS.md','Untrusted reference only')
        with self.assertRaisesRegex(MenuValidationError,'nonfood_flag_required'):read_menu_archive(self.input)

    def test_duplicate_ids_canonical_key_and_orphan(self):
        self.rejected(lambda d:d['shopeefood_menu_items.json']['items'].append(copy.deepcopy(d['shopeefood_menu_items.json']['items'][0])),'item_id_duplicate')
        def duplicate(d):
            r=copy.deepcopy(d['shopeefood_dishes.json']['dishes'][0]);r['dish_id']='different';d['shopeefood_dishes.json']['dishes'].append(r)
        self.rejected(duplicate,'canonical_key_duplicate')
        self.rejected(lambda d:d['shopeefood_menu_options.json']['options'][0].update(item_id='absent'),'option_orphan_or_branch')
        self.rejected(lambda d:d['shopeefood_dishes.json']['dish_groups'][0].update(dish_id='absent'),'dish_group_orphan')

    def test_mapping_branch_duplicate_coordinates_and_reference(self):
        def branch(d):
            r=copy.deepcopy(d['shopeefood_mapping.json']['venues'][0]);r['foody_id']='other';d['shopeefood_mapping.json']['venues'].append(r)
        self.rejected(branch,'mapping_branch_conflict')
        self.rejected(lambda d:d['shopeefood_mapping.json']['venues'][0].update(shopee_lat=0,shopee_lon=0),'mapping_coordinates_invalid')
        self.rejected(lambda d:d['shopeefood_dishes.json']['dish_groups'][0].update(source_dish_id=999),'dish_group_branch_mismatch')

    def test_timestamp_missing_and_conflict_without_variants(self):
        self.rejected(lambda d:d['shopeefood_menu_items.json']['items'][0].update(fetched_at=None),'timestamp_type')
        self.rejected(lambda d:d['shopeefood_dishes.json']['dishes'][0].update(conflict_status='conflict'),'conflict_variants_missing')

    def test_cross_group_conflict_must_be_explicit_not_first_row_wins(self):
        d=copy.deepcopy(self.docs)
        item=copy.deepcopy(d['shopeefood_menu_items.json']['items'][0]);item.update(item_id='variant',name_norm='Món thay đổi',group_id=99)
        d['shopeefood_menu_items.json']['items'].append(item)
        link=copy.deepcopy(d['shopeefood_dishes.json']['dish_groups'][0]);link.update(item_id='variant',group_id=99)
        d['shopeefood_dishes.json']['dish_groups'].append(link);write(self.input,d)
        with self.assertRaisesRegex(MenuValidationError,'unmarked_canonical_conflict'):read_menu_archive(self.input)
        d['shopeefood_dishes.json']['dishes'][0].update(conflict_status='conflict',variants=[{'name':'first'},{'name':'second'}])
        write(self.input,d);archive=read_menu_archive(self.input)
        rows,_,_=load_menu_archive(archive,{'fried0'})
        self.assertEqual(rows['fried0'][0]['price_status'],'quarantined')

    def test_nonfood_flag_overrides_nonphone_name_and_prices_quarantined(self):
        d=copy.deepcopy(self.docs)
        d['shopeefood_dishes.json']['dishes'][0].update(is_dish=False,name_norm='Thông tin không phải món')
        write(self.input,d)
        archive=read_menu_archive(self.input)
        menu,counts,_=load_menu_archive(archive,{'fried0'})
        self.assertFalse(any(r['name']=='Thông tin không phải món' for r in menu['fried0']))
        self.assertEqual(counts['contact_or_invalid_excluded'],2)
        self.assertTrue(any(r['price_status']=='quarantined' and r['reference_price_vnd'] is None for r in menu['fried0']))
        required=next(r for r in menu['fried0'] if r['name']=='Gà rán chọn sốt')
        self.assertEqual(required['min_total_vnd'],35000)

    def test_mandatory_option_contradictions_never_underquote(self):
        self.rejected(lambda d:d['shopeefood_dishes.json']['dishes'][3].update(has_mandatory_options=False),
                      'mandatory_option_flag_conflict')
        d=copy.deepcopy(self.docs)
        for row in d['shopeefood_menu_options.json']['options']:row['max_select']=0
        write(self.input,d)
        menu,_,_=load_menu_archive(self.input,{'fried0'})
        row=next(r for r in menu['fried0'] if r['name']=='Gà rán chọn sốt')
        self.assertIsNone(row['min_total_vnd']);self.assertEqual(row['price_status'],'minimum_unknown')

    def test_zip_path_duplicate_json_and_size_bounds(self):
        with zipfile.ZipFile(self.input,'a') as z:z.writestr('../escape.txt','data')
        with self.assertRaisesRegex(MenuValidationError,'archive_unsafe_path'):read_menu_archive(self.input)
        menu_archive(self.input)
        with patch('app.data.menu_archive.MAX_ARCHIVE',20):
            with self.assertRaisesRegex(MenuValidationError,'archive_size_cap'):read_menu_archive(self.input)
        with zipfile.ZipFile(self.input,'w') as z:
            for name,doc in self.docs.items():
                z.writestr(name,'{"schema":1,"schema":2}' if name=='shopeefood_dishes.json' else json.dumps(doc))
        with self.assertRaisesRegex(MenuValidationError,'json_duplicate_key'):read_menu_archive(self.input)

    def test_stage_activate_same_path_cache_and_rollback(self):
        old=stage(self.active,self.store)['sha256'];old_time=self.active.stat().st_mtime_ns
        path=ROOT/'contracts/fixtures/venues.chat.synthetic.json'
        with patch.dict(os.environ,{'FOODTOUR_MENU_PATH':str(self.active),'FOODTOUR_EVIDENCE_PATH':''}):
            repo=VenueRepository(path);before=repo.snapshot()
            d=copy.deepcopy(self.docs);d['shopeefood_dishes.json']['dishes'][0]['name_norm']='Gà rán thay đổi'
            write(self.input,d);new=stage(self.input,self.store)['sha256']
            with self.assertRaisesRegex(MenuValidationError,'explicit_activation_required'):activate(new,self.store,self.active)
            result=activate(new,self.store,self.active,confirmed=True)
            os.utime(self.active,ns=(old_time,old_time))
            after=repo.snapshot()
            self.assertNotEqual(before.dataset_version,after.dataset_version)
            self.assertEqual(result['previous_sha256'],old)
            self.assertEqual(after.menu_by_venue['fried0'][0]['name'],'Gà rán thay đổi')
            activate(old,self.store,self.active,confirmed=True)
            self.assertEqual(repo.snapshot().dataset_version,before.dataset_version)
            self.assertEqual(read_menu_archive(self.active).sha256,old)

    def test_tampered_staged_archive_and_failed_atomic_replace_preserve_active(self):
        version=stage(self.input,self.store)['sha256'];before=self.active.read_bytes()
        with patch('app.data.menu_migration.os.replace',side_effect=OSError('failure')):
            with self.assertRaises(OSError):activate(version,self.store,self.active,confirmed=True)
        self.assertEqual(self.active.read_bytes(),before)
        (self.store/version/'archive.zip').write_bytes(b'bad')
        with self.assertRaises(MenuValidationError):activate(version,self.store,self.active,confirmed=True)
        self.assertEqual(self.active.read_bytes(),before)

    def test_partial_crawl_statuses_are_separate_and_require_activation_ack(self):
        d=copy.deepcopy(self.docs)
        for n,status in enumerate(('error','no_service')):
            d['shopeefood_mapping.json']['venues'].append({'foody_id':f'failed{n}','match_status':'none','shopee_status':status})
        write(self.input,d);report=dry_run(self.input)
        self.assertEqual(report['counts']['menu_venues'],1)
        self.assertEqual(report['counts']['crawl_statuses'],{'ok':1,'error':1,'no_service':1})
        version=stage(self.input,self.store)['sha256']
        with self.assertRaisesRegex(MenuValidationError,'partial_archive_requires_acknowledgement'):
            activate(version,self.store,self.active,confirmed=True)
        activate(version,self.store,self.active,confirmed=True,allow_partial=True)

    def test_reassigned_branch_and_concurrent_activation_fail_closed(self):
        d=copy.deepcopy(self.docs)
        for name,key in [('shopeefood_dishes.json','dishes'),('shopeefood_dishes.json','dish_groups'),('shopeefood_menu_items.json','items'),('shopeefood_mapping.json','venues')]:
            for r in d[name][key]:r['shopee_delivery_id']=200
        write(self.input,d);version=stage(self.input,self.store)['sha256'];before=self.active.read_bytes()
        with self.assertRaisesRegex(MenuValidationError,'branch_reassignment_forbidden'):activate(version,self.store,self.active,confirmed=True)
        with activation_lock(self.active):
            with self.assertRaisesRegex(MenuValidationError,'activation_locked'):activate(version,self.store,self.active,confirmed=True)
        self.assertEqual(self.active.read_bytes(),before)

    def test_dataset_change_clears_pending_state_and_keeps_only_valid_locks(self):
        data=matrix_data();state=State();state.patch({'origin':{'lat':21.02,'lon':105.83},'foods':['gà rán']})
        state.dataset_version='previous';state.selection=[{'id':'fried0','locked':True},{'id':'missing','locked':True}]
        state.results=['fried1'];state.comparison=['fried1','fried2'];state.confirmation={'id':'old'}
        state.pending_search={'dish':'old'};state.last_search={'dish':'old'};state.plan_requested=True;state.pending_slot='start_time'
        origin=state.profile.origin.model_copy()
        Tools(state,data,StraightLineEstimator())
        self.assertEqual(state.selection,[{'id':'fried0','locked':True}]);self.assertEqual(state.profile.origin,origin)
        self.assertEqual(state.results,[]);self.assertEqual(state.comparison,[]);self.assertIsNone(state.confirmation)
        self.assertIsNone(state.pending_search);self.assertIsNone(state.last_search);self.assertFalse(state.plan_requested)
        self.assertTrue(state.tour_stale);self.assertIn('thực đơn đã thay đổi',state.messages[-1]['text'])
        restored=State.restore(state.dump());count=len(restored.messages)
        Tools(restored,data,StraightLineEstimator());self.assertEqual(len(restored.messages),count)
