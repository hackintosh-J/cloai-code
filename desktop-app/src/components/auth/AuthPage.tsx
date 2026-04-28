import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { isDesktopApp } from '@/src/desktop';

const Auth = () => {
  const navigate = useNavigate();

  const isDesktop = isDesktopApp();

  useEffect(() => {
    localStorage.setItem('user_mode', 'selfhosted');
    if (isDesktop) {
      navigate('/', { replace: true });
    }
  }, [isDesktop, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F8F6] font-sans relative">
      <button
        onClick={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate('/');
        }}
        className="absolute top-6 left-6 flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#747474] hover:text-[#222] hover:bg-black/5 rounded-md transition-colors"
      >
        <ArrowLeft size={16} />
        返回
      </button>
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-sm border border-[#E5E5E5]">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif-claude text-[#222] mb-2">cloai</h1>
          <p className="text-[#747474]">桌面端仅保留自托管模式</p>
        </div>

        <div className="space-y-4 text-sm text-[#5F5B53] leading-6">
          <p>托管账号登录、注册、找回密码等入口已经从桌面端移除。</p>
          <p>当前版本默认直接进入自托管流程，请在设置页配置你自己的 API 地址、Key 和模型。</p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="mt-6 w-full py-2.5 bg-[#CC7C5E] hover:bg-[#B96B4E] text-white font-medium rounded-lg transition-colors"
        >
          返回应用
        </button>
      </div>
    </div>
  );
};

export default Auth;
