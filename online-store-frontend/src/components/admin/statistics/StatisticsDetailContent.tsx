import React from 'react';
import { SelectedDetail, DetailFormState } from './useStatisticsDetail';

interface StatisticsDetailContentProps {
  selectedDetail: SelectedDetail | null;
  detailMode: 'view' | 'edit';
  detailForm: DetailFormState | null;
  children: React.ReactNode;
}

export function StatisticsDetailContent({
  selectedDetail,
  detailMode,
  detailForm,
  children,
}: StatisticsDetailContentProps) {
  if (!selectedDetail) return null;

  return <div className="space-y-4 text-sm text-gray-700">{children}</div>;
}
