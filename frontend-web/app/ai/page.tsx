'use client';

import { useState } from 'react';
import axios from 'axios';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function AiPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    if (selectedFile) {
      setPreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  const handleAiConvert = async () => {
    if (!file) return;
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post(`${API_URL}/drawings/ai-convert`, formData);
      setResult(res.data);
    } catch (e) {
      console.error('AI 변환 실패', e);
      alert('AI 분석 중 오류가 발생했습니다.');
    } finally {
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
        <p style={{ color: '#888' }}>복잡한 설정 없이 AI가 직접 도면을 설계하고 생성합니다.</p>
      </div>

      <div style={{ display: 'flex', gap: '30px', justifyContent: 'center' }}>
        {/* 왼쪽: 업로드 섹션 */}
        <div style={{ flex: 1, backgroundColor: '#1a1a1a', padding: '2rem', borderRadius: '15px', border: '1px solid #333' }}>
          <div style={{ width: '100%', height: '300px', backgroundColor: '#000', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', border: '2px dashed #444' }}>
            {previewUrl ? <img src={previewUrl} style={{ maxWidth: '100%', maxHeight: '100%' }} /> : "이미지를 업로드하세요"}
          </div>
          <input 
            type="file" 
            id="ai-file-upload" 
            style={{ display: 'none' }} 
            onChange={handleFileChange} 
            accept="image/*"
          />
          <label 
            htmlFor="ai-file-upload" 
            style={{ 
              display: 'block', 
              width: '100%', 
              padding: '15px', 
              marginBottom: '20px',
              backgroundColor: '#2d2d2d', 
              color: file ? '#4facfe' : '#ccc', 
              border: file ? '2px solid #4facfe' : '2px dashed #555', 
              borderRadius: '8px', 
              textAlign: 'center', 
              cursor: 'pointer', 
              fontWeight: 'bold',
              transition: '0.3s'
            }}
          >
            {file ? `📄 ${file.name}` : "📁 클릭해서 도면 스케치 선택"}
          </label>
          <button 
            onClick={handleAiConvert} 
            disabled={isLoading || !file}
            style={{ width: '100%', padding: '15px', backgroundColor: '#4facfe', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {isLoading ? 'AI 분석 중...' : 'AI 변환 시작하기'}
          </button>
        </div>

        {/* 오른쪽: AI 분석 결과 */}
        <div style={{ flex: 1, backgroundColor: '#1a1a1a', padding: '2rem', borderRadius: '15px', border: '1px solid #333' }}>
          <h3 style={{ color: '#2ecc71' }}>📊 AI 추출 리포트</h3>
          {result ? (
            <div>
              <div style={{ backgroundColor: '#222', padding: '15px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '20px' }}>
                <pre>{JSON.stringify(result.aiData.elements.slice(0, 5), null, 2)}</pre>
                <p>...외 다수 요소 추출됨</p>
              </div>
              <a 
                href={`${API_URL}${result.dxfUrl}`} 
                download 
                style={{ display: 'block', textAlign: 'center', padding: '15px', backgroundColor: '#2ecc71', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}
              >
                📥 생성된 DXF 다운로드
              </a>
            </div>
          ) : (
            <div style={{ color: '#555', textAlign: 'center', marginTop: '50px' }}>
              <p style={{ fontSize: '3rem' }}>🤖</p>
              <p>AI가 분석을 완료하면<br/>여기에 도면 데이터가 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}