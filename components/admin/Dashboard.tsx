'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Users, BookOpen, Building2, DollarSign, TrendingUp, Activity } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export const Dashboard: React.FC = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCourses: 0,
    totalDepartments: 0,
    totalStaff: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);

      const usersSnapshot = await getDocs(collection(db, 'users'));
      const coursesSnapshot = await getDocs(collection(db, 'courses'));
      const departmentsSnapshot = await getDocs(collection(db, 'departments'));

      const users = usersSnapshot.docs.map(doc => doc.data());
      const staffCount = users.filter(u => u.role === 'staff').length;

      setStats({
        totalUsers: usersSnapshot.size,
        totalCourses: coursesSnapshot.size,
        totalDepartments: departmentsSnapshot.size,
        totalStaff: staffCount,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: t('admin.dashboard.totalUsers'), value: stats.totalUsers, icon: Users, color: 'blue' },
    { label: t('admin.dashboard.courses'), value: stats.totalCourses, icon: BookOpen, color: 'green' },
    { label: t('admin.dashboard.totalDepartments'), value: stats.totalDepartments, icon: Building2, color: 'purple' },
    { label: t('admin.dashboard.totalStaff'), value: stats.totalStaff, icon: DollarSign, color: 'orange' },
  ];

  const colorClasses = {
    blue: 'bg-blue-500/20 text-blue-400',
    green: 'bg-green-500/20 text-green-400',
    purple: 'bg-purple-500/20 text-purple-400',
    orange: 'bg-orange-500/20 text-orange-400',
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">{t('admin.dashboard.systemOverview')}</h1>
        <p className="text-slate-300">{t('admin.dashboard.systemOverviewDesc')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-[#5e3ed0]/20 rounded-xl p-6 border border-white/10 shadow-sm hover:bg-[#5e3ed0]/30 transition-colors backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${colorClasses[stat.color as keyof typeof colorClasses]}`}>
                  <Icon size={24} />
                </div>
                {loading ? (
                  <div className="w-12 h-12 border-4 border-white/10 border-t-white/50 rounded-full animate-spin"></div>
                ) : (
                  <span className="text-3xl font-bold text-white">{stat.value}</span>
                )}
              </div>
              <h3 className="text-slate-300 font-medium">{stat.label}</h3>
            </div>
          );
        })}
      </div>

      {/* Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#5e3ed0]/20 rounded-xl p-6 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="text-blue-400" size={24} />
            <h2 className="text-xl font-bold text-white">{t('admin.dashboard.recentActivity')}</h2>
          </div>
          <div className="text-center py-12 text-slate-400">
            <p>{t('admin.dashboard.noActivity')}</p>
          </div>
        </div>

        <div className="bg-[#5e3ed0]/20 rounded-xl p-6 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="text-green-400" size={24} />
            <h2 className="text-xl font-bold text-white">{t('admin.dashboard.weeklyStats')}</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">{t('admin.dashboard.newUsers')}</span>
              <span className="font-bold text-white">0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">{t('admin.dashboard.newCourses')}</span>
              <span className="font-bold text-white">0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">{t('admin.dashboard.completed')}</span>
              <span className="font-bold text-white">0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
