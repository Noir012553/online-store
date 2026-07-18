import { DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { SelectedDetail } from './useStatisticsDetail';

interface StatisticsDetailHeaderProps {
  selectedDetail: SelectedDetail | null;
  title: string;
  subtitle: string | React.ReactNode;
}

export function StatisticsDetailHeader({ selectedDetail, title, subtitle }: StatisticsDetailHeaderProps) {
  if (!selectedDetail) return null;

  return (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{subtitle}</DialogDescription>
    </DialogHeader>
  );
}
