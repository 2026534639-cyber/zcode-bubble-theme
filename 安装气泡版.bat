@echo off
title ZCode 气泡主题 - 安装
echo ================================================
echo   ZCode 气泡主题安装（网页版同款浅蓝气泡）
echo.
echo   第 1 步：先完全退出 ZCode（右下角托盘图标
echo           也要右键退出，否则装不了）
echo   第 2 步：回到本窗口按 Y 继续
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
node install-core.cjs install
if errorlevel 1 (
  echo.
  echo [失败] 安装没成功。请检查上方报错信息。
) else (
  echo.
  echo [成功] 已装好！现在可以打开 ZCode 看效果了。
  echo        不喜欢随时双击「还原原版.bat」退回。
)
echo.
pause
exit /b 0
:cancel
echo 已取消，什么都没改。
pause
