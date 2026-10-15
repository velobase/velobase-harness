"use client";

import React from "react";

/**
 * WelcomeView - 用于新会话（无会话ID时）
 * 显示品牌 slogan，营造欢迎氛围
 */
export function WelcomeView() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        {/* Main branding - minimal */}
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
          <span className="text-foreground">Chat.</span>{" "}
          <span className="text-primary">Simply.</span>
        </h1>
      </div>
    </div>
  );
}

