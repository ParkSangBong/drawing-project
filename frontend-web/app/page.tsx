'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [drawings, setDrawings] = useState([]);

  // 1. 도면 목록 불러오기
  const fetchDrawings = async () => {
    const res = await axios.get('http://localhost:3000/drawings');
    setDrawings(res.data);
  };

  useEffect(() => {
    fetchDrawings();
    // 3초마다 상태를 새로고침 (실시간 느낌)
    const timer = setInterval(fetchDrawings, 3000);
    return () => clearInterval(timer);
  }, []);

  // 2. 도면 업로드 함수
  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post('http://localhost:3000/drawings/upload', formData);
      alert('도면이 접수되었습니다!');
      fetchDrawings();
    } catch (e) {
      console.error('업로드 실패', e);
    }
  };

  return (
    <main style={{ padding: '2rem' }}>
      <h1>🎨 내 도면 변환 대시보드</h1>
      
      <div style={{ marginBottom: '2rem', border: '1px solid #ccc', padding: '1rem' }}>
        <h3>새 도면 올리기</h3>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button onClick={handleUpload} style={{ marginLeft: '1rem' }}>업로드</button>
      </div>

      <table border={1} style={{ width: '100%', textAlign: 'center' }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>파일명</th>
            <th>상태</th>
            <th>생성일</th>
          </tr>
        </thead>
        <tbody>
          {drawings.map((d: any) => (
            <tr key={d.id}>
              <td>{d.id}</td>
              <td>{d.fileName}</td>
              <td style={{ fontWeight: 'bold', color: d.status === 'COMPLETED' ? 'green' : 'orange' }}>
                {d.status}
                {d.status === 'COMPLETED' && (
                  <a 
                    href={`http://localhost:3000/${d.originalUrl.replace('.jpeg', '.dxf').replace('.png', '.dxf')}`} 
                    download 
                    style={{ marginLeft: '10px', color: 'blue', fontSize: '0.8rem' }}
                  >
                    [DXF 다운로드]
                  </a>
                )}
              </td>
              <td>{new Date(d.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}