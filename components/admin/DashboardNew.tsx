'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { motion } from 'framer-motion';
import {
  Users,
  BookOpen,
  Building2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  Award,
  Clock
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useLanguage } from '@/contexts/LanguageContext';

interface DashboardStats {
  totalUsers: number;
  totalCourses: number;
  totalDepartments: number;
  totalStaff: number;
  totalSalary: number;
  usersByRole: { name: string; value: number; color: string }[];
  coursesByLevel: { name: string; value: number }[];
  monthlyData: { month: string; users: number; courses: number; revenue: number }[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const DashboardNew: React.FC = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalCourses: 0,
    totalDepartments: 0,
    totalStaff: 0,
    totalSalary: 0,
    usersByRole: [],
    coursesByLevel: [],
    monthlyData: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [t]);

  const loadStats = async () => {
    try {
      setLoading(true);

      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users = usersSnapshot.docs.map(doc => doc.data());

      const coursesSnapshot = await getDocs(collection(db, 'courses'));
      const courses = coursesSnapshot.docs.map(doc => doc.data());

      const departmentsSnapshot = await getDocs(collection(db, 'departments'));

      const staffCount = users.filter(u => u.role === 'staff').length;
      const adminCount = users.filter(u => u.role === 'admin').length;

      const totalSalary = users
        .filter(u => u.role === 'staff' && u.monthlySalary)
        .reduce((sum, u) => sum + (u.monthlySalary || 0), 0);

      const usersByRole = [
        { name: t('admin.dashboard.totalStaff'), value: staffCount, color: '#3b82f6' },
        { name: t('admin.users.roles.admin'), value: adminCount, color: '#ef4444' }
      ].filter(item => item.value > 0);

      const coursesByLevel = [
        { name: t('admin.dashboard.levelBeginner'), value: courses.filter(c => c.level === 'beginner').length },
        { name: t('admin.dashboard.levelIntermediate'), value: courses.filter(c => c.level === 'intermediate').length },
        { name: t('admin.dashboard.levelAdvanced'), value: courses.filter(c => c.level === 'advanced').length }
      ];

      const monthlyData = [
        { month: t('admin.dashboard.monthShort', { n: 1 }), users: 45, courses: 12, revenue: 15000000 },
        { month: t('admin.dashboard.monthShort', { n: 2 }), users: 52, courses: 15, revenue: 18000000 },
        { month: t('admin.dashboard.monthShort', { n: 3 }), users: 61, courses: 18, revenue: 22000000 },
        { month: t('admin.dashboard.monthShort', { n: 4 }), users: 70, courses: 20, revenue: 25000000 },
        { month: t('admin.dashboard.monthShort', { n: 5 }), users: 85, courses: 24, revenue: 30000000 },
        { month: t('admin.dashboard.monthShort', { n: 6 }), users: users.length, courses: courses.length, revenue: totalSalary }
      ];

      setStats({
        totalUsers: users.length,
        totalCourses: courses.length,
        totalDepartments: departmentsSnapshot.size,
        totalStaff: staffCount,
        totalSalary,
        usersByRole,
        coursesByLevel,
        monthlyData
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({
    title,
    value,
    icon: Icon,
    color,
    trend,
    trendValue
  }: {
    title: string;
    value: string | number;
    icon: any;
    color: string;
    trend?: 'up' | 'down';
    trendValue?: string;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-[#5e3ed0]/20 backdrop-blur-md rounded-2xl p-6 border border-white/10 hover:bg-[#5e3ed0]/30 transition-all duration-300 hover:shadow-lg hover:shadow-[#1B7A1E]/10"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-300 mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-white mb-2">{value}</h3>
          {trend && trendValue && (
            <div className={`flex items-center gap-1 text-sm ${trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
              {trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <span className="font-medium">{trendValue}</span>
              <span className="text-slate-400">{t('admin.dashboard.vsLastMonth')}</span>
            </div>
          )}
        </div>
        <div className={`p-4 rounded-xl ${color} bg-opacity-20`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </motion.div>
  );

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#1B7A1E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-300">{t('admin.dashboard.loadingData')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-white mb-2">{t('admin.dashboard.titleAlt')}</h1>
        <p className="text-slate-300">{t('admin.dashboard.managementOverview')}</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title={t('admin.dashboard.totalUsers')}
          value={stats.totalUsers}
          icon={Users}
          color="bg-blue-500"
          trend="up"
          trendValue="+12%"
        />
        <StatCard
          title={t('admin.dashboard.courses')}
          value={stats.totalCourses}
          icon={BookOpen}
          color="bg-green-500"
          trend="up"
          trendValue="+8%"
        />
        <StatCard
          title={t('admin.dashboard.totalDepartments')}
          value={stats.totalDepartments}
          icon={Building2}
          color="bg-purple-500"
        />
        <StatCard
          title={t('admin.dashboard.totalSalary')}
          value={`${(stats.totalSalary / 1000000).toFixed(1)}M`}
          icon={DollarSign}
          color="bg-orange-500"
          trend="up"
          trendValue="+5%"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-[#5e3ed0]/20 backdrop-blur-md rounded-2xl p-6 border border-white/10 hover:border-[#1B7A1E]/30 transition-colors"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-500/20 rounded-xl">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-slate-300">{t('admin.dashboard.totalStaff')}</p>
              <p className="text-2xl font-bold text-white">{stats.totalStaff}</p>
            </div>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${stats.totalStaff > 0 ? (stats.totalStaff / stats.totalUsers) * 100 : 0}%` }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-[#5e3ed0]/20 backdrop-blur-md rounded-2xl p-6 border border-white/10 hover:border-[#1B7A1E]/30 transition-colors"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-red-500/20 rounded-xl">
              <Award className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-slate-300">{t('admin.users.roles.admin')}</p>
              <p className="text-2xl font-bold text-white">{stats.totalUsers - stats.totalStaff}</p>
            </div>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 rounded-full"
              style={{ width: `${stats.totalUsers > 0 ? ((stats.totalUsers - stats.totalStaff) / stats.totalUsers) * 100 : 0}%` }}
            />
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-[#5e3ed0]/20 backdrop-blur-md rounded-2xl p-6 border border-white/10"
        >
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-5 h-5 text-[#1B7A1E]" />
            <h3 className="text-lg font-bold text-white">{t('admin.dashboard.monthlyGrowth')}</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={stats.monthlyData}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCourses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="month" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e1b4b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: 'white'
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="users"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorUsers)"
                name={t('admin.dashboard.users')}
              />
              <Area
                type="monotone"
                dataKey="courses"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorCourses)"
                name={t('admin.dashboard.courses')}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-[#5e3ed0]/20 backdrop-blur-md rounded-2xl p-6 border border-white/10"
        >
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-bold text-white">{t('admin.dashboard.userDistribution')}</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats.usersByRole}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {stats.usersByRole.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e1b4b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: 'white'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-[#5e3ed0]/20 backdrop-blur-md rounded-2xl p-6 border border-white/10"
        >
          <div className="flex items-center gap-3 mb-6">
            <BookOpen className="w-5 h-5 text-green-400" />
            <h3 className="text-lg font-bold text-white">{t('admin.dashboard.coursesByLevel')}</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.coursesByLevel}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e1b4b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: 'white'
                }}
              />
              <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-[#5e3ed0]/20 backdrop-blur-md rounded-2xl p-6 border border-white/10"
        >
          <div className="flex items-center gap-3 mb-6">
            <DollarSign className="w-5 h-5 text-orange-400" />
            <h3 className="text-lg font-bold text-white">{t('admin.dashboard.monthlyRevenue')}</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="month" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e1b4b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: 'white'
                }}
                formatter={(value: number) => `${(value / 1000000).toFixed(1)}M`}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#f97316"
                strokeWidth={3}
                dot={{ fill: '#f97316', r: 6 }}
                name={t('admin.dashboard.revenue')}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="mt-8 bg-[#5e3ed0]/20 backdrop-blur-md rounded-2xl p-6 border border-white/10"
      >
        <div className="flex items-center gap-3 mb-6">
          <Clock className="w-5 h-5 text-slate-300" />
          <h3 className="text-lg font-bold text-white">{t('admin.dashboard.recentActivity')}</h3>
        </div>
        <div className="space-y-4">
          {[
            { action: t('admin.dashboard.activityAddCourse'), detail: 'React Advanced', time: t('admin.dashboard.minutesAgo', { n: 5 }), color: 'bg-green-500/20 text-green-400' },
            { action: t('admin.dashboard.activityNewUser'), detail: 'Nguyễn Văn A', time: t('admin.dashboard.minutesAgo', { n: 15 }), color: 'bg-blue-500/20 text-blue-400' },
            { action: t('admin.dashboard.activityUpdateSalary'), detail: 'Phòng Kỹ thuật', time: t('admin.dashboard.hoursAgo', { n: 1 }), color: 'bg-orange-500/20 text-orange-400' },
            { action: t('admin.dashboard.activityAddDepartment'), detail: 'Phòng Marketing', time: t('admin.dashboard.hoursAgo', { n: 2 }), color: 'bg-purple-500/20 text-purple-400' }
          ].map((activity, index) => (
            <div key={index} className="flex items-center gap-4 p-4 hover:bg-white/5 rounded-xl transition-colors border border-transparent hover:border-white/5">
              <div className={`w-2 h-2 rounded-full ${activity.color.split(' ')[0].replace('/20', '')}`} />
              <div className="flex-1">
                <p className="font-medium text-white">{activity.action}</p>
                <p className="text-sm text-slate-300">{activity.detail}</p>
              </div>
              <span className="text-sm text-slate-400">{activity.time}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
