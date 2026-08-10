'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client'; // 소켓 추가

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function AiPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(API_URL);

    newSocket.on('connect', () => {
      console.log('✅ AI 페이지 소켓 연결됨:', newSocket.id);
    });

    newSocket.on('previewReady', (data) => {
      console.log('🚀 AI 변환 완료 신호 도착!', data);
      setIsLoading(false);
      
      setResult({
        // previewUrl은 "/uploads/..." 처럼 슬래시로 시작하므로
        // API_URL 뒤에 그대로 붙인다. 사이에 슬래시를 더하면 "//uploads"가 되어 404가 난다.
        dxfUrl: `${API_URL}${data.previewUrl}`,
        aiData: { elements: data.extractedDimensions || [] }
      });
      
      alert('AI 변환이 완료되었습니다! 🎉');
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    if (selectedFile) {
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setResult(null); // 새 파일 선택 시 결과 초기화
    }
  };

  const handleAiConvert = async () => {
    if (!file) return;
    setIsLoading(true); // 로딩 시작
    
    const formData = new FormData();
    formData.append('file', file);
    
    if (socket && socket.id) {
      formData.append('socketId', socket.id);
    }

    try {
      await axios.post(`${API_URL}/drawings/ai-convert`, formData);
      console.log('📡 변환 요청 전송 완료. 소켓 대기 중...');
    } catch (e) {
      console.error('요청 실패', e);
      alert('서버 요청 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  };

  return (
    <main style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto', backgroundColor: '#121212', minHeight: '100vh', color: '#fff' }}>
      <nav style={{ marginBottom: '2rem', display: 'flex', gap: '20px', borderBottom: '1px solid #333', paddingBottom: '1rem' }}>
        <Link href="/" style={{ color: '#888', textDecoration: 'none' }}>🛠️ 레거시 엔진 (OpenCV)</Link>
        <Link href="/ai" style={{ color: '#4facfe', fontWeight: 'bold', textDecoration: 'none', borderBottom: '2px solid #4facfe' }}>🚀 차세대 AI 엔진 (Gemini)</Link>
      </nav>

      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ color: '#4facfe' }}>🚀 Gemini 3.0 AI 도면 변환</h1>
        <p style={{ color: '#888' }}>변환이 완료되면 즉시 알려드립니다.</p>
      </div>

      <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {/* 왼쪽: 업로드 섹션 */}
        <div style={{ flex: 1, minWidth: '300px', backgroundColor: '#1a1a1a', padding: '2rem', borderRadius: '15px', border: '1px solid #333' }}>
          <div style={{ width: '100%', height: '300px', backgroundColor: '#000', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', border: '2px dashed #444', overflow: 'hidden' }}>
            {previewUrl ? <img src={previewUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{color:'#666'}}>이미지를 업로드하세요</span>}
          </div>
          <input type="file" id="ai-file-upload" style={{ display: 'none' }} onChange={handleFileChange} accept="image/*"/>
          <label htmlFor="ai-file-upload" style={{ display: 'block', width: '100%', padding: '15px', marginBottom: '20px', backgroundColor: '#2d2d2d', color: file ? '#4facfe' : '#ccc', border: file ? '2px solid #4facfe' : '2px dashed #555', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', fontWeight: 'bold' }}>
            {file ? `📄 ${file.name}` : "📁 도면 파일 선택"}
          </label>
          <button onClick={handleAiConvert} disabled={isLoading || !file} style={{ width: '100%', padding: '15px', backgroundColor: isLoading ? '#555' : '#4facfe', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', cursor: isLoading ? 'not-allowed' : 'pointer' }}>
            {isLoading ? 'AI 변환 중... (서버 알림 대기)' : 'AI 변환 시작하기'}
          </button>
        </div>

        {/* 오른쪽: 결과 섹션 */}
        <div style={{ flex: 1, minWidth: '300px', backgroundColor: '#1a1a1a', padding: '2rem', borderRadius: '15px', border: '1px solid #333' }}>
          <h3 style={{ color: '#2ecc71', marginBottom: '1rem' }}>📊 AI 추출 리포트</h3>
          {result ? (
            <div>
              <div style={{ backgroundColor: '#222', padding: '15px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '20px', border: '1px solid #333' }}>
                <p style={{color: '#2ecc71', marginBottom: '10px', fontWeight:'bold'}}>✅ 실시간 알림 수신 완료!</p>
                <pre style={{color: '#ccc', whiteSpace: 'pre-wrap'}}>{JSON.stringify(result.aiData.elements.slice(0, 5), null, 2)}</pre>
                <p style={{color: '#666', marginTop: '5px'}}>...외 다수 요소 추출됨</p>
              </div>
              <a href={result.dxfUrl} download style={{ display: 'block', textAlign: 'center', padding: '15px', backgroundColor: '#2ecc71', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
                📥 생성된 DXF 다운로드
              </a>
            </div>
          ) : (
            <div style={{ color: '#555', textAlign: 'center', marginTop: '50px' }}>
              <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>{isLoading ? '⏳' : '🤖'}</p>
              <p style={{ lineHeight: '1.6' }}>
                {isLoading ? '서버에서 AI가 도면을 분석 중입니다...\n완료되면 자동으로 화면이 바뀝니다!' : 'AI 변환 결과가\n여기에 표시됩니다.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}