/**
 * درج Lens: الدرج الموحّد `AppSheet` مع رأس Lens. كل أدراج Lens (النتائج، OCEREX،
 * المساعدة، السجل) تمرّ من هنا، فيكون لها كلها الحركة والسحب والإغلاق نفسه.
 */
import type { ReactNode } from 'react';

import { AppSheet } from '@/design/sheet/AppSheet';
import { SheetHeader } from '@/design/sheet/SheetHeader';

export interface LensDrawerProps {
  title: string;
  subtitle?: string;
  /** يُستدعى لكل طلب إغلاق (السحب، الظل، الزر، الرجوع). المالك يحدّث `open`. */
  onClose: () => void;
  /** يُستدعى بعد انتهاء حركة الإغلاق، فيُزال المحتوى. */
  onClosed?: () => void;
  open: boolean;
  children: ReactNode;
}

export function LensDrawer({ title, subtitle, onClose, onClosed, open, children }: LensDrawerProps) {
  return (
    <AppSheet
      open={open}
      onDismiss={onClose}
      onClosed={onClosed}
      header={<SheetHeader title={title} subtitle={subtitle} onClose={onClose} />}
    >
      {children}
    </AppSheet>
  );
}
