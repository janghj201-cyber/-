import subprocess, json, sys

ps_cmd = r"""
$raw = [Console]::In.ReadToEnd()
$d = $raw | ConvertFrom-Json
$fp = $d.tool_input.file_path
Write-Host "파일 경로: $fp"
if ($fp -like "C:\wevape\*") {
    Write-Host "C:\wevape 감지 - git 실행"
    Set-Location "C:\wevape"
    git add -A
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        $msg = "자동 커밋: " + (Get-Date -Format "yyyy-MM-dd HH:mm")
        git commit -m $msg
        git push origin HEAD
    } else {
        Write-Host "변경사항 없음, 스킵"
    }
} else {
    Write-Host "대상 외 경로, 스킵"
}
"""

payload = json.dumps({
    "tool_name": "Edit",
    "tool_input": {"file_path": r"C:\wevape\wevape_monthly.py"}
})

p = subprocess.Popen(
    ["powershell.exe", "-NoProfile", "-Command", ps_cmd],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT
)
out, _ = p.communicate(payload.encode("utf-8"))
sys.stdout.buffer.write(out)
sys.stdout.buffer.write(b"\nExit code: " + str(p.returncode).encode())
