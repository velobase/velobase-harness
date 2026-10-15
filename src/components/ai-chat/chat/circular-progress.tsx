"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface CircularProgressProps {
  /**
   * Progress value (0-100)
   * If undefined, shows indeterminate animation
   */
  progress?: number;
  
  /**
   * Size of the circle in pixels
   */
  size?: number;
  
  /**
   * Stroke width in pixels
   */
  strokeWidth?: number;
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

export function CircularProgress({
  progress,
  size = 40,
  strokeWidth = 3,
  className,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = progress !== undefined 
    ? circumference - (progress / 100) * circumference 
    : 0;

  return (
    <div className={cn("relative inline-flex", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20 opacity-30"
        />
        
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(
            "text-primary transition-all duration-300 ease-out",
            progress === undefined && "animate-spin origin-center"
          )}
          style={{
            strokeDasharray: progress !== undefined ? circumference : `${circumference * 0.75} ${circumference * 0.25}`,
          }}
        />
      </svg>
    </div>
  );
}

