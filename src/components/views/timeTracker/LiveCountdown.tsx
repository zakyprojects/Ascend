import React, { useState, useEffect } from 'react';

interface LiveCountdownProps {
  endTime: string; // "HH:mm" in 24h format (e.g. "17:30")
  className?: string;
}

function calculateSecondsRemaining(endTimeStr: string): number {
  if (!endTimeStr) return 0;
  const now = new Date();
  const currentTotalSeconds =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const parts = endTimeStr.split(':');
  if (parts.length !== 2) return 0;
  const endH = parseInt(parts[0], 10);
  const endM = parseInt(parts[1], 10);
  if (isNaN(endH) || isNaN(endM)) return 0;

  const endTotalSeconds = endH * 3600 + endM * 60;
  return Math.max(0, endTotalSeconds - currentTotalSeconds);
}

export function LiveCountdown({ endTime, className = '' }: LiveCountdownProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() =>
    calculateSecondsRemaining(endTime)
  );

  useEffect(() => {
    // Initial compute
    setSecondsRemaining(calculateSecondsRemaining(endTime));

    const interval = setInterval(() => {
      setSecondsRemaining(calculateSecondsRemaining(endTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime]);

  if (secondsRemaining <= 0) {
    return <span className={className}>0s remaining</span>;
  }

  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${seconds}s`);

  return <span className={className}>{parts.join(' ')} remaining</span>;
}
