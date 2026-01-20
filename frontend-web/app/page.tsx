'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

export default function Home() {
  const [socket, setSocket] = useState<any>(null);
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drawings, setDrawings] = useState([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 슬라이더 상태 관리
  const [blockSize, setBlockSize] = useState(11);
  const [cValue, setCValue] = useState(2);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [lineThresh, setLineThresh] = useState(80);
  const [minDist, setMinDist] = useState(50);
  const [circleParam, setCircleParam] = useState(30);

  // OCR 결과 상태
  const [extractedDimensions, setExtractedDimensions] = useState<string[]>([]);

  const emitAdjust = (
    newBlockSize: number, 
    newCValue: number, 
    newLineThresh: number, 
    newMinDist: number, 
    newCircleParam: number,
    mode: string = 'PREVIEW'
  ) => {
    if (!editingId) return;
    if (socket) {
      socket.emit('adjustParameters', {
        drawingId: editingId,
        blockSize: newBlockSize,
        cValue: newCValue,
        lineThresh: newLineThresh,
        minDist: newMinDist,
        circleParam: newCircleParam,
        mode: mode
      });
    }
  };

  const fetchDrawings = async () => {
    const res = await axios.get('http://localhost:3000/drawings');
    setDrawings(res.data);
  };

  useEffect(() => {
    fetchDrawings();
    const newSocket = io('http://localhost:3000');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ 서버와 소켓 연결 성공!');
    });

    newSocket.on('drawingUpdated', () => {
      fetchDrawings();
    });

    newSocket.on('previewReady', (data: { previewUrl: string, extractedDimensions?: string[] }) => {
      console.log('🖼️ 미리보기 및 수신 데이터:', data);
      const fullUrl = `http://localhost:3000/${data.previewUrl}?t=${Date.now()}`;
      setProcessedPreview(fullUrl);
      
      // 서버에서 수치 리스트가 오면 상태 업데이트
      if (data.extractedDimensions) {
        setExtractedDimensions(data.extractedDimensions);
      }
    });

    return () => {
      newSocket.disconnect();
    };
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

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post('http://localhost:3000/drawings/upload', formData);
      const newId = res.data.drawingId; 
      setEditingId(newId);
      setProcessedPreview(null);
      setExtractedDimensions([]); // 새 업로드 시 리스트 초기화
      fetchDrawings();
      setTimeout(() => {
        if (socket) {
          socket.emit('adjustParameters', {
            drawingId: newId,
            blockSize: blockSize,
            cValue: cValue,
            mode: 'PREVIEW'
          });
        }
      }, 500);
    } catch (e) {
      console.error('업로드 실패', e);
    }
  };

  const handleFinalSave = () => {
    if (!editingId || !socket) return;
    alert('최종 CAD 변환을 시작합니다.');
    socket.emit('adjustParameters', {
      drawingId: editingId,
      blockSize: blockSize,
      cValue: cValue,
      lineThresh: lineThresh,
      minDist: minDist,
      circleParam: circleParam,
      mode: 'FINAL'
    });
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'COMPLETED': return { color: '#2ecc71', bg: '#eafaf1', text: '변환 완료' };
      case 'PENDING': return { color: '#f39c12', bg: '#fef5e7', text: '변환 중...' };
      default: return { color: '#7f8c8d', bg: '#f4f6f7', text: '대기 중' };
    }
  };

  const getDxfUrl = (originalUrl: string) => {
    const lastDotIndex = originalUrl.lastIndexOf('.');
    const basePath = originalUrl.substring(0, lastDotIndex);
    return `http://localhost:3000/${basePath}.dxf?t=${Date.now()}`;
  };

  return (
    <main style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
      <style jsx>{`
        .spinner { width: 12px; height: 12px; border: 2px solid #f39c12; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        table { border-collapse: collapse; width: 100%; background-color: #1a1a1a; border: 1px solid #333; border-radius: 12px; overflow: hidden; margin-top: 2rem; }
        th { background-color: #2c2c2c; color: #e0e0e0; padding: 16px; border-bottom: 2px solid #444; font-size: 0.9rem; font-weight: 600; }
        td { padding: 14px; border-bottom: 1px solid #2a2a2a; color: #ccc; }
        tr:hover { background-color: #222; }
      `}</style>

      <h1>🎨 내 도면 변환 대시보드</h1>
      
      {/* 1. 업로드 섹션 */}
      <div style={{ marginBottom: '2rem', border: '1px solid #444', padding: '2rem', borderRadius: '12px', backgroundColor: '#1a1a1a', textAlign: 'center' }}>
        <h3 style={{ marginTop: 0, color: '#ffffff', marginBottom: '1.5rem' }}>새 도면 업로드</h3>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '100%', maxWidth: '300px', height: '180px', backgroundColor: '#222', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #333', marginBottom: '10px' }}>
            {previewUrl ? (
              file?.name.toLowerCase().endsWith('.heic') ? (
                <div style={{ textAlign: 'center', padding: '10px' }}><p style={{ fontSize: '2rem', marginBottom: '10px' }}>📱</p><p style={{ color: '#aaa', fontSize: '0.85rem' }}>아이폰(HEIC) 미리보기 미지원</p></div>
              ) : (
                <img src={previewUrl} alt="미리보기" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              )
            ) : ( <span style={{ color: '#666', fontSize: '0.9rem' }}>이미지 미리보기</span> )}
          </div>
          <input type="file" id="file-upload" style={{ display: 'none' }} onChange={handleFileChange} />
          <label htmlFor="file-upload" style={{ padding: '10px 20px', backgroundColor: '#333', color: 'white', borderRadius: '6px', cursor: 'pointer', border: '1px dashed #555', width: '100%', maxWidth: '300px', fontSize: '0.9rem' }}>
            {file ? `📄 ${file.name}` : "📁 도면 파일 선택"}
          </label>
          <button onClick={handleUpload} disabled={!file} style={{ padding: '12px 30px', backgroundColor: file ? '#3498db' : '#444', color: 'white', border: 'none', borderRadius: '6px', cursor: file ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
            변환 시작하기
          </button>
        </div>
      </div>

      {/* 2. 편집기 및 치수 추출 레이아웃 */}
      <div className="mt-8 p-6 bg-gray-900 rounded-xl border border-gray-700">
        <h2 className="text-xl font-bold mb-4 text-white">🛠️ 실시간 도면 보정 편집기</h2>
        
        <div style={{ display: 'flex', gap: '25px', alignItems: 'flex-start' }}>
          {/* [좌측 영역: 편집 도구] */}
          <div style={{ flex: 1 }}>
            <div style={{ width: '100%', height: '400px', backgroundColor: '#000', borderRadius: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #444', overflow: 'hidden' }}>
              {processedPreview ? (
                <img src={processedPreview} alt="보정 결과" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ textAlign: 'center', color: '#666' }}><p>보정 이미지가 여기에 나타납니다.</p></div>
              )}
            </div>

            {/* 슬라이더 전체 복구 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label className="block text-sm text-gray-400 mb-1">격자 제거 (Block Size): {blockSize}</label>
                <input type="range" min="3" max="99" step="2" className="w-full h-2 bg-gray-700 rounded-lg accent-blue-500" value={blockSize} onChange={(e) => { const v = Number(e.target.value); setBlockSize(v); emitAdjust(v, cValue, lineThresh, minDist, circleParam); }} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">선명도 (C Value): {cValue}</label>
                <input type="range" min="0" max="20" className="w-full h-2 bg-gray-700 rounded-lg accent-green-500" value={cValue} onChange={(e) => { const v = Number(e.target.value); setCValue(v); emitAdjust(blockSize, v, lineThresh, minDist, circleParam); }} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">직선 감도 (Line Threshold): {lineThresh}</label>
                <input type="range" min="10" max="200" className="w-full h-2 bg-gray-700 rounded-lg accent-red-500" value={lineThresh} onChange={(e) => { const v = Number(e.target.value); setLineThresh(v); emitAdjust(blockSize, cValue, v, minDist, circleParam); }} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">원형 거리 (Min Distance): {minDist}</label>
                <input type="range" min="10" max="300" className="w-full h-2 bg-gray-700 rounded-lg accent-yellow-500" value={minDist} onChange={(e) => { const v = Number(e.target.value); setMinDist(v); emitAdjust(blockSize, cValue, lineThresh, v, circleParam); }} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">원형 정밀도 (Circle Param): {circleParam}</label>
                <input type="range" min="10" max="100" className="w-full h-2 bg-gray-700 rounded-lg accent-teal-500" value={circleParam} onChange={(e) => { const v = Number(e.target.value); setCircleParam(v); emitAdjust(blockSize, cValue, lineThresh, minDist, v); }} />
              </div>
            </div>
          </div>

          {/* [우측 영역: 감지된 치수 리스트] */}
          <div style={{ width: '240px', backgroundColor: '#1a1a1a', borderRadius: '12px', padding: '1.5rem', border: '1px solid #333', alignSelf: 'stretch' }}>
            <h3 style={{ color: 'white', fontSize: '1.1rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📏 감지된 치수
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '550px', overflowY: 'auto', paddingRight: '5px' }}>
              {extractedDimensions.length > 0 ? (
                extractedDimensions.map((dim, idx) => (
                  <div key={idx} style={{ padding: '12px', backgroundColor: '#2c2c2c', color: '#2ecc71', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem', border: '1px solid #444', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                    {dim} <span style={{ fontSize: '0.75rem', color: '#888', marginLeft: '2px' }}>mm</span>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', color: '#555', paddingTop: '40px' }}>
                  <p style={{ fontSize: '1.8rem', marginBottom: '10px' }}>🔍</p>
                  <p style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>치수를 분석 중이거나<br/>발견되지 않았습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button onClick={handleFinalSave} style={{ padding: '14px 28px', backgroundColor: '#2ecc71', color: 'white', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', border: 'none', transition: '0.2s' }}>
            💾 설정값으로 최종 DXF 저장
          </button>
        </div>
      </div>

      {/* 3. 도면 테이블 */}
      <table style={{ width: '100%', textAlign: 'center' }}>
        <thead>
          <tr><th>ID</th><th>파일명</th><th>상태</th><th>작업</th></tr>
        </thead>
        <tbody>
          {drawings.map((d: any) => {
            const style = getStatusStyle(d.status);
            return (
              <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>{d.id}</td>
                <td style={{ padding: '12px' }}>{d.fileName}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ backgroundColor: style.bg, color: style.color, padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    {d.status === 'PENDING' && <div className="spinner"></div>}
                    {style.text}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    {d.status === 'COMPLETED' ? (
                      <a href={getDxfUrl(d.originalUrl)} download style={{ color: 'white', backgroundColor: '#3498db', padding: '8px 16px', borderRadius: '4px', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 'bold' }}>다운로드</a>
                    ) : ( <span style={{ color: '#666', fontSize: '0.85rem' }}>처리 대기 중</span> )}
                    <button onClick={() => { setEditingId(d.id); setProcessedPreview(null); setExtractedDimensions([]); emitAdjust(blockSize, cValue, lineThresh, minDist, circleParam); }} style={{ padding: '8px 16px', backgroundColor: '#f39c12', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>보정 편집</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}