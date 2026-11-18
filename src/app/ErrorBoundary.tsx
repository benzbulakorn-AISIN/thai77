import { Component, type ErrorInfo, type ReactNode } from 'react';

type State = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // log without personal data
    console.error('[thai77] UI error:', error.message, info.componentStack?.split('\n')[1]);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold">เกิดข้อผิดพลาด</h1>
        <p className="text-sm opacity-70">ลองโหลดหน้าใหม่อีกครั้ง</p>
        <button type="button" className="min-h-12 rounded-xl bg-sky-700 px-6 text-white"
          onClick={() => { window.location.hash = '#/'; window.location.reload(); }}>
          กลับหน้าแรก
        </button>
      </div>
    );
  }
}
