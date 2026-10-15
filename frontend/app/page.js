'use client';
import {useState} from 'react';
export default function Home(){
 const [result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){e.preventDefault();setBusy(true);setError('');const f=new FormData(e.target);
 try{const response=await fetch((process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000')+'/v1/plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city:f.get('city'),lat:Number(f.get('lat')),lon:Number(f.get('lon')),budget_vnd:Number(f.get('budget')),duration_min:Number(f.get('duration')),interests:f.get('interest').trim()?[f.get('interest').trim()]:[],mode:f.get('mode')})});
 if(!response.ok)throw new Error('Yêu cầu không hợp lệ hoặc máy chủ chưa sẵn sàng.');setResult(await response.json());}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <main><p>BẢN THỬ NGHIỆM · DỮ LIỆU HÀ NỘI</p><h1>Khám phá một vòng vị ngon</h1><p>Gợi ý có nguồn dẫn. Giờ mở cửa, chi phí mỗi người và tuyến đi cần xác minh.</p>
 <form onSubmit={submit} style={{display:'grid',gap:12,maxWidth:520}}>
 <label>Thành phố <input name="city" defaultValue="Hà Nội" required/></label>
 <label>Vĩ độ điểm xuất phát <input name="lat" type="number" step="any" min="-90" max="90" defaultValue="21.03" required/></label>
 <label>Kinh độ <input name="lon" type="number" step="any" min="-180" max="180" defaultValue="105.85" required/></label>
 <label>Ngân sách tham khảo (VND) <input name="budget" type="number" min="1" defaultValue="200000" required/></label>
 <label>Thời lượng mong muốn (phút) <input name="duration" type="number" min="30" max="720" defaultValue="120" required/></label>
 <label>Nhóm món yêu thích <input name="interest" placeholder="Ví dụ: Bún"/></label>
 <label>Chế độ <select name="mode"><option value="explore">Khám phá có điều kiện</option><option value="strict">Yêu cầu đủ bằng chứng</option></select></label>
 <button disabled={busy}>{busy?'Đang tìm…':'Tìm gợi ý'}</button></form>
 {error&&<p role="alert">{error}</p>}{result&&<section aria-live="polite"><h2>{result.status==='insufficient_evidence'?'Chưa đủ bằng chứng để lập lịch':'Gợi ý để kiểm tra'}</h2>{result.reason&&<p>{result.reason}</p>}<ul>{result.warnings.map(w=><li key={w}>{w}</li>)}</ul>
 {result.stops.map(v=><article key={v.id} style={{background:'white',padding:20,margin:'16px 0',borderRadius:12}}><h3>{v.name}</h3><p>{v.address} · {v.district}</p><p>Nhóm món từ nguồn: {v.dish_groups}</p><p>Khoảng giá quán: {v.price_min_vnd_norm?.toLocaleString('vi-VN')}–{v.price_max_vnd_norm?.toLocaleString('vi-VN')} ₫</p><p>Giờ hiển thị: {v.hours_displayed} · chưa xác minh ngày</p><p>Chặng đường chim bay: {v.straight_line_leg_km} km</p><a href={v.source_url} target="_blank" rel="noreferrer">Xem nguồn Foody</a> · <a href={'https://www.openstreetmap.org/?mlat='+v.lat+'&mlon='+v.lon+'#map=17/'+v.lat+'/'+v.lon} target="_blank" rel="noreferrer">Xem vị trí trên bản đồ</a></article>)}</section>}</main>
}
