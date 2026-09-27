@echo off
title ZCode 气泡主题 - 还原官方原版
echo ================================================
echo   还原官方原版（撤销气泡主题）
echo.
echo   先完全退出 ZCode（托盘图标也要退），再按 Y
echo ================================================
choice /C YN /M "确认 ZCode 已经完全退出了吗"
if errorlevel 2 goto :cancel
cd /d "%~dp0"
if not exist node_modules (
  echo 首次运行，正在安装依赖（需联网，约十几秒）...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [失败] 依赖安装失败，请确认已安装 Node.js 后重试。
    pause
    exit /b 1
  )
)
node install-core.cjs restore
if errorlevel 1 (
  echo.
  echo [失败] 还原没成功。请检查上方报错信息。
) else (
  echo.
  echo [成功] 已还原官方原版。可以打开 ZCode 了。
)
echo.
pause
exit /b 0
:cancel
echo 已取消，什么都没改。
pause
