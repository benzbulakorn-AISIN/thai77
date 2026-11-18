import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, message, confirmText = 'ยืนยัน', danger, busy, onConfirm, onCancel }: Props) {
  return (
    <BottomSheet open={open} onClose={onCancel} title={title}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onCancel} className="border border-line">ยกเลิก</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{busy ? 'กำลังทำ…' : confirmText}</Button>
        </div>
      }>
      <p className="whitespace-pre-line text-sm">{message}</p>
    </BottomSheet>
  );
}
