import { useEffect, useState } from 'react';

// 画面の形で配置を切り替える（横長：1画面、縦長：スクロール）
export function useLayoutMode() {
    const get = () => {
        const w = window.innerWidth, h = window.innerHeight;
        return (w >= 900 && h >= 500) || (w >= 640 && w > h * 1.2) ? 'wide' : 'compact';
    };
    const [mode, setMode] = useState(get);
    useEffect(() => {
        const on = () => setMode(get());
        window.addEventListener('resize', on);
        return () => window.removeEventListener('resize', on);
    }, []);
    return mode;
}

