'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [drawings, setDrawings] = useState([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);

    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'COMPLETED': return { color: '#2ecc71', bg: '#eafaf1', text: '변환 완료' };
      case 'PENDING': return { color: '#f39c12', bg: '#fef5e7', text: '변환 중...' };
      default: return { color: '#7f8c8d', bg: '#f4f6f7', text: '대기 중' };
    }
  };

  const getDxfUrl = (originalUrl: string) => {
    // 확장자만 .dxf로 교체하는 함수
    const lastDotIndex = originalUrl.lastIndexOf('.');
    const basePath = originalUrl.substring(0, lastDotIndex);
    return `http://localhost:3000/${basePath}.dxf`;
  };

  return (
    <main style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* CSS를 return 문 안으로 옮겼습니다 */}
      <style jsx>{`
        .spinner {
          width: 12px;
          height: 12px;
          border: 2px solid #f39c12;
          border-top: 2px solid transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        table {
          border-collapse: collapse;
          width: 100%;
          background-color: #1a1a1a;
          border: 1px solid #333;
          border-radius: 12px;
          overflow: hidden; /* 테두리 둥글게 유지 */
          margin-top: 2rem;
        }

        th {
          background-color: #2c2c2c; /* 헤더 배경을 어둡게 */
          color: #e0e0e0;           /* 글자는 밝게 */
          padding: 16px;
          border-bottom: 2px solid #444;
          font-size: 0.9rem;
          font-weight: 600;
        }

        td {
          padding: 14px;
          border-bottom: 1px solid #2a2a2a;
          color: #ccc;
        }

        tr:hover {
          background-color: #222; /* 마우스 올렸을 때 강조 효과 */
        }
      `}</style>

      <h1>🎨 내 도면 변환 대시보드</h1>
      
      {/* 업로드 섹션 디자인 개선 */}
      <div style={{ 
        marginBottom: '2rem', 
        border: '1px solid #444', 
        padding: '2rem', 
        borderRadius: '12px', 
        backgroundColor: '#1a1a1a',
        textAlign: 'center'
      }}>
        <h3 style={{ marginTop: 0, color: '#ffffff', marginBottom: '1.5rem' }}>새 도면 업로드</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
          
          {/* 📸 이미지 미리보기 영역 추가 */}
          <div style={{ 
            width: '100%', 
            maxWidth: '300px', 
            height: '180px', 
            backgroundColor: '#222', 
            borderRadius: '8px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            overflow: 'hidden',
            border: '1px solid #333',
            marginBottom: '10px'
          }}>
            {previewUrl ? (
              <img 
                src={previewUrl} 
                alt="미리보기" 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
              />
            ) : (
              <span style={{ color: '#666', fontSize: '0.9rem' }}>이미지 미리보기</span>
            )}
          </div>

          {/* 숨겨진 실제 input (onChange에서 handleFileChange 호출) */}
          <input 
            type="file" 
            id="file-upload"
            style={{ display: 'none' }} 
            onChange={handleFileChange} 
          />
          
          {/* 디자인된 가짜 버튼 (label) */}
          <label htmlFor="file-upload" style={{
            padding: '10px 20px',
            backgroundColor: '#333',
            color: 'white',
            borderRadius: '6px',
            cursor: 'pointer',
            border: '1px dashed #555',
            width: '100%',
            maxWidth: '300px',
            fontSize: '0.9rem'
          }}>
            {file ? `📄 ${file.name}` : "📁 도면 파일 선택"}
          </label>

          <button 
            onClick={handleUpload} 
            disabled={!file}
            style={{ 
              padding: '12px 30px', 
              backgroundColor: file ? '#3498db' : '#444', 
              color: file ? 'white' : '#888', 
              border: 'none', 
              borderRadius: '6px',
              cursor: file ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: '1rem',
              transition: '0.3s',
              width: '100%',
              maxWidth: '300px'
            }}
          >
            변환 시작하기
          </button>
        </div>
      </div>

      <table style={{ width: '100%', textAlign: 'center' }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>파일명</th>
            <th>상태</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {drawings.map((d: any) => {
            const style = getStatusStyle(d.status);
            return (
              <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>{d.id}</td>
                <td style={{ padding: '12px' }}>{d.fileName}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    backgroundColor: style.bg,
                    color: style.color,
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    fontWeight: 'bold',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    minWidth: '100px',
                    justifyContent: 'center'
                  }}>
                    {d.status === 'PENDING' && <div className="spinner"></div>}
                    {style.text}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>
                  {d.status === 'COMPLETED' ? (
                    <a href={getDxfUrl(d.originalUrl)} download style={{
                      color: 'white',
                      backgroundColor: '#3498db',
                      padding: '8px 16px',
                      borderRadius: '4px',
                      textDecoration: 'none',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap', // [중요] 글자가 길어도 한 줄로 유지
                      display: 'inline-block'
                    }}>
                      CAD 파일 다운로드
                    </a>
                  ) : (
                    <span style={{ color: '#666' }}>처리 대기 중</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}