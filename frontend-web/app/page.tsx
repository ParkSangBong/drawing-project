'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

export default function Home() {
  // 소켓 객체를 담을 상태 (재연결 방지용)
  const [socket, setSocket] = useState<any>(null);

  // 1. 미리보기 이미지 경로를 담을 상태 추가
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [drawings, setDrawings] = useState([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // a. 슬라이더 상태 관리
  const [blockSize, setBlockSize] = useState(11);
  const [cValue, setCValue] = useState(2);
  const [editingId, setEditingId] = useState<number | null>(null); // 현재 편집 중인 도면 ID

  // b. 슬라이더 값이 바뀔 때마다 서버에 알리는 함수 (Socket 이용)
  // const emitAdjust = (newBlockSize: number, newCValue: number) => {
  //   // 편집 중인 아이디가 없으면 일단 24번(테스트용)으로 고정하거나 로직 추가
  //   const currentId = editingId || 24; 

  //   if (socket) {
  //     console.log("📤 서버로 파라미터 전송:", { drawingId: currentId, blockSize: newBlockSize, cValue: newCValue });
      
  //     // 서버에 'adjustParameters'라는 이름으로 신호를 보냅니다.
  //     socket.emit('adjustParameters', {
  //       drawingId: currentId,
  //       blockSize: newBlockSize,
  //       cValue: newCValue,
  //       mode: 'PREVIEW'
  //     });
  //   }
  // };
  // 1. emitAdjust 함수 수정 (mode 인자 추가 및 안정성 강화)
  const emitAdjust = (newBlockSize: number, newCValue: number, mode: string = 'PREVIEW') => {
    if (!editingId && mode === 'PREVIEW') return; // ID 없으면 무시

    if (socket) {
      socket.emit('adjustParameters', {
        drawingId: editingId,
        blockSize: newBlockSize,
        cValue: newCValue,
        mode: mode
      });
    }
  };

  // 1. 도면 목록 불러오기
  const fetchDrawings = async () => {
    const res = await axios.get('http://localhost:3000/drawings');
    setDrawings(res.data);
  };

  // useEffect(() => {
  //   fetchDrawings();
  //   // 3초마다 상태를 새로고침 (실시간 느낌)
  //   const timer = setInterval(fetchDrawings, 3000);
  //   return () => clearInterval(timer);
  // }, []);

  const handleFinalSave = () => {
    if (!editingId || !socket) return;
    
    alert('최종 CAD 변환을 시작합니다. 잠시만 기다려주세요!');
    
    // 서버에 'FINAL' 모드로 요청 보냄
    socket.emit('adjustParameters', {
      drawingId: editingId,
      blockSize: blockSize,
      cValue: cValue,
      mode: 'FINAL' // 이제 PREVIEW가 아닌 FINAL입니다!
    });
  };

  useEffect(() => {
    fetchDrawings(); // 처음 들어왔을 때 목록 가져오기

    // 2. 웹소켓 연결 (백엔드 주소)
    const newSocket = io('http://localhost:3000');
    setSocket(newSocket);

    // [추가] 연결 성공 시 콘솔에 출력
    newSocket.on('connect', () => {
      console.log('✅ 서버와 소켓 연결 성공! ID:', newSocket.id);
    });

    // 3. 서버에서 'drawingUpdated'라는 신호가 오면 실행
    newSocket.on('drawingUpdated', (data) => {
      console.log('실시간 업데이트 수신:', data);
      fetchDrawings(); // 목록을 새로고침합니다!
    });

    // [추가 예정] 서버가 "미리보기 이미지 다 됐어!"라고 할 때
    newSocket.on('previewReady', (data) => {
      console.log('🖼️ 미리보기 업데이트!', data.previewUrl);
      // data.previewUrl이 "uploads/filename_preview.png" 형태라면 앞에 도메인을 붙여줍니다.
      const fullUrl = `http://localhost:3000/${data.previewUrl}?t=${Date.now()}`;
      setProcessedPreview(fullUrl);
    });

    // 4. Cleanup: 페이지 나갈 때 연결 끊기 (폴링 타이머 제거됨!)
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

  // 2. 도면 업로드 함수
  // const handleUpload = async () => {
  //   if (!file) return;
  //   const formData = new FormData();
  //   formData.append('file', file);

  //   try {
  //     await axios.post('http://localhost:3000/drawings/upload', formData);
  //     // alert('도면이 접수되었습니다!');
  //     fetchDrawings();
  //   } catch (e) {
  //     console.error('업로드 실패', e);
  //   }
  // };
  // const handleUpload = async () => {
  //   if (!file) return;
  //   const formData = new FormData();
  //   formData.append('file', file);
  
  //   try {
  //     const res = await axios.post('http://localhost:3000/drawings/upload', formData);
      
  //     // 백엔드 응답에서 받은 새 ID (DrawingsService에서 보낸 drawingId)
  //     const newId = res.data.drawingId; 
      
  //     // ✅ 새 도면을 즉시 편집 대상으로 설정!
  //     setEditingId(newId);
  //     setProcessedPreview(null);
      
  //     fetchDrawings();
  //   } catch (e) {
  //     console.error('업로드 실패', e);
  //   }
  // };
  // 2. handleUpload 함수 수정 (업로드 성공 즉시 미리보기 신호 쏘기)
  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('http://localhost:3000/drawings/upload', formData);
      const newId = res.data.drawingId; 
      
      setEditingId(newId);
      setProcessedPreview(null);
      fetchDrawings();

      // 🚀 추가: 업로드 완료 직후 서버에 미리보기 생성 신호를 보냅니다.
      // 약간의 딜레이를 주어 DB 저장이 확실히 완료된 후 요청하게 합니다.
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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'COMPLETED': return { color: '#2ecc71', bg: '#eafaf1', text: '변환 완료' };
      case 'PENDING': return { color: '#f39c12', bg: '#fef5e7', text: '변환 중...' };
      default: return { color: '#7f8c8d', bg: '#f4f6f7', text: '대기 중' };
    }
  };

  // const getDxfUrl = (originalUrl: string) => {
  //   // 확장자만 .dxf로 교체하는 함수
  //   const lastDotIndex = originalUrl.lastIndexOf('.');
  //   const basePath = originalUrl.substring(0, lastDotIndex);
  //   return `http://localhost:3000/${basePath}.dxf`;
  // };
  const getDxfUrl = (originalUrl: string) => {
    const lastDotIndex = originalUrl.lastIndexOf('.');
    const basePath = originalUrl.substring(0, lastDotIndex);
    
    // 🚀 파일 경로 뒤에 현재 시간을 붙여서 캐시를 강제로 무효화합니다.
    return `http://localhost:3000/${basePath}.dxf?t=${Date.now()}`;
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

      {/* 3. 슬라이더 편집 패키지 (UI) */}
      <div className="mt-8 p-6 bg-gray-900 rounded-xl border border-gray-700">
        <h2 className="text-xl font-bold mb-4 text-white">🛠️ 실시간 도면 보정 편집기</h2>
        
        {/* [추가] 실시간 보정 결과 출력 영역 */}
        <div style={{ 
          width: '100%', 
          height: '400px', // 좀 더 크게 봅니다
          backgroundColor: '#000', 
          borderRadius: '12px', 
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid #444',
          overflow: 'hidden'
        }}>
          {processedPreview ? (
            <img 
              src={processedPreview} 
              alt="보정 결과" 
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#666' }}>
              <p>슬라이더를 조작하면 보정된 이미지가 여기에 나타납니다.</p>
              <p style={{ fontSize: '0.8rem' }}>(현재 ID: {editingId || '선택 안 됨'})</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* 격자 제거 (Block Size) 슬라이더 */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              격자/노이즈 제거 강도 (Block Size): {blockSize}
            </label>
            <input 
              type="range" min="3" max="99" step="2" 
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              value={blockSize}
              onChange={(e) => {
                const val = Number(e.target.value);
                setBlockSize(val);
                emitAdjust(val, cValue);
              }}
            />
          </div>

          {/* 선명도 (C Value) 슬라이더 */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              선명도 세부 조절 (C Value): {cValue}
            </label>
            <input 
              type="range" min="0" max="20" 
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              value={cValue}
              onChange={(e) => {
                const val = Number(e.target.value);
                setCValue(val);
                emitAdjust(blockSize, val);
              }}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button 
            onClick={handleFinalSave}
            style={{
              padding: '12px 24px',
              backgroundColor: '#2ecc71', // 초록색 (저장/완료 의미)
              color: 'white',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              border: 'none'
            }}
          >
            💾 설정값으로 최종 DXF 저장
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
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                    {/* 다운로드 버튼 */}
                    {d.status === 'COMPLETED' ? (
                      <a href={getDxfUrl(d.originalUrl)} download style={{
                        color: 'white', backgroundColor: '#3498db', padding: '8px 16px', borderRadius: '4px',
                        textDecoration: 'none', fontSize: '0.85rem', fontWeight: 'bold'
                      }}>
                        CAD 파일 다운로드
                      </a>
                    ) : (
                      <span style={{ color: '#666', fontSize: '0.85rem' }}>처리 대기 중</span>
                    )}

                    {/* 🔥 보정 편집 버튼 (여기가 핵심!) */}
                    <button 
                      onClick={() => {
                        console.log(`🎯 편집 대상 변경: ${d.id}번 도면`); // 확인용 로그
                        setEditingId(d.id); // 편집 타겟 변경
                        setProcessedPreview(null); // 이전 미리보기 잔상 지우기
                        
                        // 버튼 누르자마자 서버에 현재 슬라이더 값으로 미리보기 요청 (선택 사항)
                        emitAdjust(blockSize, cValue); 
                      }}
                      style={{
                        padding: '8px 16px', backgroundColor: '#f39c12', color: 'white',
                        borderRadius: '4px', border: 'none', cursor: 'pointer',
                        fontSize: '0.85rem', fontWeight: 'bold'
                      }}
                    >
                      보정 편집
                    </button>
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