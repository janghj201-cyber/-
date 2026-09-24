// 매장 컴퓨터 — 켜면 Dutyvo가 먼저 뜨게. index.html(매장 컴퓨터 메뉴)과 onboarding.html(시작 끝 화면)이 같이 쓴다.
// 윈도우: 설치 파일(.bat) — 브라우저 정책으로 앱 설치 + 로그인 시 자동 시작(관리자 권한 한 번)
// 맥: 터미널에 붙여 넣는 한 줄 — 로그인 항목(LaunchAgent)으로 크롬/엣지 앱 창을 연다. 관리자 암호 없이, 이 맥 사용자만
export function pcOS(){
  const ua=navigator.userAgent||'';
  if(/Windows/.test(ua))return 'win';
  // 아이패드도 Macintosh로 나온다 — 터치가 있으면 맥이 아니다
  if(/Macintosh|Mac OS X/.test(ua)&&!/iPhone|iPad/.test(ua)&&!((navigator.maxTouchPoints||0)>1))return 'mac';
  return 'other';
}

export function pcBat(kind){
  const origin=location.origin.replace(/\/$/,'');const url=origin+'/';const id=origin+'/index.html';
  const edge=/Edg\//.test(navigator.userAgent);
  const K=edge?'Microsoft\\Edge':'Google\\Chrome';
  const force='{\\"url\\":\\"'+url+'\\",\\"default_launch_container\\":\\"window\\",\\"create_desktop_shortcut\\":true}';
  const st='[{\\"manifest_id\\":\\"'+id+'\\",\\"run_on_os_login\\":\\"run_windowed\\"}]';
  const L=['@echo off','setlocal',
    'rem Dutyvo store PC: install as an app + run at Windows sign-in. Browser policy for this computer (all Windows accounts).',
    'net session >nul 2>&1',
    'if not "%errorlevel%"=="0" (',
    '  echo [Dutyvo] Administrator permission is needed. Click Yes on the next window.',
    '  powershell -NoProfile -Command "Start-Process -FilePath \'%~f0\' -Verb RunAs"',
    '  exit /b',
    ')'];
  if(kind==='install'){
    L.push(`reg add "HKLM\\Software\\Policies\\${K}\\WebAppInstallForceList" /v 1 /t REG_SZ /d "${force}" /f >nul`);
    L.push('if errorlevel 1 ( echo [Dutyvo] Failed to write the policy. & pause & exit /b 1 )');
    L.push(`reg add "HKLM\\Software\\Policies\\${K}" /v WebAppSettings /t REG_SZ /d "${st}" /f >nul`);
    L.push('if errorlevel 1 ( echo [Dutyvo] Failed to write the policy. & pause & exit /b 1 )');
    L.push(`echo [Dutyvo] Done for ${edge?'Edge':'Chrome'}. Close the browser completely and open it again -`);
    L.push('echo          Dutyvo installs as an app, starts at sign-in, and gets a desktop icon.');
    // 전에 만든 바로가기 방식(시작 프로그램 V-Flow.lnk)이 남아 있으면 창이 둘 뜬다 — 같이 지운다
    L.push('del "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\V-Flow.lnk" >nul 2>&1');
    L.push('set BR=');
    if(edge){
      L.push('if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BR=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"');
      L.push('if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BR=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"');
    } else {
      L.push('if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BR=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"');
      L.push('if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BR=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"');
      L.push('if exist "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" set "BR=%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"');
    }
    L.push(`if not "%BR%"=="" start "" "%BR%" "${url}?pc=1"`);
  } else {
    for(const k of ['Microsoft\\Edge','Google\\Chrome']){
      L.push(`reg delete "HKLM\\Software\\Policies\\${k}\\WebAppInstallForceList" /f >nul 2>&1`);
      L.push(`reg delete "HKLM\\Software\\Policies\\${k}" /v WebAppSettings /f >nul 2>&1`);
      L.push(`reg delete "HKCU\\Software\\Policies\\${k}\\WebAppInstallForceList" /f >nul 2>&1`);
      L.push(`reg delete "HKCU\\Software\\Policies\\${k}" /v WebAppSettings /f >nul 2>&1`);
    }
    L.push('echo [Dutyvo] Removed. Open the browser again - the app and auto-start are gone.');
  }
  L.push('pause');
  const blob=new Blob([L.join('\r\n')+'\r\n'],{type:'application/octet-stream'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=kind==='install'?`vflow-pc-install-${edge?'edge':'chrome'}.bat`:'vflow-pc-remove.bat';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);
}

// 맥 한 줄 명령. kind: 'install' | 'remove'. 지금 쓰는 브라우저(엣지면 엣지)를 먼저, 없으면 다른 쪽
export function pcMacCmd(kind){
  const url=location.origin.replace(/\/$/,'')+'/?pc=1';
  const L='kr.dutyvo.storepc',P='"$HOME/Library/LaunchAgents/'+L+'.plist"';
  if(kind==='remove')return `launchctl remove ${L} 2>/dev/null; rm -f ${P}; echo "[Dutyvo] 자동 시작을 껐습니다"`;
  const first=/Edg\//.test(navigator.userAgent)?'Microsoft Edge':'Google Chrome',second=first==='Google Chrome'?'Microsoft Edge':'Google Chrome';
  const plist=['<?xml version="1.0" encoding="UTF-8"?>','<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict><key>Label</key><string>'+L+'</string>',
    '<key>ProgramArguments</key><array><string>/usr/bin/open</string><string>-na</string><string>\'"$B"\'</string><string>--args</string><string>--app='+url+'</string></array>',
    '<key>RunAtLoad</key><true/></dict></plist>'];
  return `B="${first}"; [ -d "/Applications/$B.app" ] || B="${second}"; if [ ! -d "/Applications/$B.app" ]; then echo "[Dutyvo] 크롬이나 엣지를 먼저 설치하세요"; else mkdir -p "$HOME/Library/LaunchAgents" && printf '%s\\n' ${plist.map(x=>"'"+x+"'").join(' ')} > ${P} && open -na "$B" --args "--app=${url}" && echo "[Dutyvo] 끝 — 다음부터 이 맥을 켜면 Dutyvo가 먼저 뜹니다"; fi`;
}
// 복사 — 안 되면 false (그땐 화면에 명령을 보여 준다)
export async function pcCopy(text){try{await navigator.clipboard.writeText(text);return true;}catch(e){return false;}}
