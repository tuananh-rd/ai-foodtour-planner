"""Isolated real rules API over explicit synthetic fixtures; never loads private env/data."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'backend'),str(ROOT)]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,required=True)
    parser.add_argument('--without-chicken',action='store_true')
    parser.add_argument('--matrix',action='store_true',help='Broader food/origin/tour acceptance dataset')
    args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='food-refinement-') as tmp:
        os.environ.update(FOODTOUR_LLM='mock',GEMINI_API_KEY='',TAVILY_API_KEY='',
            GOOGLE_MAPS_BROWSER_KEY='',GOOGLE_MAPS_SERVER_KEY='',GOOGLE_MAPS_MAP_ID='',
            FOODTOUR_TAVILY_ENABLED='0',FOODTOUR_EXPLAIN='template',FOODTOUR_ROUTING='estimate',
            FOODTOUR_GEOCODER='off',FOODTOUR_REVERSE_GEOCODER='off',FOODTOUR_CHAT_V2='1',
            FOODTOUR_UI_GUIDED='1',FOODTOUR_UI_V2='1',
            WEB_ORIGIN='http://127.0.0.1:3350,http://127.0.0.1:3330',
            FOODTOUR_SESSION_DB=str(Path(tmp)/'sessions.sqlite'),FOODTOUR_BUDGET_DB=str(Path(tmp)/'budget.sqlite'),
            FOODTOUR_EVIDENCE_PATH='',FOODTOUR_DATA_PATH=str(ROOT/'contracts/fixtures/venues.chat.synthetic.json'))
        from app.main import create_app
        from backend.tests.discovery.test_food_refinement import refinement_data
        app=create_app()
        if args.matrix:
            from backend.tests.discovery.test_food_intent_matrix import matrix_data
            data=matrix_data()
        else:
            data=refinement_data(not args.without_chicken)
        app.state.venues.snapshot=lambda:data
        app.state.build_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
        import uvicorn
        uvicorn.run(app,host='127.0.0.1',port=args.port,access_log=False)


if __name__=='__main__': main()
