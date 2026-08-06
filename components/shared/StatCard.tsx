'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  gradient: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, gradient, trend }) => {
  const { t } = useLanguage();
  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200 hover:shadow-lg transition-all duration-300">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-slate-900 mb-2">{value}</h3>
          {trend && (
            <div className={`flex items-center gap-1 text-sm ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              <span className="font-medium">{trend.value}</span>
              <span className="text-slate-500">{t('admin.dashboard.vsLastMonth')}</span>
            </div>
          )}
        </div>
        <div className={`p-4 rounded-xl ${gradient}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
};
