"""Local private-menu QA with all provider transports disabled and disposable sessions."""
import argparse
import os
from pathlib import Path
import sys
import tempfile
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,required=True)
    parser.add_argument('--address-lookup',action='store_true',help='Explicit bounded public Photon address QA; no AI/search provider.')
    args=parser.parse_args()
    # Import only read-only local data paths, never accounts/keys/caps or ledgers.
    for line in (ROOT/'backend/.env').read_text(encoding='utf-8-sig').splitlines():
        if '=' not in line or line.lstrip().startswith('#'):continue
        key,value=line.split('=',1)
        if key.strip() in ('FOODTOUR_DATA_PATH','FOODTOUR_EVIDENCE_PATH'):
            os.environ[key.strip()]=value.strip().strip('"').strip("'")
    with tempfile.TemporaryDirectory(prefix='private-menu-qa-') as tmp:
        os.environ.update(FOODTOUR_LLM='mock',GEMINI_API_KEY='',TAVILY_API_KEY='',
            FOODTOUR_TAVILY_ENABLED='0',GOOGLE_MAPS_BROWSER_KEY='',GOOGLE_MAPS_SERVER_KEY='',
            GOOGLE_MAPS_MAP_ID='',FOODTOUR_EXPLAIN='template',FOODTOUR_ROUTING='estimate',
            FOODTOUR_GEOCODER='off',FOODTOUR_REVERSE_GEOCODER='photon' if args.address_lookup else 'off',FOODTOUR_CHAT_V2='1',
            FOODTOUR_UI_GUIDED='1',FOODTOUR_UI_V2='1',WEB_ORIGIN='http://127.0.0.1:3350',
            FOODTOUR_MENU_PATH=str(ROOT/'.venv/private-menu/shopeefood_menu.zip'),
            FOODTOUR_SESSION_DB=str(Path(tmp)/'sessions.sqlite'),
            FOODTOUR_BUDGET_DB=str(Path(tmp)/'budget.sqlite'))
        from app.main import create_app
        import subprocess
        app=create_app()
        app.state.build_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
        import uvicorn
        uvicorn.run(app,host='127.0.0.1',port=args.port,access_log=False)

if __name__=='__main__':main()
