'use client';

import { useEffect, useRef } from 'react';

export default function CyberBackground({ subtle = false }: { subtle?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext('2d');
    if (!context) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, frame = 0, animation = 0;
    const pointer = { x: -1000, y: -1000 };
    const points = Array.from({ length: subtle ? 24 : 42 }, (_, index) => ({
      x: ((index * 73 + 19) % 101) / 101,
      y: ((index * 47 + 31) % 97) / 97,
      phase: index * 1.79,
    }));
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = element.clientWidth; height = element.clientHeight;
      element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };
    const draw = () => {
      context.clearRect(0, 0, width, height);
      const nodes = points.map((point) => ({
        x: point.x * width + (motion.matches ? 0 : Math.sin(frame * .006 + point.phase) * 12),
        y: point.y * height + (motion.matches ? 0 : Math.cos(frame * .005 + point.phase) * 12),
      }));
      nodes.forEach((node, index) => {
        nodes.slice(index + 1).forEach((other) => {
          const distance = Math.hypot(node.x - other.x, node.y - other.y);
          if (distance > 170) return;
          const nearPointer = Math.min(Math.hypot(node.x - pointer.x, node.y - pointer.y), Math.hypot(other.x - pointer.x, other.y - pointer.y)) < 160;
          context.strokeStyle = `rgba(93, 232, 205, ${(nearPointer ? .34 : .13) * (1 - distance / 190)})`;
          context.lineWidth = nearPointer ? 1.25 : .75;
          context.beginPath(); context.moveTo(node.x, node.y); context.lineTo(other.x, other.y); context.stroke();
        });
        const nearPointer = Math.hypot(node.x - pointer.x, node.y - pointer.y) < 130;
        context.fillStyle = nearPointer ? 'rgba(118,255,216,.8)' : 'rgba(113,202,217,.42)';
        context.beginPath(); context.arc(node.x, node.y, nearPointer ? 2.7 : 1.7, 0, Math.PI * 2); context.fill();
      });
    };
    const tick = () => { frame += 1; draw(); if (!motion.matches && !document.hidden) animation = requestAnimationFrame(tick); };
    const move = (event: PointerEvent) => { pointer.x = event.clientX; pointer.y = event.clientY; if (motion.matches) draw(); };
    const leave = () => { pointer.x = -1000; pointer.y = -1000; if (motion.matches) draw(); };
    const updateMotion = () => { cancelAnimationFrame(animation); draw(); if (!motion.matches) animation = requestAnimationFrame(tick); };
    const observer = new ResizeObserver(resize); observer.observe(element);
    window.addEventListener('pointermove', move); window.addEventListener('pointerout', leave);
    motion.addEventListener('change', updateMotion);
    resize(); updateMotion();
    return () => { observer.disconnect(); cancelAnimationFrame(animation); window.removeEventListener('pointermove', move); window.removeEventListener('pointerout', leave); motion.removeEventListener('change', updateMotion); };
  }, [subtle]);

  return <div className={`cyber-background${subtle ? ' cyber-background-subtle' : ''}`} aria-hidden="true">
    <canvas ref={canvas} />
    <span className="cyber-object planet planet-one" /><span className="cyber-object planet planet-two" />
    <span className="cyber-object rocket rocket-one">🚀</span><span className="cyber-object rocket rocket-two">🚀</span>
    <span className="cyber-object saucer">🛸</span><span className="cyber-object ethereum">Ξ</span>
    <span className="cyber-object microsoft-mark"><i /><i /><i /><i /></span>
    <span className="cyber-object linux-mark">🐧</span><span className="cyber-object apple-mark">●<i>⌁</i></span>
    <span className="cyber-object vendor-mark fortinet-mark">FORTINET</span>
    <span className="cyber-object vendor-mark sentinel-mark">SentinelOne</span>
  </div>;
}
