@echo off
rem 云笺开发环境启动脚本（配置 MSVC + Windows SDK 环境变量）

set MSVC_VER=14.44.35207
set WIN_SDK_VER=10.0.19041.0
set VS_ROOT=C:\Program Files\Microsoft Visual Studio\2022\Community
set SDK_ROOT=C:\Program Files (x86)\Windows Kits\10

rem 配置 PATH
set PATH=%VS_ROOT%\VC\Tools\MSVC\%MSVC_VER%\bin\Hostx64\x64;%SDK_ROOT%\bin\%WIN_SDK_VER%\x64;%PATH%

rem 配置 C/C++ 头文件路径
set INCLUDE=%VS_ROOT%\VC\Tools\MSVC\%MSVC_VER%\include;%SDK_ROOT%\Include\%WIN_SDK_VER%\ucrt;%SDK_ROOT%\Include\%WIN_SDK_VER%\shared;%SDK_ROOT%\Include\%WIN_SDK_VER%\um

rem 配置链接库路径
set LIB=%VS_ROOT%\VC\Tools\MSVC\%MSVC_VER%\lib\x64;%SDK_ROOT%\Lib\%WIN_SDK_VER%\ucrt\x64;%SDK_ROOT%\Lib\%WIN_SDK_VER%\um\x64

echo MSVC 环境已配置，正在启动云笺开发服务器...
pnpm tauri dev
